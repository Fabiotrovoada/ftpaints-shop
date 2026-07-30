import { getInvoices, getCustomerPayments } from './odoo';
import type { StatementRow, StatementTotals } from '@/types/account';

/**
 * Builds the merged invoice/payment ledger for a date range.
 *
 * Both the JSON route and the printable view call this, so the printed
 * statement always reconciles with what the customer saw on screen.
 *
 * Everything up to `to` is fetched in one pass and split in memory: rows before
 * `from` collapse into the opening balance, the rest become ledger lines. That
 * keeps it at two RPCs regardless of how wide the range is.
 */

// Wide enough that a heavy trade account's full history still reconciles.
const STATEMENT_LIMIT = 1000;

export interface Statement {
  openingBalance: number;
  closingBalance: number;
  rows: StatementRow[];
  totals: StatementTotals;
  from: string | null;
  to: string | null;
}

function isoDate(v: unknown): string {
  return typeof v === 'string' && v ? v.slice(0, 10) : '';
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads ?from=&to= off a request. Anything that is not a plain ISO date is
 * dropped rather than forwarded into an Odoo domain.
 *
 * Lives here so the JSON route and the printable view parse the range
 * identically — a route handler cannot export a helper of its own.
 */
export function parseRange(params: URLSearchParams): { from?: string; to?: string } {
  const from = params.get('from');
  const to = params.get('to');
  return {
    from: from && ISO_DATE.test(from) ? from : undefined,
    to: to && ISO_DATE.test(to) ? to : undefined,
  };
}

export async function buildStatement(
  partnerId: number,
  commercialId: number,
  from?: string,
  to?: string
): Promise<Statement> {
  const [invoiceRows, paymentRows] = await Promise.all([
    getInvoices(0, '', partnerId, { to, limit: STATEMENT_LIMIT }),
    getCustomerPayments(commercialId, { to, limit: STATEMENT_LIMIT }),
  ]);

  const entries: Omit<StatementRow, 'balance'>[] = [
    ...invoiceRows.map(inv => ({
      kind: 'invoice' as const,
      id: inv.id as number,
      date: isoDate(inv.invoice_date),
      reference: (inv.name as string) || '—',
      debit: (inv.amount_total as number) || 0,
      credit: 0,
      dueDate: isoDate(inv.invoice_date_due),
      outstanding: (inv.amount_residual as number) || 0,
    })),
    ...paymentRows.map(p => ({
      kind: 'payment' as const,
      id: p.id as number,
      date: isoDate(p.date),
      reference: (p.ref as string) || (p.name as string) || 'Payment received',
      debit: 0,
      credit: (p.amount as number) || 0,
    })),
  ].filter(e => e.date);

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'invoice' ? -1 : 1));

  // Anything before the window is history — fold it into one opening figure.
  const before = from ? entries.filter(e => e.date < from) : [];
  const inRange = from ? entries.filter(e => e.date >= from) : entries;
  const openingBalance = before.reduce((s, e) => s + e.debit - e.credit, 0);

  let running = openingBalance;
  const rows: StatementRow[] = inRange.map(e => {
    running += e.debit - e.credit;
    return { ...e, balance: running };
  });

  // Aged debt is deliberately measured against every unpaid invoice we know
  // about, not just the ones inside the window — a debt does not stop being 90
  // days old because the customer picked a narrow date range.
  const now = new Date();
  const aged = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const inv of invoiceRows) {
    const residual = (inv.amount_residual as number) || 0;
    if (residual <= 0) continue;
    const due = isoDate(inv.invoice_date_due);
    const daysOverdue = due
      ? Math.floor((now.getTime() - new Date(due).getTime()) / 86_400_000)
      : 0;
    if (daysOverdue <= 0) aged.current += residual;
    else if (daysOverdue <= 30) aged.d30 += residual;
    else if (daysOverdue <= 60) aged.d60 += residual;
    else aged.d90 += residual;
  }

  const totals: StatementTotals = {
    invoiced: invoiceRows.reduce((s, i) => s + ((i.amount_total as number) || 0), 0),
    paid: paymentRows.reduce((s, p) => s + ((p.amount as number) || 0), 0),
    outstanding: invoiceRows.reduce((s, i) => s + ((i.amount_residual as number) || 0), 0),
    aged,
  };

  return {
    openingBalance,
    closingBalance: running,
    rows,
    totals,
    from: from ?? null,
    to: to ?? null,
  };
}
