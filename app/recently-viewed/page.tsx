'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import { useRecentlyViewed, MAX_RECENTLY_VIEWED } from '@/lib/recentlyViewed';

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
  /** ISO timestamp of the last view — merged in from the local store, not Odoo */
  viewed_at?: string | null;
}

export default function RecentlyViewedPage() {
  const { items, remove, clear } = useRecentlyViewed();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // The store rehydrates from localStorage after mount, so rendering before
  // that would flash the empty state at a returning customer.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    // Snapshot the ids: `items` is deliberately not a dependency, so removing a
    // card filters locally instead of refetching the whole list.
    const ids = useRecentlyViewed.getState().items.map(i => i.id);
    if (ids.length === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    fetch(`/api/products?ids=${ids.join(',')}`)
      .then(r => r.json())
      .then(data => {
        const fetched: Product[] = data.products || [];
        setProducts(fetched);
        // Anything the catalogue no longer returns has been archived or deleted
        // in Odoo — drop it so dead ids don't sit in localStorage forever.
        const alive = new Set(fetched.map(p => p.id));
        ids.filter(id => !alive.has(id)).forEach(remove);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // The API returns products in the id order we asked for, so this preserves
  // newest-viewed-first for free.
  const visible = useMemo(() => {
    const viewedAt = new Map(items.map(i => [i.id, i.viewedAt]));
    return products
      .filter(p => viewedAt.has(p.id))
      .map(p => ({ ...p, viewed_at: viewedAt.get(p.id) }));
  }, [products, items]);

  const busy = !mounted || loading;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#004475]">Recently Viewed</h1>
            <p className="text-sm text-gray-500 mt-1">
              {busy
                ? 'Loading the products you looked at…'
                : visible.length > 0
                  ? `The last ${visible.length} product${visible.length === 1 ? '' : 's'} you looked at, newest first.`
                  : 'Products you open show up here so you can find them again.'}
            </p>
          </div>
          {!busy && visible.length > 0 && (
            <button
              onClick={clear}
              className="flex-shrink-0 text-xs text-[#004475] font-medium hover:underline mt-1"
            >
              ✕ Clear all
            </button>
          )}
        </div>

        {/* Product grid */}
        {busy ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
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
        ) : visible.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="text-5xl mb-3">👁</div>
            <p className="text-lg font-medium">You haven&apos;t viewed any products yet</p>
            <p className="text-sm mt-1">
              Open a product and it will appear here — we remember the last {MAX_RECENTLY_VIEWED}.
            </p>
            <Link href="/shop" className="btn-primary inline-block mt-4 px-5 py-2 text-sm">Browse the shop</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visible.map(p => (
              <ProductCard
                key={p.id}
                product={p}
                onRemove={() => remove(p.id)}
                removeLabel="✕ Remove from Recently Viewed"
              />
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
