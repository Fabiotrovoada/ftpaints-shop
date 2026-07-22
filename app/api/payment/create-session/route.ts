import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface OrderLine {
  product_id?: number;
  code: string;
  name: string;
  qty: number;
  price: number;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, description, customerEmail, lines, reference } = await req.json();

  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('YOUR_KEY')) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 });
  }

  try {
    const Stripe = (await import('stripe')).default;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' as any });

    const lineItems = lines?.length
      ? lines.map((line: OrderLine) => ({
          price_data: {
            currency: 'gbp',
            product_data: {
              name: line.name,
              description: line.code ? `SKU: ${line.code}` : undefined,
            },
            unit_amount: Math.round(line.price * 100),
          },
          quantity: line.qty,
        }))
      : [{
          price_data: {
            currency: 'gbp',
            product_data: { name: description || 'FTPaints Order' },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        }];

    const orderMeta = lines
      ? JSON.stringify(lines.map((l: OrderLine) => ({
          id: l.product_id,
          c: l.code,
          n: l.name.substring(0, 50),
          q: l.qty,
          p: l.price,
        }))).substring(0, 400)
      : '';

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail || session.user.email || undefined,
      line_items: lineItems,
      metadata: {
        customer_email: session.user.email || customerEmail || '',
        customer_name: (session.user as any)?.name || '',
        order_reference: reference || `ORD-${Date.now()}`,
        order_lines: orderMeta,
        amount_total: String(amount),
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
