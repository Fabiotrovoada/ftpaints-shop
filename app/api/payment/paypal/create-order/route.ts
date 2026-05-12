import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) throw new Error('PayPal not configured');

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { amount, invoiceIds, description, customerEmail } = await req.json();

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
    return NextResponse.json({ error: 'PayPal not configured' }, { status: 503 });
  }

  try {
    const accessToken = await getPayPalAccessToken();

    const orderRes = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `order-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: invoiceIds.join(','),
          description: description || 'FTPaints Invoice Payment',
          amount: {
            currency_code: 'GBP',
            value: (Math.round(amount * 100) / 100).toFixed(2),
          },
          custom_id: invoiceIds.join(','),
        }],
        payer: customerEmail ? { email_address: customerEmail } : undefined,
        application_context: {
          brand_name: 'FT Paints',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${process.env.NEXTAUTH_URL || 'https://shop.ftpaints.co.uk'}/account?payment=success`,
          cancel_url: `${process.env.NEXTAUTH_URL || 'https://shop.ftpaints.co.uk'}/account?payment=cancelled`,
        },
      }),
    });

    if (!orderRes.ok) {
      const errData = await orderRes.json();
      console.error('PayPal create order error:', errData);
      return NextResponse.json({ error: 'PayPal order creation failed' }, { status: 500 });
    }

    const order = await orderRes.json();
    return NextResponse.json({ orderId: order.id });
  } catch (err: unknown) {
    console.error('PayPal error:', err);
    const message = err instanceof Error ? err.message : 'PayPal payment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
