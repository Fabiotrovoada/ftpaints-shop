import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, invoiceIds, description, customerEmail } = await req.json();

  // Check Stripe key is configured
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('YOUR_KEY')) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail || session.user.email || undefined,
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: description || 'FTPaints Invoice Payment',
            description: `Invoice(s): ${invoiceIds.join(', ')}`,
          },
          unit_amount: Math.round(amount * 100), // pence
        },
        quantity: 1,
      }],
      metadata: {
        invoice_ids: invoiceIds.join(','),
        customer_email: session.user.email || '',
      },
      success_url: `${process.env.NEXTAUTH_URL}/account?payment=success`,
      cancel_url:  `${process.env.NEXTAUTH_URL}/account?payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: unknown) {
    console.error('Stripe error:', err);
    const message = err instanceof Error ? err.message : 'Payment session failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
