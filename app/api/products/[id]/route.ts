import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProductById, applyPricelistToProducts } from '@/lib/odoo';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await context.params;
  const id = parseInt(idStr);
  if (isNaN(id)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Overlay the partner's pricelist per request on a shallow copy (the cache is
  // keyed without the partner, so we must never mutate the cached object).
  const withPartnerPricing = async (product: Record<string, unknown> | null | undefined) => {
    if (!product) return product ?? null;
    const copy = { ...product };
    await applyPricelistToProducts(session.user.uid, session.user.password, [copy]);
    return copy;
  };

  const cacheKey = `product:${id}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return NextResponse.json({ product: await withPartnerPricing(cached) });

  try {
    const product = await getProductById(session.user.uid, session.user.password, id);
    if (product) cacheSet(cacheKey, product, TTL.PRODUCT);
    return NextResponse.json({ product: await withPartnerPricing(product as Record<string, unknown> | null) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
