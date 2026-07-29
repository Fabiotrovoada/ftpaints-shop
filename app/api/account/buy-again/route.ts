import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getPreviouslyPurchasedProducts, getPartnerByUid, applyPricelistToProducts } from '@/lib/odoo';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';
import { DEMO_PRODUCTS } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (DEMO_MODE) return NextResponse.json({ products: DEMO_PRODUCTS });

  try {
    const user = await getPartnerByUid(session.user.uid, '');
    const partnerId = (user?.partner_id as [number, string])?.[0];

    // Purchase history is several Odoo round-trips and changes at most daily,
    // so cache it per partner. The cached copy is deliberately pricelist-free.
    const cacheKey = `buyagain:${partnerId}`;
    let products = cacheGet<Record<string, unknown>[]>(cacheKey);
    let fromCache = true;
    if (!products) {
      fromCache = false;
      ({ products } = await getPreviouslyPurchasedProducts(session.user.uid, '', partnerId));
      cacheSet(cacheKey, products, TTL.BUY_AGAIN);
    }

    // Copy before pricing: applyPricelistToProducts mutates in place, and
    // writing one partner's negotiated prices onto the cached objects would
    // serve them to the next partner who hits the same cache entry.
    const priced = products.map(p => ({ ...p }));
    await applyPricelistToProducts(session.user.uid, '', priced);
    return NextResponse.json({ products: priced, fromCache });
  } catch {
    return NextResponse.json({ products: [] });
  }
}
