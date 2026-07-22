'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import ProductCard from '@/components/ProductCard';

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
}

export default function BuyAgainPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/account/buy-again')
      .then(r => r.json())
      .then(data => setProducts(data.products || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-[#004475]">Buy Again</h1>
          <p className="text-sm text-gray-500 mt-1">Products you&apos;ve ordered before — re-order in one tap.</p>
        </div>

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
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
