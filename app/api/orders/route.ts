import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSaleOrder, getPartnerByUid, OrderLineError, type OrderLineInput } from '@/lib/odoo';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lines, note } = await req.json();
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
