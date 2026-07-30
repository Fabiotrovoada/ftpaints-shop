'use client';
import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import type { Order } from '@/types/account';
import { stateBadge, ORDER_FILTERS as FILTERS } from '@/lib/orderState';

const money = (n: number) => `£${n.toFixed(2)}`;
const ukDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

export default function OrdersPage() {
  const { data: session } = useSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!session) return;
    fetch('/api/account/orders')
      .then(r => r.json())
      .then(d => { setOrders(d.orders || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session]);

  const visible = useMemo(() => {
    const states = FILTERS.find(f => f.key === filter)?.states ?? [];
    const q = search.trim().toLowerCase();
    return orders.filter(o =>
      (states.length === 0 || states.includes(o.state)) &&
      (!q || o.name.toLowerCase().includes(q))
    );
  }, [orders, filter, search]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Orders</h1>
      <p className="text-gray-500 text-sm mb-6">Every order and quotation on your account</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by order reference…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475] focus:border-transparent"
        />
      </div>

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

      {loading ? (
        <div className="card p-8 text-center text-gray-400">Loading...</div>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center text-gray-400 text-sm">
          {orders.length === 0 ? 'No orders yet' : 'No orders match those filters'}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-100">
            {visible.map(o => {
              const badge = stateBadge(o.state);
              return (
                <div key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <Link href={`/account/orders/${o.id}`} className="min-w-0 group">
                      <p className="font-mono font-semibold text-[#004475] text-sm truncate group-hover:underline">{o.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{ukDate(o.date_order)} · {money(o.amount_total)}</p>
                    </Link>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/account/orders/${o.id}`}
                      className="flex-1 text-center text-xs bg-[#004475] text-white py-2 rounded-lg hover:bg-[#ff8f00] font-semibold transition-colors"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => window.open(`/api/account/orders/${o.id}/pdf`, '_blank')}
                      className="flex-1 text-xs bg-gray-100 text-gray-700 py-2 rounded-lg hover:bg-[#004475] hover:text-white font-medium transition-colors"
                    >
                      📄 View Order PDF
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
