import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInvoices, getPartnerByUid, getPartnerInfo } from '@/lib/odoo';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const user = await getPartnerByUid(session.user.uid, session.user.password);
    const partnerId = (user?.partner_id as [number, string])?.[0];
    const partner = await getPartnerInfo(session.user.uid, session.user.password, partnerId);
    const invoices = await getInvoices(session.user.uid, session.user.password, partnerId);

    const partnerName = (partner?.name as string) || session.user.email || 'Customer';
    const now = new Date();
    const totalInvoiced = invoices.reduce((s, i) => s + ((i.amount_total as number) || 0), 0);
    const totalPaid = invoices.reduce((s, i) => s + (((i.amount_total as number) || 0) - ((i.amount_residual as number) || 0)), 0);
    const totalOutstanding = invoices.reduce((s, i) => s + ((i.amount_residual as number) || 0), 0);

    const rows = invoices.map((inv) => {
      const isOverdue = inv.payment_state !== 'paid' && inv.invoice_date_due && new Date(inv.invoice_date_due as string) < now;
      const statusLabel = inv.payment_state === 'paid' ? 'Paid' : inv.payment_state === 'partial' ? 'Partial' : 'Unpaid';
      const statusColor = inv.payment_state === 'paid' ? '#16a34a' : isOverdue ? '#dc2626' : '#d97706';
      return `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:8px 12px;font-family:monospace;font-weight:600;color:#004475;">${inv.name}</td>
          <td style="padding:8px 12px;color:#4b5563;">${inv.invoice_date ? new Date(inv.invoice_date as string).toLocaleDateString('en-GB') : '—'}</td>
          <td style="padding:8px 12px;color:${isOverdue ? '#dc2626' : '#4b5563'};">${inv.invoice_date_due ? new Date(inv.invoice_date_due as string).toLocaleDateString('en-GB') : '—'}${isOverdue ? ' ⚠' : ''}</td>
          <td style="padding:8px 12px;"><span style="background:${statusColor}22;color:${statusColor};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">${statusLabel}</span></td>
          <td style="padding:8px 12px;text-align:right;">£${(inv.amount_total as number).toFixed(2)}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:${(inv.amount_residual as number) > 0 ? '700' : '400'};color:${(inv.amount_residual as number) > 0 ? '#dc2626' : '#4b5563'};">${(inv.amount_residual as number) > 0 ? `£${(inv.amount_residual as number).toFixed(2)}` : '—'}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Account Statement — ${partnerName}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 40px; color: #111; background: #fff; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .logo { font-size: 28px; font-weight: 900; color: #004475; letter-spacing: -1px; }
    .logo span { color: #f97316; }
    .meta { text-align: right; font-size: 13px; color: #6b7280; }
    h2 { font-size: 20px; margin: 0 0 4px; color: #111; }
    .summary { display: flex; gap: 16px; margin-bottom: 28px; }
    .card { flex: 1; background: #f9fafb; border-radius: 10px; padding: 16px 20px; }
    .card .label { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
    .card .value { font-size: 22px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead { background: #f3f4f6; }
    th { padding: 10px 12px; text-align: left; font-weight: 600; color: #374151; font-size: 12px; }
    th:last-child, th:nth-last-child(2) { text-align: right; }
    .footer { margin-top: 40px; font-size: 11px; color: #9ca3af; text-align: center; border-top: 1px solid #f3f4f6; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">FT<span>Paints</span></div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">FTPaints Ltd · sales@ftpaints.co.uk</div>
    </div>
    <div class="meta">
      <h2>Account Statement</h2>
      <div>${partnerName}</div>
      <div>Generated: ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="label">Total Invoiced</div>
      <div class="value" style="color:#004475;">£${totalInvoiced.toFixed(2)}</div>
    </div>
    <div class="card">
      <div class="label">Total Paid</div>
      <div class="value" style="color:#16a34a;">£${totalPaid.toFixed(2)}</div>
    </div>
    <div class="card" style="background:${totalOutstanding > 0 ? '#fff7ed' : '#f0fdf4'};">
      <div class="label">Balance Outstanding</div>
      <div class="value" style="color:${totalOutstanding > 0 ? '#d97706' : '#16a34a'};">£${totalOutstanding.toFixed(2)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Invoice</th>
        <th>Date</th>
        <th>Due Date</th>
        <th>Status</th>
        <th style="text-align:right;">Total</th>
        <th style="text-align:right;">Outstanding</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="footer">
    FTPaints Ltd · All prices exclusive of VAT · 30-day account terms · Registered in England &amp; Wales
  </div>
</body>
</html>`;

    // Return as HTML for browser to print-to-PDF, or as downloadable HTML
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="statement-${now.toISOString().slice(0,10)}.html"`,
      },
    });
  } catch (err) {
    console.error('Statement PDF error:', err);
    return NextResponse.json({ error: 'Failed to generate statement' }, { status: 500 });
  }
}
