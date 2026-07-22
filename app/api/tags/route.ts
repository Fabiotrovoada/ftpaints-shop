import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getTags } from '@/lib/odoo';
import { cacheGet, cacheSet, TTL } from '@/lib/cache';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const cached = cacheGet<{ tags: unknown[] }>('tags:all');
  if (cached) return NextResponse.json({ ...cached, fromCache: true });

  try {
    const tags = await getTags();
    cacheSet('tags:all', { tags }, TTL.CATEGORIES); // reuse category TTL (1hr)
    return NextResponse.json({ tags });
  } catch (err) {
    console.error('Tags API error:', err);
    return NextResponse.json({ tags: [], error: 'Failed to fetch tags' }, { status: 500 });
  }
}
