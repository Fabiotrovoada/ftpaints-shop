'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Order, Invoice, CreditInfo } from '@/types/account';

const money = (n: number) => `£${n.toFixed(2)}`;
const ukDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="card p-12 text-center text-gray-400">Loading...</div>}>
      <AccountPageInner />
    </Suspense>
  );
}

function AccountPageInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [credit, setCredit] = useState<CreditInfo | null>(null);
  const [loading, setLoading] = useState(true);
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
      const [ordersRes, invoicesRes, creditRes] = await Promise.all([
        fetch('/api/account/orders'),
        fetch('/api/account/invoices'),
        fetch('/api/account/credit'),
      ]);
      const [ordersData, invoicesData, creditData] = await Promise.all([
        ordersRes.json(), invoicesRes.json(), creditRes.json(),
      ]);
      setOrders(ordersData.orders || []);
      setInvoices(invoicesData.invoices || []);
      setCredit(creditData ?? null);
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

  const creditRemaining = credit ? Math.max(0, credit.limit - credit.used) : 0;
  const creditPct = credit && credit.limit > 0 ? Math.min(100, (credit.used / credit.limit) * 100) : 0;

  return (
    <div>
      {paySuccess && (
        <div className="bg-green-500 text-white text-center py-3 text-sm font-medium rounded-lg mb-4">
          ✅ Payment received! Your account will be updated within 1-2 working days.
        </div>
      )}
      {payCancelled && (
        <div className="bg-amber-500 text-white text-center py-3 text-sm font-medium rounded-lg mb-4">
          Payment cancelled — no charge was made.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
          {session?.user?.name && (
            <p className="text-sm text-gray-500 mt-0.5">Welcome back, {session.user.name}</p>
          )}
        </div>
        {totalOutstanding > 0 && (
          <button onClick={() => goToPay()} className="btn-primary flex items-center gap-2">
            💳 Pay Outstanding — {money(totalOutstanding)}
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-gray-500 mb-1">This Month</p>
          <p className="text-xl font-bold text-[#004475]">{money(thisMonthSpend)}</p>
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
            {money(totalOutstanding)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{outstanding.length} invoice{outstanding.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={`card p-4 ${totalOverdue > 0 ? 'border-red-200 bg-red-50' : ''}`}>
          <p className="text-xs text-gray-500 mb-1">Overdue</p>
          <p className={`text-xl font-bold ${totalOverdue > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {money(totalOverdue)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{totalOverdue > 0 ? 'Action required' : 'All clear'}</p>
        </div>
      </div>

      {/* Credit panel */}
      {credit && credit.limit > 0 && (
        <div className={`card p-5 mb-6 ${credit.onStop ? 'border-red-300 bg-red-50' : ''}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="font-bold text-gray-900">Credit Account</h2>
              {credit.paymentTermName && (
                <p className="text-xs text-gray-500 mt-0.5">Payment terms: {credit.paymentTermName}</p>
              )}
            </div>
            {credit.onStop ? (
              <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                🛑 ACCOUNT ON STOP
              </span>
            ) : (
              <span className="text-sm font-semibold text-[#004475]">
                {money(creditRemaining)} available
              </span>
            )}
          </div>

          <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                credit.onStop ? 'bg-red-600' : creditPct > 80 ? 'bg-amber-500' : 'bg-[#004475]'
              }`}
              style={{ width: `${creditPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{money(credit.used)} used</span>
            <span>{money(credit.limit)} limit</span>
          </div>

          {credit.onStop && (
            <p className="text-sm text-red-700 mt-3">
              Your account has reached its credit limit. Please settle your outstanding balance to
              continue ordering, or contact{' '}
              <a href="mailto:sales@ftpaints.co.uk" className="font-medium underline">sales@ftpaints.co.uk</a>.
            </p>
          )}
        </div>
      )}

      {/* Overdue banner */}
      {totalOverdue > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-red-800">You have overdue invoices</p>
              <p className="text-sm text-red-600">{money(totalOverdue)} is overdue — please pay to avoid account restrictions</p>
            </div>
          </div>
          <button onClick={() => goToPay()} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">
            Pay Now
          </button>
        </div>
      )}

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent orders */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm">Recent Orders</h2>
              <Link href="/account/orders" className="text-xs text-[#004475] font-medium hover:underline">View all</Link>
            </div>
            {orders.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">No orders yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {orders.slice(0, 5).map(o => (
                  <Link key={o.id} href={`/account/orders/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="font-mono font-semibold text-[#004475] text-sm truncate">{o.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{ukDate(o.date_order)}</p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 flex-shrink-0">{money(o.amount_total)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding invoices */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm">Outstanding Invoices</h2>
              <Link href="/account/invoices" className="text-xs text-[#004475] font-medium hover:underline">View all</Link>
            </div>
            {outstanding.length === 0 ? (
              <p className="px-4 py-8 text-center text-gray-400 text-sm">✅ All paid up</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {outstanding.slice(0, 5).map(inv => {
                  const isOverdue = inv.invoice_date_due && new Date(inv.invoice_date_due) < new Date();
                  return (
                    <div key={inv.id} className={`flex items-center justify-between gap-2 px-4 py-3 ${isOverdue ? 'bg-red-50/40' : ''}`}>
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-[#004475] text-sm truncate">{inv.name}</p>
                        <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          Due {ukDate(inv.invoice_date_due)}{isOverdue ? ' · overdue' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-bold text-gray-900">{money(inv.amount_residual)}</span>
                        <button onClick={() => goToPay(inv.name)} className="text-xs bg-[#004475] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#ff8f00] font-semibold transition-colors">
                          Pay
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
