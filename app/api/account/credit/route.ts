import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPartnerByUid, getPartnerInfo } from '@/lib/odoo';
import { DEMO_CREDIT } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json(DEMO_CREDIT);

  try {
    const user = await getPartnerByUid(session.user.uid, session.user.password);
    const partnerId = (user?.partner_id as [number, string])?.[0];
    const partner = await getPartnerInfo(session.user.uid, session.user.password, partnerId);

    const creditLimit = (partner?.credit_limit as number) || 0;
    const creditUsed = (partner?.credit as number) || 0;
    const onStop = creditLimit > 0 && creditUsed >= creditLimit;

    // Payment terms: [id, name] or false
    const paymentTermEntry = partner?.property_payment_term_id as [number, string] | false;
    const paymentTermName = paymentTermEntry ? paymentTermEntry[1] : null;
    // Only allow "Pay on Account" if terms are set and NOT "Immediate Payment"
    const hasAccountTerms = !!(paymentTermName && paymentTermName !== 'Immediate Payment');

    return NextResponse.json({
      limit: creditLimit,
      used: creditUsed,
      onStop,
      paymentTerms: hasAccountTerms,
      paymentTermName: paymentTermName || null,
    });
  } catch {
    return NextResponse.json({ limit: 0, used: 0, onStop: false });
  }
}
