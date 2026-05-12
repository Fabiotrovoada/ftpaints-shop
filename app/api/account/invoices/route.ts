import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInvoices, getPartnerByUid } from '@/lib/odoo';
import { DEMO_INVOICES } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json({ invoices: DEMO_INVOICES });

  try {
    const user = await getPartnerByUid(session.user.uid, session.user.password);
    const partnerId = (user?.partner_id as [number, string])?.[0];
    const invoices = await getInvoices(session.user.uid, session.user.password, partnerId);
    return NextResponse.json({ invoices });
  } catch {
    return NextResponse.json({ invoices: [] });
  }
}
