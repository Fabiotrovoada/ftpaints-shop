import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSaleOrder, getPartnerByUid } from '@/lib/odoo';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { lines, note } = await req.json();
  const uid = session.user.uid;
  const password = '';

  try {
    const user = await getPartnerByUid(uid, password);
    const partnerId = (user?.partner_id as [number, string])?.[0];
    if (!partnerId) return NextResponse.json({ error: 'Partner not found' }, { status: 400 });

    const order = await createSaleOrder(uid, password, partnerId, lines, note);
    return NextResponse.json({ orderId: order.id, orderName: order.name });
  } catch (err) {
    console.error('Order creation error:', err);
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 });
  }
}
