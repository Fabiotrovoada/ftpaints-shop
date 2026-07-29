'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { useHiddenBuyAgain } from '@/lib/hiddenBuyAgain';

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  standard_price: number;
  qty_available: number;
  virtual_available: number;
  categ_id: [number, string] | false;
  uom_id: [number, string] | false;
  image_128?: string;
  image_url?: string | null;
  product_tag_ids?: number[];
  /** ISO date of the most recent invoice containing this product */
  last_purchased?: string | null;
}

type SortKey = 'recent' | 'name' | 'price';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent', label: 'Recently bought' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'price', label: 'Price low–high' },
];

export default function BuyAgainPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const { ids: hiddenIds, hide, unhideAll } = useHiddenBuyAgain();

  useEffect(() => {
    fetch('/api/account/buy-again')
      .then(r => r.json())
      .then(data => setProducts(data.products || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  const kept = useMemo(() => products.filter(p => !hiddenIds.has(p.id)), [products, hiddenIds]);
  const hiddenCount = products.length - kept.length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? kept.filter(p =>
          p.name.toLowerCase().includes(q) ||
          (p.default_code || '').toString().toLowerCase().includes(q))
      : kept;

    // 'recent' is the order the API already returns (newest purchase first)
    if (sort === 'recent') return matched;
    const sorted = [...matched];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'price') sorted.sort((a, b) => a.list_price - b.list_price);
    return sorted;
  }, [kept, query, sort]);

  const searching = query.trim().length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#004475]">Buy Again</h1>
            <p className="text-sm text-gray-500 mt-1">
              {loading
                ? 'Loading your purchase history…'
                : kept.length > 0
                  ? `${kept.length} product${kept.length === 1 ? '' : 's'} you've bought from us before — re-order in one tap.`
                  : "Products you've ordered before — re-order in one tap."}
            </p>
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={unhideAll}
              className="flex-shrink-0 text-xs text-[#004475] font-medium hover:underline mt-1"
            >
              ↩ Restore {hiddenCount} removed
            </button>
          )}
        </div>

        {/* Search + sort */}
        {!loading && products.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 mb-5">
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <input
                type="text"
                placeholder="Search your previous purchases..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
              />
            </div>
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
              className="sm:w-52 px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004475]"
            >
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}

        {/* Product grid */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="card animate-pulse">
                <div className="bg-gray-100 h-36" />
                <div className="p-3 space-y-2">
                  <div className="bg-gray-100 rounded h-3 w-1/2" />
                  <div className="bg-gray-100 rounded h-3" />
                  <div className="bg-gray-100 rounded h-3 w-3/4" />
                  <div className="bg-gray-100 rounded h-8 mt-3" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">🛒</div>
            <p className="text-lg font-medium">No previous purchases yet</p>
            <p className="text-sm mt-1">Once you place an order, your products will appear here.</p>
            <Link href="/shop" className="btn-primary inline-block mt-4 px-5 py-2 text-sm">Browse the shop</Link>
          </div>
        ) : visible.length === 0 && searching ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">🔍</div>
            <p className="text-lg font-medium">Nothing matches “{query.trim()}”</p>
            <p className="text-sm mt-1">Try a different product name or code.</p>
            <button onClick={() => setQuery('')} className="btn-primary inline-block mt-4 px-5 py-2 text-sm">
              Clear search
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">🧹</div>
            <p className="text-lg font-medium">You&apos;ve removed all your Buy Again products</p>
            <p className="text-sm mt-1">Use “Restore” above to bring them back, or browse the shop.</p>
            <Link href="/shop" className="btn-primary inline-block mt-4 px-5 py-2 text-sm">Browse the shop</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map(p => <ProductCard key={p.id} product={p} onRemove={() => hide(p.id)} />)}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
