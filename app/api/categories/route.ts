import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCategories } from '@/lib/odoo';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cacheKey = 'categories-v2';
  const cached = cacheGet<unknown>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const cats = await getCategories(session.user.uid, '');
    const result = { categories: cats || [] };
    cacheSet(cacheKey, result, TTL.CATEGORIES);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Categories error:', message);
    return NextResponse.json({ categories: [], error: message });
  }
}
