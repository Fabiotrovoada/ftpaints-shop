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

  const { orderId, invoiceIds } = await req.json();

  if (!orderId) return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });

  try {
    const accessToken = await getPayPalAccessToken();

    const captureRes = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!captureRes.ok) {
      const errData = await captureRes.json();
      console.error('PayPal capture error:', errData);
      return NextResponse.json({ error: 'Payment capture failed' }, { status: 500 });
    }

    const captured = await captureRes.json();

    // TODO: Reconcile payment in Odoo here
    // For now, return success - the webhook or manual reconciliation handles Odoo
    console.log(`PayPal payment captured: ${orderId}`, {
      status: captured.status,
      invoices: invoiceIds,
      payer: captured.payer?.email_address,
    });

    return NextResponse.json({
      success: true,
      orderId,
      status: captured.status,
    });
  } catch (err: unknown) {
    console.error('PayPal capture error:', err);
    const message = err instanceof Error ? err.message : 'PayPal capture failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
