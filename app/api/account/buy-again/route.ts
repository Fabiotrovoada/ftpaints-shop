import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPreviouslyPurchasedProducts, getPartnerByUid, applyPricelistToProducts } from '@/lib/odoo';
import { DEMO_PRODUCTS } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json({ products: DEMO_PRODUCTS });

  try {
    const user = await getPartnerByUid(session.user.uid, '');
    const partnerId = (user?.partner_id as [number, string])?.[0];
    const { products } = await getPreviouslyPurchasedProducts(session.user.uid, '', partnerId);
    // Overlay the partner's pricelist so re-order cards show the same price as the shop
    await applyPricelistToProducts(session.user.uid, '', products);
    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ products: [] });
  }
}
