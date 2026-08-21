import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPartnerByUid, getStoreCredit } from '@/lib/odoo';
import { DEMO_STORE_CREDIT } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json(DEMO_STORE_CREDIT);

  try {
    const user = await getPartnerByUid(session.user.uid, '');
    const partnerId = (user?.partner_id as [number, string])?.[0];
    const storeCredit = await getStoreCredit(partnerId);
    return NextResponse.json(storeCredit);
  } catch {
    return NextResponse.json({ available: 0, creditNotes: [] });
  }
}
