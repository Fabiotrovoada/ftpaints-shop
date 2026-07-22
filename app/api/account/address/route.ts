import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { jsonrpcCallKw } from '@/lib/odoo';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Get user's partner_id
    const user = await jsonrpcCallKw('res.users', 'read', [[session.user.uid]], {
      fields: ['partner_id'],
    }) as { partner_id: [number, string] } | null;

    const partnerId = user?.partner_id?.[0];
    if (!partnerId) return NextResponse.json({});

    // Get partner address
    const partner = await jsonrpcCallKw('res.partner', 'read', [[partnerId]], {
      fields: ['name', 'street', 'street2', 'city', 'zip', 'country_id'],
    }) as Record<string, unknown> | null;

    return NextResponse.json(partner ?? {});
  } catch {
    return NextResponse.json({});
  }
}
