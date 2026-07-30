'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { StatementRow, StatementTotals } from '@/types/account';

const money = (n: number) => `£${n.toFixed(2)}`;
const ukDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface StatementData {
  openingBalance: number;
  closingBalance: number;
  rows: StatementRow[];
  totals: StatementTotals;
}

type PresetKey = 'month' | 'quarter' | 'year' | 'custom';

/** Returns the from/to for a preset. `custom` is driven by the two date inputs. */
function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const to = iso(now);
  if (key === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
  if (key === 'quarter') return { from: iso(new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())), to };
  return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 3 months' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

export default function StatementPage() {
  const { data: session } = useSession();
  const [preset, setPreset] = useState<PresetKey>('quarter');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);

  const range = preset === 'custom'
    ? { from: customFrom, to: customTo }
    : presetRange(preset);

  const query = useCallback(() => {
    const params = new URLSearchParams();
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    return params.toString();
  }, [range.from, range.to]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    fetch(`/api/account/statement?${query()}`)
      .then(r => r.json())
      .then(d => { setData(d?.rows ? d : null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session, query]);

  const aged = data?.totals.aged;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Statement</h1>
          <p className="text-gray-500 text-sm">Invoices and payments on your account, with a running balance</p>
        </div>
        <a
          href={`/api/account/statement/pdf?${query()}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline text-sm inline-flex items-center gap-2"
        >
          📄 Print statement
        </a>
      </div>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {PRESETS.map(p => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
              preset === p.key
                ? 'bg-[#004475] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs text-gray-500">
            <span className="block mb-1">From</span>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]" />
          </label>
          <label className="text-xs text-gray-500">
            <span className="block mb-1">To</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]" />
          </label>
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-gray-400">Loading statement...</div>
      ) : !data ? (
        <div className="card p-12 text-center text-gray-400 text-sm">Could not load your statement. Please try again.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Opening balance</p>
              <p className="text-xl font-bold text-[#004475]">{money(data.openingBalance)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Invoiced</p>
              <p className="text-xl font-bold text-[#004475]">{money(data.totals.invoiced)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-gray-500 mb-1">Paid</p>
              <p className="text-xl font-bold text-green-600">{money(data.totals.paid)}</p>
            </div>
            <div className={`card p-4 ${data.closingBalance > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
              <p className="text-xs text-gray-500 mb-1">Closing balance</p>
              <p className={`text-xl font-bold ${data.closingBalance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {money(data.closingBalance)}
              </p>
            </div>
          </div>

          <div className="card overflow-hidden mb-5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Type</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Reference</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Due</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Charges</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Payments</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-gray-50/60">
                    <td colSpan={6} className="px-4 py-2 text-gray-500">Opening balance</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-700">{money(data.openingBalance)}</td>
                  </tr>
                  {data.rows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No activity in this period</td></tr>
                  ) : data.rows.map(r => {
                    const overdue = r.kind === 'invoice' && (r.outstanding ?? 0) > 0
                      && !!r.dueDate && new Date(r.dueDate) < new Date();
                    return (
                      <tr key={`${r.kind}-${r.id}`} className={overdue ? 'bg-red-50/40' : ''}>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{ukDate(r.date)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            r.kind === 'invoice' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                          }`}>
                            {r.kind === 'invoice' ? 'Invoice' : 'Payment'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[#004475] font-medium">{r.reference}</td>
                        <td className={`px-4 py-3 whitespace-nowrap ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          {r.kind === 'invoice' ? ukDate(r.dueDate || '') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{r.debit ? money(r.debit) : '—'}</td>
                        <td className="px-4 py-3 text-right text-green-600">{r.credit ? money(r.credit) : '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{money(r.balance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={6} className="px-4 py-3 text-right font-bold text-gray-900">Closing balance</td>
                    <td className="px-4 py-3 text-right font-bold text-[#004475]">{money(data.closingBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {aged && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-700 text-sm mb-3">Aged debt</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { label: 'Current', value: aged.current, danger: false },
                  { label: '1–30 days', value: aged.d30, danger: false },
                  { label: '31–60 days', value: aged.d60, danger: aged.d60 > 0 },
                  { label: '60+ days', value: aged.d90, danger: aged.d90 > 0 },
                ]).map(bucket => (
                  <div key={bucket.label} className={`rounded-lg p-3 ${bucket.danger ? 'bg-red-50' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-500">{bucket.label}</p>
                    <p className={`text-lg font-bold mt-0.5 ${bucket.danger ? 'text-red-600' : 'text-gray-900'}`}>
                      {money(bucket.value)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Measured against every unpaid invoice on your account, not just this period.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
