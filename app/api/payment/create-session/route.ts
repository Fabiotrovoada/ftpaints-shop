import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createSaleOrder, getSaleOrderLines, getPartnerByUid, createOdooDraftInvoice,
  OrderLineError, type OrderLineInput, type OdooInvoiceLine, jsonrpcCallKw,
} from '@/lib/odoo';
import { deliveryCost } from '@/lib/delivery';

interface OrderLine {
  product_id?: number;
  code: string;
  name: string;
  qty: number;
  price: number;
  colours?: Array<{ name?: string; code?: string; make?: string; model?: string; year?: string }>;
  colourName?: string;
  colourCode?: string;
}

interface SaleOrderLine {
  id: number;
  product_id?: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
  name: string;
}

const VAT_RATE = 1.2;

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, description, customerEmail, lines, reference, note, deliveryMethod, invoiceIds } = await req.json();

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('YOUR_KEY')) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any });

    let lineItems;
    let orderReference = reference || `ORD-${Date.now()}`;
    let orderMeta = '';
    let odooInvoiceId: number | undefined;
    let odooOrderId: number | undefined;
    let odooInvoiceIds: number[] | undefined;

    if (lines?.length) {
      // New order paid by card at checkout. The sale order and a draft invoice
      // are created here, up front, so there is something in Odoo for the
      // webhook to post and reconcile once Stripe confirms the payment — card
      // orders used to skip Odoo entirely, which is why paid orders never
      // showed up there. Prices, delivery and VAT are all computed server-side
      // so the Stripe charge and the Odoo invoice total always match exactly.
      const uid = session.user.uid;
      const clean: OrderLineInput[] = [];
      for (const l of lines as OrderLine[]) {
        const productId = Number(l?.product_id);
        const qty = Number(l?.qty);
        if (!Number.isInteger(productId) || productId <= 0) {
          return NextResponse.json({ error: 'That basket contains an item we do not recognise' }, { status: 400 });
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          return NextResponse.json({ error: 'Every item needs a quantity of at least 1' }, { status: 400 });
        }
        clean.push({
          productId, qty, name: l.name, price: l.price,
          colours: l.colours, colourName: l.colourName, colourCode: l.colourCode,
        });
      }

      const user = await getPartnerByUid(uid, '');
      const partnerId = (user?.partner_id as [number, string])?.[0];
      if (!partnerId) return NextResponse.json({ error: 'Partner not found' }, { status: 400 });

      const order = await createSaleOrder(uid, '', partnerId, clean, note || description);
      odooOrderId = order.id;
      orderReference = order.name || orderReference;

      const orderLines = (await getSaleOrderLines(uid, '', order.id)) as SaleOrderLine[];
      if (!orderLines.length) {
        throw new Error(`Order ${orderReference} was created but its lines could not be read back`);
      }

      const subtotal = orderLines.reduce((s, l) => s + l.price_unit * l.product_uom_qty, 0);
      const delivery = deliveryCost(deliveryMethod || 'standard', subtotal);

      lineItems = orderLines.map(l => ({
        price_data: {
          currency: 'gbp',
          product_data: { name: l.name.split('\n')[0].substring(0, 250) },
          unit_amount: Math.round(l.price_unit * VAT_RATE * 100),
        },
        quantity: l.product_uom_qty,
      }));
      if (delivery > 0) {
        lineItems.push({
          price_data: {
            currency: 'gbp',
            product_data: { name: 'Delivery' },
            unit_amount: Math.round(delivery * VAT_RATE * 100),
          },
          quantity: 1,
        });
      }

      const invoiceLines: OdooInvoiceLine[] = orderLines.map(l => ({
        product_id: Array.isArray(l.product_id) ? l.product_id[0] : undefined,
        name: l.name,
        quantity: l.product_uom_qty,
        price_unit: l.price_unit,
        // Links this invoice line back to its sale.order.line, the same way
        // Odoo's own "Create Invoice" button does — needed for the order's
        // invoice_status / invoice smart button to reflect this invoice once
        // the order is confirmed on payment success.
        sale_line_ids: [l.id],
      }));
      if (delivery > 0) {
        invoiceLines.push({ name: 'Delivery', quantity: 1, price_unit: delivery });
      }

      odooInvoiceId = await createOdooDraftInvoice(partnerId, invoiceLines, orderReference);

      orderMeta = JSON.stringify(orderLines.map(l => ({
        n: l.name.split('\n')[0].substring(0, 50),
        q: l.product_uom_qty,
        p: l.price_unit,
      }))).substring(0, 400);
    } else if (invoiceIds) {
      // Paying off existing invoices from /account/pay. The client sends which
      // invoices it thinks it's paying and their summed total, but both are
      // untrusted input — re-verify ownership and the real outstanding amount
      // against Odoo before charging anything, so a tampered request can't
      // pay someone else's invoice or charge less than what's actually owed.
      if (!Array.isArray(invoiceIds) || invoiceIds.length === 0
        || !invoiceIds.every((id: unknown) => Number.isInteger(id) && (id as number) > 0)) {
        return NextResponse.json({ error: 'Invalid invoice selection' }, { status: 400 });
      }

      const uid = session.user.uid;
      const user = await getPartnerByUid(uid, '');
      const partnerId = (user?.partner_id as [number, string])?.[0];
      if (!partnerId) return NextResponse.json({ error: 'Partner not found' }, { status: 400 });

      const invoiceRows = (await jsonrpcCallKw('account.move', 'search_read', [
        [
          ['id', 'in', invoiceIds],
          ['partner_id', '=', partnerId],
          ['state', '=', 'posted'],
          ['move_type', '=', 'out_invoice'],
        ],
        ['id', 'amount_residual'],
      ])) as Array<{ id: number; amount_residual: number }>;

      if (invoiceRows.length !== invoiceIds.length) {
        return NextResponse.json({ error: 'One or more invoices could not be found on your account' }, { status: 400 });
      }

      const serverAmount = invoiceRows.reduce((s, r) => s + r.amount_residual, 0);
      if (Math.abs(serverAmount - Number(amount)) > 0.01) {
        return NextResponse.json({ error: 'Amount no longer matches your outstanding balance — please refresh and try again' }, { status: 400 });
      }

      odooInvoiceIds = invoiceIds as number[];
      if (!reference) {
        orderReference = `PAY-${odooInvoiceIds.length}INV-${odooInvoiceIds[0]}`;
      }

      lineItems = [{
        price_data: {
          currency: 'gbp',
          product_data: { name: description || `Payment for ${odooInvoiceIds.length} invoice${odooInvoiceIds.length !== 1 ? 's' : ''}` },
          unit_amount: Math.round(serverAmount * 100),
        },
        quantity: 1,
      }];
    } else {
      lineItems = [{
        price_data: {
          currency: 'gbp',
          product_data: { name: description || 'FTPaints Order' },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }];
    }

    const metadata: Record<string, string> = {
      customer_email: session.user.email || customerEmail || '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customer_name: (session.user as any)?.name || '',
      order_reference: orderReference,
      order_lines: orderMeta,
      amount_total: String(amount ?? ''),
    };
    if (odooInvoiceId) metadata.odoo_invoice_id = String(odooInvoiceId);
    if (odooOrderId) metadata.odoo_order_id = String(odooOrderId);
    if (odooInvoiceIds?.length) {
      const idsJson = JSON.stringify(odooInvoiceIds);
      // Reject rather than truncate — a truncated JSON array would silently
      // drop invoices from reconciliation once Stripe metadata is read back.
      if (idsJson.length > 480) {
        return NextResponse.json({ error: 'Too many invoices selected for a single payment' }, { status: 400 });
      }
      metadata.odoo_invoice_ids = idsJson;
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail || session.user.email || undefined,
      line_items: lineItems,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${process.env.NEXTAUTH_URL}/account?payment=success`,
      cancel_url:  `${process.env.NEXTAUTH_URL}/account?payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: unknown) {
    if (err instanceof OrderLineError) {
      return NextResponse.json({ error: err.message, items: err.items }, { status: 400 });
    }
    console.error('Stripe error:', err);
    const message = err instanceof Error ? err.message : 'Payment session failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
