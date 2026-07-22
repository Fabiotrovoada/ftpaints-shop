import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { jsonrpcCallKw, reconcileStripePaymentWithInvoice } from '@/lib/odoo';

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

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as Stripe.PaymentIntent;
    console.log(`[WEBHOOK] PaymentIntent succeeded: ${pi.id}, amount: ${pi.amount}`);
    processPI(pi).catch(err => console.error('[WEBHOOK] Odoo error:', err));
  } else if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(`[WEBHOOK] Checkout session completed: ${session.id}, amount: ${session.amount_total}`);
    processSession(session).catch(err => console.error('[WEBHOOK] Odoo error:', err));
  }

  return NextResponse.json({ received: true });
}

async function processPI(pi: Stripe.PaymentIntent) {
  const customerEmail = pi.metadata?.customer_email || undefined;
  const saleReference = pi.metadata?.order_reference || pi.id;
  const amount = pi.amount / 100;

  console.log(`[WEBHOOK] Processing PI ${pi.id}, amount ${amount}, email ${customerEmail}`);

  if (!customerEmail) {
    console.log('[WEBHOOK] No customer email in metadata, skipping');
    return;
  }

  await reconcile(customerEmail, amount, pi.id, saleReference);
}

async function processSession(session: Stripe.Checkout.Session) {
  const customerEmail = session.customer_email || undefined;
  const saleReference = (session.metadata as Record<string, string>)?.order_reference || session.id;
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
  await reconcile(customerEmail, amount, paymentId, saleReference);
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
