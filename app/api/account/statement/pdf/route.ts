import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveAccountPartner, getPartnerInfo } from '@/lib/odoo';
import { buildStatement, parseRange } from '@/lib/statement';

// Despite the /pdf path this returns HTML for the browser's own print-to-PDF —
// deliberately, so the app carries no PDF-rendering dependency.

const money = (n: number) => `£${n.toFixed(2)}`;
const ukDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { from, to } = parseRange(req.nextUrl.searchParams);

  try {
    const { partnerId, commercialId } = await resolveAccountPartner(session.user.uid);
    if (!partnerId || !commercialId) {
      return NextResponse.json({ error: 'No partner record' }, { status: 404 });
    }

    const [partner, statement] = await Promise.all([
      getPartnerInfo(session.user.uid, '', partnerId),
      buildStatement(partnerId, commercialId, from, to),
    ]);

    const partnerName = escapeHtml((partner?.name as string) || session.user.email || 'Customer');
    const now = new Date();
    const { openingBalance, closingBalance, rows, totals } = statement;

    const rangeLabel = from || to
      ? `${from ? ukDate(from) : 'Start'} – ${to ? ukDate(to) : ukDate(now.toISOString())}`
      : 'All time';

    const rowsHtml = rows.map(r => {
      const isInvoice = r.kind === 'invoice';
      const overdue = isInvoice && (r.outstanding ?? 0) > 0 && r.dueDate && new Date(r.dueDate) < now;
      return `
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:8px 12px;color:#4b5563;">${ukDate(r.date)}</td>
          <td style="padding:8px 12px;">
            <span style="background:${isInvoice ? '#dbeafe' : '#dcfce7'};color:${isInvoice ? '#1e40af' : '#166534'};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">
              ${isInvoice ? 'Invoice' : 'Payment'}
            </span>
          </td>
          <td style="padding:8px 12px;font-family:monospace;font-weight:600;color:#004475;">${escapeHtml(r.reference)}</td>
          <td style="padding:8px 12px;color:${overdue ? '#dc2626' : '#4b5563'};">${isInvoice ? ukDate(r.dueDate || '') : '—'}${overdue ? ' ⚠' : ''}</td>
          <td style="padding:8px 12px;text-align:right;">${r.debit ? money(r.debit) : '—'}</td>
          <td style="padding:8px 12px;text-align:right;color:#16a34a;">${r.credit ? money(r.credit) : '—'}</td>
          <td style="padding:8px 12px;text-align:right;font-weight:600;">${money(r.balance)}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
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
    th.num { text-align: right; }
    tfoot td { padding: 10px 12px; font-weight: 700; border-top: 2px solid #e5e7eb; }
    .aged { display: flex; gap: 12px; margin-top: 28px; }
    .aged div { flex: 1; background: #f9fafb; border-radius: 8px; padding: 12px 14px; font-size: 12px; }
    .aged .label { color: #9ca3af; font-size: 11px; }
    .aged .value { font-weight: 700; font-size: 15px; margin-top: 2px; }
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
      <div>Period: ${rangeLabel}</div>
      <div>Generated: ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <div class="summary">
    <div class="card">
      <div class="label">Opening Balance</div>
      <div class="value" style="color:#004475;">${money(openingBalance)}</div>
    </div>
    <div class="card">
      <div class="label">Invoiced</div>
      <div class="value" style="color:#004475;">${money(totals.invoiced)}</div>
    </div>
    <div class="card">
      <div class="label">Paid</div>
      <div class="value" style="color:#16a34a;">${money(totals.paid)}</div>
    </div>
    <div class="card" style="background:${closingBalance > 0 ? '#fff7ed' : '#f0fdf4'};">
      <div class="label">Closing Balance</div>
      <div class="value" style="color:${closingBalance > 0 ? '#d97706' : '#16a34a'};">${money(closingBalance)}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Reference</th>
        <th>Due Date</th>
        <th class="num">Charges</th>
        <th class="num">Payments</th>
        <th class="num">Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr style="border-bottom:1px solid #f3f4f6;background:#fafafa;">
        <td style="padding:8px 12px;color:#6b7280;" colspan="6">Opening balance</td>
        <td style="padding:8px 12px;text-align:right;font-weight:600;">${money(openingBalance)}</td>
      </tr>
      ${rowsHtml || `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;">No activity in this period</td></tr>`}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align:right;">Closing balance</td>
        <td style="text-align:right;">${money(closingBalance)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="aged">
    <div><div class="label">Current</div><div class="value">${money(totals.aged.current)}</div></div>
    <div><div class="label">1–30 days</div><div class="value">${money(totals.aged.d30)}</div></div>
    <div><div class="label">31–60 days</div><div class="value">${money(totals.aged.d60)}</div></div>
    <div><div class="label">60+ days</div><div class="value" style="color:${totals.aged.d90 > 0 ? '#dc2626' : '#111'};">${money(totals.aged.d90)}</div></div>
  </div>

  <div class="footer">
    FTPaints Ltd · All prices exclusive of VAT · Registered in England &amp; Wales
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="statement-${now.toISOString().slice(0, 10)}.html"`,
      },
    });
  } catch (err) {
    console.error('Statement PDF error:', err);
    return NextResponse.json({ error: 'Failed to generate statement' }, { status: 500 });
  }
}
