import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveAccountPartner, assertOwnsRecord, getSaleOrderLines, jsonrpcCallKw } from '@/lib/odoo';
import { DEMO_ORDERS, DEMO_ORDER_LINES } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 });

  if (DEMO_MODE) {
    const order = DEMO_ORDERS.find(o => o.id === orderId);
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ order, lines: DEMO_ORDER_LINES[orderId] ?? [] });
  }

  try {
    const { commercialId } = await resolveAccountPartner(session.user.uid);
    if (!commercialId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Authorize before reading anything — 404 rather than 403 so the response
    // does not confirm the order exists for somebody else.
    const owns = await assertOwnsRecord('sale.order', orderId, commercialId);
    if (!owns) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [order, lines] = await Promise.all([
      jsonrpcCallKw('sale.order', 'read', [[orderId]], {
        fields: ['id', 'name', 'date_order', 'amount_total', 'amount_untaxed', 'amount_tax', 'state', 'note'],
      }) as Promise<Record<string, unknown> | null>,
      getSaleOrderLines(session.user.uid, '', orderId),
    ]);
    if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ order, lines });
  } catch {
    return NextResponse.json({ error: 'Could not load order' }, { status: 500 });
  }
}
