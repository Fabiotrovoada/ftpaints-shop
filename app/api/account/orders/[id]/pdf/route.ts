import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getWebSession } from '@/lib/odoo';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await context.params;
  const orderId = parseInt(id);
  if (isNaN(orderId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

  // Opened as a browser tab (top-level navigation): return a tiny HTML shell whose
  // <title> controls the tab title, embedding the PDF full-screen. Chrome ignores the
  // Content-Disposition filename for an inline PDF's tab title, so this is the only
  // reliable lever. The iframe requests ?raw=1 below to get the actual PDF bytes.
  const wantsHtml = (req.headers.get('accept') || '').includes('text/html')
    && req.nextUrl.searchParams.get('raw') !== '1';
  if (wantsHtml) {
    const title = `FTPaints Order ${orderId}`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>`
      + `<meta name="viewport" content="width=device-width, initial-scale=1"/>`
      + `<title>${title}</title>`
      + `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>`
      + `</head><body><iframe src="/api/account/orders/${orderId}/pdf?raw=1" title="${title}"></iframe></body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

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
        'Content-Disposition': `inline; filename="FTPaints-Order-${orderId}.pdf"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not generate PDF' }, { status: 500 });
  }
}
