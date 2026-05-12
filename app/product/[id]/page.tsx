'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCart } from '@/components/CartContext';
import { ArrowLeft, ShoppingCart, Plus, Minus, Loader2 } from 'lucide-react';

function stockLabel(qty: number, virtual: number) {
  if (qty > 10) return { label: 'In Stock', color: 'text-green-600 bg-green-50', dot: 'bg-green-500' };
  if (qty > 0) return { label: `Low stock (${qty} left)`, color: 'text-amber-600 bg-amber-50', dot: 'bg-amber-500' };
  if (virtual > 0) return { label: 'Available to order', color: 'text-blue-600 bg-blue-50', dot: 'bg-blue-500' };
  return { label: 'Out of stock', color: 'text-red-600 bg-red-50', dot: 'bg-red-500' };
}

export default function ProductPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch(`/api/product?id=${id}`)
      .then(r => r.json())
      .then(d => { setProduct(d.product); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={32} className="animate-spin text-[#004475]" />
    </div>
  );
  if (!product) return <div className="text-center py-32 text-gray-400">Product not found</div>;

  const stock = stockLabel(product.qty_available, product.virtual_available);

  const handleAdd = () => {
    addItem({
      product_id: product.id,
      name: product.name,
      default_code: product.default_code || '',
      price: product.list_price,
      qty,
      qty_available: product.qty_available,
      virtual_available: product.virtual_available,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-[#004475] hover:text-[#f97316] mb-6 text-sm font-medium transition-colors">
        <ArrowLeft size={16} /> Back to products
      </button>

      <div className="card p-6 md:p-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Image placeholder */}
          <div className="bg-gray-50 rounded-xl h-64 flex items-center justify-center border border-gray-100">
            <span className="text-7xl">🎨</span>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-4">
            {product.default_code && (
              <span className="text-xs text-gray-400 font-mono">SKU: {product.default_code}</span>
            )}
            <h1 className="text-2xl font-bold text-[#004475]">{product.name}</h1>

            {product.categ_id && (
              <span className="text-xs text-gray-500">{product.categ_id[1]}</span>
            )}

            {/* Stock badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium w-fit ${stock.color}`}>
              <span className={`w-2 h-2 rounded-full ${stock.dot}`} />
              {stock.label}
            </div>

            <div className="text-3xl font-bold text-[#004475]">
              £{product.list_price.toFixed(2)}
              {product.uom_id && <span className="text-sm text-gray-400 font-normal ml-2">per {product.uom_id[1]}</span>}
            </div>

            {/* Qty + Add */}
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-2 hover:bg-gray-100 transition-colors text-gray-600">
                  <Minus size={16} />
                </button>
                <span className="px-4 py-2 font-semibold text-gray-800 min-w-[3rem] text-center">{qty}</span>
                <button onClick={() => setQty(q => q + 1)} className="px-3 py-2 hover:bg-gray-100 transition-colors text-gray-600">
                  <Plus size={16} />
                </button>
              </div>

              <button
                onClick={handleAdd}
                className="flex-1 flex items-center justify-center gap-2 bg-[#f97316] hover:bg-[#ea6c10] text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                <ShoppingCart size={18} />
                {added ? '✓ Added to basket' : 'Add to Basket'}
              </button>
            </div>
          </div>
        </div>

        {/* Description */}
        {(product.description_sale || product.description) && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h2 className="font-semibold text-[#004475] mb-3">Product Description</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {product.description_sale || product.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
