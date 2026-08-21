import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  createSaleOrder, confirmSaleOrderIfDraft, getPartnerByUid, OrderLineError, type OrderLineInput,
  getSaleOrderLines, createOdooDraftInvoice, postInvoiceIfDraft, type OdooInvoiceLine,
} from '@/lib/odoo';

interface SaleOrderLine {
  id: number;
  product_id?: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  name: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lines, note, paymentMethod } = await req.json();
  const uid = session.user.uid;
  const password = '';

  // The body is customer-controlled. Prices are recomputed server-side in
  // createSaleOrder, but the ids and quantities still have to be sane.
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: 'Your basket is empty' }, { status: 400 });
  }
  const clean: OrderLineInput[] = [];
  for (const l of lines) {
    const productId = Number(l?.productId);
    const qty = Number(l?.qty);
    if (!Number.isInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: 'That basket contains an item we do not recognise' }, { status: 400 });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Every item needs a quantity of at least 1' }, { status: 400 });
    }
    clean.push({ ...l, productId, qty });
  }

  try {
    const user = await getPartnerByUid(uid, password);
    const partnerId = (user?.partner_id as [number, string])?.[0];
    if (!partnerId) return NextResponse.json({ error: 'Partner not found' }, { status: 400 });

    const order = await createSaleOrder(uid, password, partnerId, clean, note);

    // "Pay on Account" and "Pay on Collection" are firm commitments — the
    // customer has agreed to pay (on terms, or at the counter), so the order
    // should land in Odoo as a confirmed Sales Order, not sit invisibly in
    // Quotations. Bank Transfer stays a Quotation until staff confirm the
    // funds actually arrived, per its own checkout copy.
    if (paymentMethod === 'account' || paymentMethod === 'collection') {
      await confirmSaleOrderIfDraft(order.id);
    }

    // Pay on Account is an invoice on credit terms, not a payment — raise and
    // post it immediately so it shows up for the customer to pay via
    // /account/pay and on their statement, instead of staff having to create
    // it manually in Odoo. A failure here must not fail order placement: the
    // sales order above is already confirmed, so we log and let staff invoice
    // it by hand as before, rather than showing the customer a failed order
    // that actually went through.
    if (paymentMethod === 'account') {
      try {
        const orderLines = (await getSaleOrderLines(uid, password, order.id)) as SaleOrderLine[];
        if (orderLines.length) {
          const invoiceLines: OdooInvoiceLine[] = orderLines.map(l => ({
            product_id: Array.isArray(l.product_id) ? l.product_id[0] : undefined,
            name: l.name,
            quantity: l.product_uom_qty,
            price_unit: l.price_unit,
            sale_line_ids: [l.id],
          }));
          const invoiceId = await createOdooDraftInvoice(partnerId, invoiceLines, order.name);
          await postInvoiceIfDraft(invoiceId);
        } else {
          console.error(`[ORDERS] Order ${order.name || order.id} confirmed but its lines could not be read back — invoice not created`);
        }
      } catch (invoiceErr) {
        console.error(`[ORDERS] Failed to auto-invoice order ${order.name || order.id}:`, invoiceErr);
      }
    }

    // `repriced` lets checkout tell the customer their basket total moved rather
    // than quietly booking a different figure — baskets sit in localStorage for
    // weeks, so a stale price is the normal case, not the exception.
    return NextResponse.json({ orderId: order.id, orderName: order.name, repriced: order.repriced });
  } catch (err) {
    if (err instanceof OrderLineError) {
      return NextResponse.json({ error: err.message, items: err.items }, { status: 400 });
    }
    console.error('Order creation error:', err);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
