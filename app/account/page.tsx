'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';

interface Order {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  state: string;
}

interface Invoice {
  id: number;
  name: string;
  invoice_date: string;
  invoice_date_due: string;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
}

function openInvoicePdf(invoiceId: number) {
  window.open(`/api/account/invoices/${invoiceId}/pdf`, '_blank');
}

export default function AccountPage() {
  return <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">Loading...</div>}><AccountPageInner /></Suspense>;
}

function AccountPageInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'orders' | 'invoices' | 'statement'>('orders');
  const [paySuccess, setPaySuccess] = useState(false);
  const [payCancelled, setPayCancelled] = useState(false);
  const goToPay = (invoice?: string) => router.push(invoice ? `/account/pay?invoice=${invoice}` : '/account/pay');

  useEffect(() => {
    if (searchParams?.get('payment') === 'success') setPaySuccess(true);
    if (searchParams?.get('payment') === 'cancelled') setPayCancelled(true);
  }, [searchParams]);

  useEffect(() => {
    if (!session) return;
    async function load() {
      const [ordersRes, invoicesRes] = await Promise.all([
        fetch('/api/account/orders'),
        fetch('/api/account/invoices'),
      ]);
      const ordersData = await ordersRes.json();
      const invoicesData = await invoicesRes.json();
      setOrders(ordersData.orders || []);
      setInvoices(invoicesData.invoices || []);
      setLoading(false);
    }
    load();
  }, [session]);

  const outstanding = invoices.filter(i => i.payment_state !== 'paid');
  const totalOutstanding = outstanding.reduce((s, i) => s + i.amount_residual, 0);
  const totalOverdue = outstanding
    .filter(i => i.invoice_date_due && new Date(i.invoice_date_due) < new Date())
    .reduce((s, i) => s + i.amount_residual, 0);
  const thisMonthSpend = orders
    .filter(o => new Date(o.date_order) >= new Date(new Date().getFullYear(), new Date().getMonth(), 1))
    .reduce((s, o) => s + o.amount_total, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {paySuccess && (
        <div className="bg-green-500 text-white text-center py-3 text-sm font-medium">
          ✅ Payment received! Your account will be updated within 1-2 working days.
        </div>
      )}
      {payCancelled && (
        <div className="bg-amber-500 text-white text-center py-3 text-sm font-medium">
          Payment cancelled — no charge was made.
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
          {totalOutstanding > 0 && (
            <button
              onClick={() => goToPay()}
              className="btn-primary flex items-center gap-2"
            >
              💳 Pay Outstanding — £{totalOutstanding.toFixed(2)}
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">This Month</p>
            <p className="text-xl font-bold text-[#004475]">£{thisMonthSpend.toFixed(2)}</p>
            <p className="text-xs text-gray-400 mt-0.5">Spend</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Total Orders</p>
            <p className="text-xl font-bold text-[#004475]">{orders.length}</p>
            <p className="text-xs text-gray-400 mt-0.5">All time</p>
          </div>
          <div className={`card p-4 ${totalOutstanding > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
            <p className="text-xs text-gray-500 mb-1">Outstanding</p>
            <p className={`text-xl font-bold ${totalOutstanding > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              £{totalOutstanding.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{outstanding.length} invoice{outstanding.length !== 1 ? 's' : ''}</p>
          </div>
          <div className={`card p-4 ${totalOverdue > 0 ? 'border-red-200 bg-red-50' : ''}`}>
            <p className="text-xs text-gray-500 mb-1">Overdue</p>
            <p className={`text-xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-green-600'}`}>
              £{totalOverdue.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{totalOverdue > 0 ? 'Action required' : 'All clear'}</p>
          </div>
        </div>

        {/* Pay now banner */}
        {totalOverdue > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <p className="font-semibold text-red-800">You have overdue invoices</p>
                <p className="text-sm text-red-600">£{totalOverdue.toFixed(2)} is overdue — please pay to avoid account restrictions</p>
              </div>
            </div>
            <button onClick={() => goToPay()} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
              Pay Now
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
          {([
            { key: 'orders', label: 'Orders' },
            { key: 'invoices', label: `Invoices ${outstanding.length > 0 ? `(${outstanding.length} unpaid)` : ''}` },
            { key: 'statement', label: 'Statement' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-white text-[#004475] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-8 text-center text-gray-400">Loading...</div>
        ) : tab === 'orders' ? (
          <div className="card overflow-hidden">
            {orders.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">No orders yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.map(o => (
                  <div key={o.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-[#004475] text-sm truncate">{o.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(o.date_order).toLocaleDateString('en-GB')} · £{o.amount_total.toFixed(2)}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                        o.state==='draft' ? 'bg-yellow-100 text-yellow-700' :
                        o.state==='sent'  ? 'bg-orange-100 text-orange-700' :
                        o.state==='sale'  ? 'bg-green-100 text-green-700' :
                        o.state==='done'  ? 'bg-blue-100 text-blue-700' :
                        o.state==='cancel'? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {o.state==='draft'  ? '📋 Quotation' :
                         o.state==='sent'   ? '📤 Sent' :
                         o.state==='sale'   ? '✅ Confirmed' :
                         o.state==='done'   ? '📦 Complete' :
                         o.state==='cancel' ? '❌ Cancelled' : o.state}
                      </span>
                    </div>
                    <button
                      onClick={() => window.open(`/api/account/orders/${o.id}/pdf`, '_blank')}
                      className="w-full text-xs bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-[#004475] hover:text-white font-medium transition-colors"
                    >
                      📄 View Order PDF
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : tab === 'invoices' ? (
          <div className="card overflow-hidden">
            <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between bg-gray-50 flex-wrap gap-2">
              <p className="text-sm font-semibold text-gray-700">{invoices.length} invoices</p>
              {outstanding.length > 0 && (
                <button onClick={() => goToPay()}
                  className="btn-primary text-sm py-2 px-4 flex-shrink-0">
                  💳 Pay {outstanding.length} outstanding (£{totalOutstanding.toFixed(2)})
                </button>
              )}
            </div>
            {/* Mobile-friendly invoice cards */}
            <div className="divide-y divide-gray-100">
              {invoices.map(inv => {
                const isOverdue = inv.payment_state !== 'paid' && inv.invoice_date_due && new Date(inv.invoice_date_due) < new Date();
                return (
                  <div key={inv.id} className={`px-4 py-3 ${isOverdue ? 'bg-red-50/40' : ''}`}>
                    {/* Top row: invoice number + status */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-semibold text-[#004475] text-sm">{inv.name}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${inv.payment_state==='paid' ? 'bg-green-100 text-green-700' : isOverdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {inv.payment_state==='paid' ? 'Paid' : inv.payment_state==='partial' ? 'Partial' : isOverdue ? '⚠️ Overdue' : 'Unpaid'}
                      </span>
                    </div>
                    {/* Middle row: dates + amounts */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500 mb-2">
                      <span>Issued: <span className="text-gray-700">{new Date(inv.invoice_date).toLocaleDateString('en-GB')}</span></span>
                      <span>Due: <span className={isOverdue ? 'text-red-600 font-semibold' : 'text-gray-700'}>{inv.invoice_date_due ? new Date(inv.invoice_date_due).toLocaleDateString('en-GB') : '—'}</span></span>
                      <span>Total: <span className="text-gray-800 font-medium">£{inv.amount_total.toFixed(2)}</span></span>
                      {inv.amount_residual > 0 && (
                        <span>Outstanding: <span className="text-red-600 font-bold">£{inv.amount_residual.toFixed(2)}</span></span>
                      )}
                    </div>
                    {/* Bottom row: actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => openInvoicePdf(inv.id)}
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
          </div>
        ) : (
          /* Statement tab */
          <div className="space-y-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Account Statement</h3>
                <a
                  href="/api/account/statement/pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-[#004475] hover:text-white font-medium transition-colors inline-flex items-center gap-2"
                >
                  📄 Download Statement
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Total invoiced (all time)</p>
                  <p className="text-xl font-bold text-gray-900">£{invoices.reduce((s,i)=>s+i.amount_total,0).toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Total paid</p>
                  <p className="text-xl font-bold text-green-600">£{invoices.reduce((s,i)=>s+(i.amount_total-i.amount_residual),0).toFixed(2)}</p>
                </div>
              </div>

              {totalOutstanding > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-amber-800">Current balance due</p>
                    <p className="text-2xl font-bold text-amber-700">£{totalOutstanding.toFixed(2)}</p>
                    <p className="text-xs text-amber-600 mt-0.5">{outstanding.length} invoice{outstanding.length!==1?'s':''} outstanding</p>
                  </div>
                  <div className="space-y-2">
                    <button onClick={() => goToPay()}
                      className="block bg-[#004475] text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-[#ff8f00] text-sm transition-colors">
                      💳 Pay by Card
                    </button>
                    <button onClick={() => goToPay()}
                      className="block w-full text-center border border-[#004475] text-[#004475] font-medium px-5 py-2 rounded-lg hover:bg-[#f0f7f4] text-sm transition-colors">
                      🏦 Bank Transfer
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
