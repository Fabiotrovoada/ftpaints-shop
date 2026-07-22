import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProducts, getProductsByTag } from '@/lib/odoo';
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

  if (DEMO_MODE) {
    let products = [...DEMO_PRODUCTS];
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.default_code.toLowerCase().includes(search.toLowerCase()));
    if (inStockOnly) products = products.filter(p => p.qty_available > 0);
    if (categoryId) products = products.filter(p => p.categ_id[0] === categoryId);
    const total = products.length;
    return NextResponse.json({ products: products.slice(offset, offset + limit), total });
  }

  const cacheKey = `products:${search}:${inStockOnly}:${offset}:${limit}:${categoryId || ''}:${tagId || ''}:${sort}`;
  const cached = cacheGet<{ products: unknown[]; total: number }>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    let result;
    if (tagId) {
      // Use JSON-RPC for tag-filtered products
      result = await getProductsByTag(tagId, { search, inStockOnly, offset, limit, sort });
    } else {
      // Use Mobile API for normal products
      result = await getProducts(session.user.uid, session.user.password, { search, inStockOnly, offset, limit, categoryId, sort });
    }

    cacheSet(cacheKey, result, TTL.PRODUCTS);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Products API error:', message);
    return NextResponse.json({ error: 'Failed to fetch products', detail: message, products: [], total: 0 }, { status: 500 });
  }
}
