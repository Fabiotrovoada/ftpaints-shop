import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInvoicePdf } from '@/lib/odoo';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const invoiceId = parseInt(id);
  if (isNaN(invoiceId)) return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });

  // Opened as a browser tab (top-level navigation): return a tiny HTML shell whose
  // <title> controls the tab title, embedding the PDF full-screen. Chrome ignores the
  // Content-Disposition filename for an inline PDF's tab title, so this is the only
  // reliable lever. The iframe requests ?raw=1 below to get the actual PDF bytes.
  const wantsHtml = (req.headers.get('accept') || '').includes('text/html')
    && new URL(req.url).searchParams.get('raw') !== '1';
  if (wantsHtml) {
    const title = `FTPaints Invoice ${invoiceId}`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>`
      + `<meta name="viewport" content="width=device-width, initial-scale=1"/>`
      + `<title>${title}</title>`
      + `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>`
      + `</head><body><iframe src="/api/account/invoices/${invoiceId}/pdf?raw=1" title="${title}"></iframe></body></html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const pdfBuffer = await getInvoicePdf(session.user.uid, '', invoiceId);
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="FTPaints-Invoice-${invoiceId}.pdf"`,
      },
    });
  } catch (err) {
    console.error('Invoice PDF error:', err);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}
