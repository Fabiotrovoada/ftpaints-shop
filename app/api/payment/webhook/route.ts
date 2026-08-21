import { NextRequest, NextResponse, after } from 'next/server';
import Stripe from 'stripe';
import {
  jsonrpcCallKw, reconcileStripePaymentWithInvoice, reconcileStripePaymentWithInvoices,
  postInvoiceIfDraft, confirmSaleOrderIfDraft,
} from '@/lib/odoo';

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-03-25.dahlia' as any,
  });

  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: unknown) {
    console.error('[WEBHOOK] Signature verification failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }

  // Every payment in this app is created via stripe.checkout.sessions.create,
  // so payment_intent.succeeded always has a matching checkout.session.completed
  // for the same charge. Acting on both raced the two events against each
  // other — both searching for "is there already a payment for this?" before
  // either had finished creating one — which is what produced duplicate
  // account.payment records in Odoo. checkout.session.completed alone is
  // Stripe's own recommended event for Checkout, so payment_intent.succeeded
  // is intentionally ignored here.
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(`[WEBHOOK] Checkout session completed: ${session.id}, amount: ${session.amount_total}`);
    // Vercel can freeze the function the instant the response below is sent,
    // killing any un-awaited async work mid-flight — after() keeps the
    // invocation alive (via waitUntil) until this promise settles.
    after(() => processSession(session).catch(err => console.error('[WEBHOOK] Odoo error:', err)));
  }

  return NextResponse.json({ received: true });
}

async function processSession(session: Stripe.Checkout.Session) {
  const customerEmail = session.customer_email || undefined;
  const metadata = (session.metadata || {}) as Record<string, string>;
  const saleReference = metadata.order_reference || session.id;
  const amount = (session.amount_total || 0) / 100;
  const stripePaymentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : (session.payment_intent as Stripe.PaymentIntent)?.id;

  console.log(`[WEBHOOK] Processing session ${session.id}, amount ${amount}, email ${customerEmail}, PI ${stripePaymentId}`);

  if (!customerEmail) {
    console.log('[WEBHOOK] No customer email in session, skipping');
    return;
  }

  const paymentId = stripePaymentId || `cs_${session.id}`;
  const odooInvoiceId = metadata.odoo_invoice_id ? Number(metadata.odoo_invoice_id) : undefined;
  const odooOrderId = metadata.odoo_order_id ? Number(metadata.odoo_order_id) : undefined;
  let odooInvoiceIds: number[] | undefined;
  if (metadata.odoo_invoice_ids) {
    try {
      const parsed = JSON.parse(metadata.odoo_invoice_ids);
      if (Array.isArray(parsed) && parsed.every(n => Number.isInteger(n))) odooInvoiceIds = parsed;
    } catch {
      console.warn('[WEBHOOK] Could not parse odoo_invoice_ids metadata:', metadata.odoo_invoice_ids);
    }
  }

  if (odooInvoiceId) {
    await reconcileKnownInvoice(customerEmail, amount, paymentId, saleReference, odooInvoiceId, odooOrderId);
  } else if (odooInvoiceIds?.length) {
    await reconcileExistingInvoices(customerEmail, amount, paymentId, saleReference, odooInvoiceIds);
  } else {
    await reconcile(customerEmail, amount, paymentId, saleReference);
  }
}

/**
 * Card orders placed at checkout already have a draft invoice — and a draft
 * sale order — created for them (see /api/payment/create-session); the ids
 * travel in Stripe metadata so the webhook doesn't have to guess which
 * invoice/order this payment is for.
 */
async function reconcileKnownInvoice(
  customerEmail: string, amount: number, stripePaymentId: string, saleReference: string,
  invoiceId: number, orderId?: number
) {
  const partners = (await jsonrpcCallKw('res.partner', 'search_read', [
    [['email', '=', customerEmail]],
    ['id', 'name'],
  ], { limit: 1 })) as Array<{ id: number; name: string }>;

  if (!partners.length) {
    console.log(`[WEBHOOK] No partner found for email ${customerEmail}, skipping`);
    return;
  }

  const partnerId = partners[0].id;
  const partnerName = partners[0].name;

  // Confirm the quotation into a Sales Order first — same order Odoo's own
  // checkout does it in — then post the invoice that's already linked to it.
  if (orderId) await confirmSaleOrderIfDraft(orderId);
  await postInvoiceIfDraft(invoiceId);

  await reconcileStripePaymentWithInvoice(
    invoiceId, partnerId, amount, stripePaymentId, saleReference, partnerName
  );

  console.log(`[WEBHOOK] ✅ Reconciled invoice ${invoiceId} (order ${saleReference}) with payment ${stripePaymentId}`);
}

/**
 * Paying off existing invoices from /account/pay. The invoice ids travel in
 * Stripe metadata (set by create-session after verifying ownership/amount),
 * so — unlike reconcile() below — there's no need to guess which invoice(s)
 * this payment is for. Invoices here are already posted, so no draft-posting
 * or sale order confirmation is needed, unlike the checkout flow above.
 */
async function reconcileExistingInvoices(
  customerEmail: string, amount: number, stripePaymentId: string, saleReference: string,
  invoiceIds: number[]
) {
  const partners = (await jsonrpcCallKw('res.partner', 'search_read', [
    [['email', '=', customerEmail]],
    ['id', 'name'],
  ], { limit: 1 })) as Array<{ id: number; name: string }>;

  if (!partners.length) {
    console.log(`[WEBHOOK] No partner found for email ${customerEmail}, skipping`);
    return;
  }

  const partnerId = partners[0].id;
  const partnerName = partners[0].name;

  await reconcileStripePaymentWithInvoices(
    invoiceIds, partnerId, amount, stripePaymentId, saleReference, partnerName
  );

  console.log(`[WEBHOOK] ✅ Reconciled ${invoiceIds.length} invoice(s) with payment ${stripePaymentId}`);
}

async function reconcile(customerEmail: string, amount: number, stripePaymentId: string, saleReference: string) {
  // Find partner by email
  const partners = (await jsonrpcCallKw('res.partner', 'search_read', [
    [['email', '=', customerEmail]],
    ['id', 'name'],
  ], { limit: 1 })) as Array<{ id: number; name: string }>;

  if (!partners.length) {
    console.log(`[WEBHOOK] No partner found for email ${customerEmail}, skipping`);
    return;
  }

  const partnerId = partners[0].id;
  const partnerName = partners[0].name;
  console.log(`[WEBHOOK] Partner: ${partnerName} (${partnerId})`);

  // Find outstanding invoice for partner + amount
  const invoices = (await jsonrpcCallKw('account.move', 'search_read', [
    [
      ['move_type', '=', 'out_invoice'],
      ['state', '=', 'posted'],
      ['payment_state', '=', 'not_paid'],
      ['partner_id', '=', partnerId],
      ['amount_total', '=', amount],
    ],
    ['id', 'name', 'amount_total'],
  ], { order: 'invoice_date desc', limit: 1 })) as Array<{ id: number; name: string }>;

  if (!invoices.length) {
    console.log(`[WEBHOOK] No outstanding invoice for partner ${partnerId} amount ${amount}, skipping`);
    return;
  }

  const invoice = invoices[0];
  console.log(`[WEBHOOK] Found invoice ${invoice.name} (${invoice.id})`);

  await reconcileStripePaymentWithInvoice(
    invoice.id,
    partnerId,
    amount,
    stripePaymentId,
    saleReference,
    partnerName
  );

  console.log(`[WEBHOOK] ✅ Reconciled invoice ${invoice.name} with payment ${stripePaymentId}`);
}
