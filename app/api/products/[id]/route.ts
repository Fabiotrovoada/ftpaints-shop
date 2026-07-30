import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProductById, applyPricelistToProducts, copyForPricing } from '@/lib/odoo';
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

  // Overlay the partner's pricelist per request on a copy — the cache is keyed
  // without the partner, so mutating the cached object would serve one partner's
  // negotiated prices to the next.
  const withPartnerPricing = async (product: Record<string, unknown> | null | undefined) => {
    if (!product) return product ?? null;
    const copy = copyForPricing(product);
    await applyPricelistToProducts(session.user.uid, '', [copy]);
    return copy;
  };

  const cacheKey = `product:${id}`;
  const cached = cacheGet<Record<string, unknown>>(cacheKey);
  if (cached) return NextResponse.json({ product: await withPartnerPricing(cached) });

  try {
    const product = await getProductById(session.user.uid, '', id);
    if (product) cacheSet(cacheKey, product, TTL.PRODUCT);
    return NextResponse.json({ product: await withPartnerPricing(product as Record<string, unknown> | null) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
