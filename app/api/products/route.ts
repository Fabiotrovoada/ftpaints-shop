import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProducts, getProductsByTag, getProductsByIds, applyPricelistToProducts } from '@/lib/odoo';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';
import { DEMO_PRODUCTS } from '@/lib/demoData';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') || '';
  const inStockOnly = searchParams.get('inStockOnly') === 'true';
  const offset = parseInt(searchParams.get('offset') || '0');
  const limit = parseInt(searchParams.get('limit') || '24');
  const categoryId = searchParams.get('categoryId') ? parseInt(searchParams.get('categoryId')!) : undefined;
  const tagId = searchParams.get('tagId') ? parseInt(searchParams.get('tagId')!) : undefined;
  const sort = searchParams.get('sort') || 'name asc';
  // Explicit product-template ids (Favourites view) — bypasses catalogue pagination
  const idsParam = searchParams.get('ids');
  const ids = idsParam
    ? idsParam.split(',').map(s => parseInt(s, 10)).filter(n => Number.isFinite(n))
    : null;

  if (DEMO_MODE) {
    let products = [...DEMO_PRODUCTS];
    if (ids) products = products.filter(p => ids.includes(p.id));
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.default_code.toLowerCase().includes(search.toLowerCase()));
    if (inStockOnly) products = products.filter(p => p.qty_available > 0);
    if (categoryId) products = products.filter(p => p.categ_id[0] === categoryId);
    const total = products.length;
    return NextResponse.json({ products: ids ? products : products.slice(offset, offset + limit), total });
  }

  // The base product cache is keyed without the partner, but pricelist prices are
  // per-partner — so overlay the partner's pricelist on a shallow copy per request
  // (copy protects the shared cached objects from mutation).
  const withPartnerPricing = async (result: { products: unknown[]; total: number }) => {
    const products = (result.products as Record<string, unknown>[]).map(p => ({ ...p }));
    await applyPricelistToProducts(session.user.uid, '', products);
    return { products, total: result.total };
  };

  // Favourites: fetch exactly these templates, all at once (no pagination)
  if (ids) {
    if (ids.length === 0) return NextResponse.json({ products: [], total: 0 });
    const cacheKey = `products:ids:${ids.slice().sort((a, b) => a - b).join(',')}`;
    const cached = cacheGet<{ products: unknown[]; total: number }>(cacheKey);
    if (cached) return NextResponse.json({ ...(await withPartnerPricing(cached)), fromCache: true });
    try {
      const result = await getProductsByIds(ids);
      cacheSet(cacheKey, result, TTL.PRODUCTS);
      return NextResponse.json(await withPartnerPricing(result));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Products API (ids) error:', message);
      return NextResponse.json({ error: 'Failed to fetch products', detail: message, products: [], total: 0 }, { status: 500 });
    }
  }

  const cacheKey = `products:${search}:${inStockOnly}:${offset}:${limit}:${categoryId || ''}:${tagId || ''}:${sort}`;
  const cached = cacheGet<{ products: unknown[]; total: number }>(cacheKey);
  if (cached) return NextResponse.json({ ...(await withPartnerPricing(cached)), fromCache: true });

  try {
    let result;
    if (tagId) {
      // Use JSON-RPC for tag-filtered products
      result = await getProductsByTag(tagId, { search, inStockOnly, offset, limit, sort });
    } else {
      // Use Mobile API for normal products
      result = await getProducts(session.user.uid, '', { search, inStockOnly, offset, limit, categoryId, sort });
    }

    cacheSet(cacheKey, result, TTL.PRODUCTS);
    return NextResponse.json(await withPartnerPricing(result));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Products API error:', message);
    return NextResponse.json({ error: 'Failed to fetch products', detail: message, products: [], total: 0 }, { status: 500 });
  }
}
