'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import type { Invoice, StoreCreditInfo } from '@/types/account';

const money = (n: number) => `£${n.toFixed(2)}`;
const ukDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unpaid', label: 'Unpaid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
  { key: 'credits', label: 'Credit Notes' },
];

export default function InvoicesPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [storeCredit, setStoreCredit] = useState<StoreCreditInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const goToPay = (invoice?: string) => router.push(invoice ? `/account/pay?invoice=${invoice}` : '/account/pay');

  useEffect(() => {
    if (!session) return;
    Promise.all([
      fetch('/api/account/invoices').then(r => r.json()),
      fetch('/api/account/store-credit').then(r => r.json()),
    ])
      .then(([invoicesData, storeCreditData]) => {
        setInvoices(invoicesData.invoices || []);
        setStoreCredit(storeCreditData ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session]);

  const isOverdue = (inv: Invoice) =>
    inv.amount_residual > 0 && !!inv.invoice_date_due && new Date(inv.invoice_date_due) < new Date();

  const visible = useMemo(() => invoices.filter(inv => {
    if (from && inv.invoice_date < from) return false;
    if (to && inv.invoice_date > to) return false;
    if (filter === 'unpaid') return inv.amount_residual > 0;
    if (filter === 'overdue') return isOverdue(inv);
    if (filter === 'paid') return inv.amount_residual <= 0;
    return true;
  }), [invoices, filter, from, to]);

  const outstanding = invoices.filter(i => i.amount_residual > 0);
  const totalOutstanding = outstanding.reduce((s, i) => s + i.amount_residual, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Invoices</h1>
      <p className="text-gray-500 text-sm mb-6">Everything invoiced to your account</p>

      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
              filter === f.key
                ? 'bg-[#004475] text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter !== 'credits' && (
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-xs text-gray-500">
            <span className="block mb-1">From</span>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]" />
          </label>
          <label className="text-xs text-gray-500">
            <span className="block mb-1">To</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]" />
          </label>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo(''); }} className="text-sm text-[#004475] font-medium hover:underline pb-2">
              Clear dates
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : filter === 'credits' ? (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 bg-gray-50">
            <p className="text-sm font-semibold text-gray-700">
              {(storeCredit?.creditNotes.length ?? 0)} credit note{storeCredit?.creditNotes.length !== 1 ? 's' : ''}
            </p>
          </div>

          {!storeCredit?.creditNotes.length ? (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">No credit notes yet</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {storeCredit.creditNotes.map(note => (
                <div key={note.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-semibold text-[#004475] text-sm">{note.name}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      note.amount_residual > 0 ? 'bg-[#eef6fc] text-[#004475]' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {note.amount_residual > 0 ? 'Available' : 'Used'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-2">
                    <span>Issued: <span className="text-gray-700">{ukDate(note.invoice_date)}</span></span>
                    <span>Total: <span className="text-gray-800 font-medium">{money(note.amount_total)}</span></span>
                    {/* <span>Available: <span className="text-[#004475] font-bold">{money(note.amount_residual)}</span></span> */}
                  </div>
                  <button
                    onClick={() => window.open(`/api/account/invoices/${note.id}/pdf`, '_blank')}
                    className="w-full text-xs bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-[#004475] hover:text-white font-medium transition-colors"
                  >
                    📄 Credit Note PDF
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
            <p className="text-sm font-semibold text-gray-700">
              {visible.length} invoice{visible.length !== 1 ? 's' : ''}
            </p>
            {outstanding.length > 0 && (
              <button onClick={() => goToPay()} className="btn-primary text-sm py-2 px-4 flex-shrink-0">
                💳 Pay {outstanding.length} outstanding ({money(totalOutstanding)})
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-gray-400 text-sm">
              {invoices.length === 0 ? 'No invoices yet' : 'No invoices match those filters'}
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {visible.map(inv => {
                const overdue = isOverdue(inv);
                return (
                  <div key={inv.id} className={`px-4 py-3 ${overdue ? 'bg-red-50/40' : ''}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-semibold text-[#004475] text-sm">{inv.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        inv.payment_state === 'paid' ? 'bg-green-100 text-green-700'
                          : overdue ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {inv.payment_state === 'paid' ? 'Paid'
                          : inv.payment_state === 'partial' ? 'Partial'
                          : overdue ? '⚠️ Overdue' : 'Unpaid'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-2">
                      <span>Issued: <span className="text-gray-700">{ukDate(inv.invoice_date)}</span></span>
                      <span>Due: <span className={overdue ? 'text-red-600 font-semibold' : 'text-gray-700'}>{ukDate(inv.invoice_date_due)}</span></span>
                      <span>Total: <span className="text-gray-800 font-medium">{money(inv.amount_total)}</span></span>
                      {inv.amount_residual > 0 && (
                        <span>Outstanding: <span className="text-red-600 font-bold">{money(inv.amount_residual)}</span></span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => window.open(`/api/account/invoices/${inv.id}/pdf`, '_blank')}
                        className="flex-1 text-xs bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-[#004475] hover:text-white font-medium transition-colors"
                      >
                        📄 Invoice PDF
                      </button>
                      {inv.amount_residual > 0 && (
                        <button
                          onClick={() => goToPay(inv.name)}
                          className="flex-1 text-xs bg-[#004475] text-white py-2 rounded-lg hover:bg-[#ff8f00] font-semibold transition-colors"
                        >
                          💳 Pay Now
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
