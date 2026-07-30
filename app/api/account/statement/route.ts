import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { resolveAccountPartner } from '@/lib/odoo';
import { buildStatement, parseRange } from '@/lib/statement';
import { DEMO_INVOICES, DEMO_PAYMENTS } from '@/lib/demoData';
import type { StatementRow } from '@/types/account';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

function demoStatement(from?: string, to?: string) {
  const entries: Omit<StatementRow, 'balance'>[] = [
    ...DEMO_INVOICES.map(i => ({
      kind: 'invoice' as const, id: i.id, date: i.invoice_date, reference: i.name,
      debit: i.amount_total, credit: 0, dueDate: i.invoice_date_due, outstanding: i.amount_residual,
    })),
    ...DEMO_PAYMENTS.map(p => ({
      kind: 'payment' as const, id: p.id, date: p.date, reference: p.ref || p.name,
      debit: 0, credit: p.amount,
    })),
  ]
    .filter(e => (!to || e.date <= to))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'invoice' ? -1 : 1));

  const openingBalance = (from ? entries.filter(e => e.date < from) : []).reduce((s, e) => s + e.debit - e.credit, 0);
  let running = openingBalance;
  const rows: StatementRow[] = (from ? entries.filter(e => e.date >= from) : entries).map(e => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });

  return {
    openingBalance,
    closingBalance: running,
    rows,
    totals: {
      invoiced: DEMO_INVOICES.reduce((s, i) => s + i.amount_total, 0),
      paid: DEMO_PAYMENTS.reduce((s, p) => s + p.amount, 0),
      outstanding: DEMO_INVOICES.reduce((s, i) => s + i.amount_residual, 0),
      aged: { current: 441.30, d30: 0, d60: 100.00, d90: 0 },
    },
    from: from ?? null,
    to: to ?? null,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { from, to } = parseRange(req.nextUrl.searchParams);

  if (DEMO_MODE) return NextResponse.json(demoStatement(from, to));

  try {
    const { partnerId, commercialId } = await resolveAccountPartner(session.user.uid);
    if (!partnerId || !commercialId) {
      return NextResponse.json({ error: 'No partner record' }, { status: 404 });
    }
    return NextResponse.json(await buildStatement(partnerId, commercialId, from, to));
  } catch {
    return NextResponse.json({ error: 'Could not build statement' }, { status: 500 });
  }
}
