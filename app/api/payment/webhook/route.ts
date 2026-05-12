import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('YOUR_KEY')) {
    return NextResponse.json({ received: true });
  }

  try {
    const Stripe = (await import('stripe')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any });

    const sig = req.headers.get('stripe-signature');
    const body = await req.text();

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { metadata?: { invoice_ids?: string; customer_email?: string }; amount_total?: number | null };
      const invoiceNames = session.metadata?.invoice_ids?.split(',') || [];
      const customerEmail = session.metadata?.customer_email;
      const amountPaid = (session.amount_total || 0) / 100;

      console.log(`✅ Payment received: £${amountPaid} from ${customerEmail} for invoices: ${invoiceNames.join(', ')}`);
      // TODO: Auto-reconcile in Odoo via API
      // For now, FTPaints team will see the Stripe payment and manually reconcile
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 });
  }
}
