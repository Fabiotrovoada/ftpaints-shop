import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPartnerByUid, getInvoices, getStoreCredit, applyStoreCredit } from '@/lib/odoo';
import { DEMO_INVOICES, DEMO_STORE_CREDIT } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json({ invoices: DEMO_INVOICES, storeCredit: DEMO_STORE_CREDIT });

  try {
    const user = await getPartnerByUid(session.user.uid, '');
    const partnerId = (user?.partner_id as [number, string])?.[0];
    if (!partnerId) return NextResponse.json({ error: 'Partner not found' }, { status: 400 });

    await applyStoreCredit(partnerId);

    const [invoices, storeCredit] = await Promise.all([
      getInvoices(session.user.uid, '', partnerId),
      getStoreCredit(partnerId),
    ]);
    return NextResponse.json({ invoices, storeCredit });
  } catch {
    return NextResponse.json({ error: 'Could not apply store credit' }, { status: 500 });
  }
}
