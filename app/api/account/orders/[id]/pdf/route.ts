import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getWebSession } from '@/lib/odoo';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  try {
    const cookies = await getWebSession();
    const odooUrl = process.env.ODOO_URL!;
    const pdfRes = await fetch(`${odooUrl}/report/pdf/sale.report_saleorder/${orderId}`, {
      headers: { Cookie: cookies },
    });
    if (!pdfRes.ok) throw new Error(`Odoo returned ${pdfRes.status}`);
    const buffer = await pdfRes.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="order-${orderId}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not generate PDF' }, { status: 500 });
  }
}
