import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getProductById } from '@/lib/odoo';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const id = parseInt(searchParams.get('id') || '0');

  try {
    const product = await getProductById(session.user.uid, session.user.password, id);
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({
      template_id: product.id,
      template_qty: product.qty_available,
      template_virt: product.virtual_available,
      variant_count: product.variant_ids?.length || 0,
      variants: (product.variant_ids || []).slice(0, 3).map(v => ({
        id: v.id,
        name: (v as any).merged_name || v.name,
        qty: (v as any).qty_available,
        virt: (v as any).virtual_available,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
