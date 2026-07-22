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

interface Variant {
  id: number;
  name: string;
  merged_name: string;
  price: number;
  is_special_price?: boolean;
  special_price?: number;
  internal_reference?: string;
  barcode?: string;
  description_sale?: string;
  description_ecommerce?: string;
  attribute_values?: Array<{ attribute_id: number; name: string; display_name: string; attribute_value_id: number }>;
  qty_available?: number;
  virtual_available?: number;
  other_images?: string[];
  bulk_deal_values?: Array<{ qty: number; price: number }>;
}

interface Product {
  id: number;
  name: string;
  default_code?: string;
  list_price: number;
  original_price?: number;
  standard_price?: number;
  qty_available: number;
  virtual_available: number;
  categ_id?: [number, string];
  uom_id?: [number, string];
  image_url?: string;
  description_sale?: string;
  description?: string;
  variant_ids: Variant[];
  variant_count?: number;
  type?: string;
  barcode?: string;
  quantity_breaks?: Array<{ qty: number; price: number }>;
  offer?: string;
  shipping?: string;
  rating?: number;
  product_tag_ids?: number[];
}

export default function ProductPage() {
  const { id } = useParams();
  const router = useRouter();
  const { addItem } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);

  useEffect(() => {
    fetch(`/api/product?id=${id}`)
      .then(r => r.json())
      .then(d => {
        const p = d.product as Product;
        setProduct(p);
        if (p?.variant_ids?.length > 0) {
          setSelectedVariant(p.variant_ids[0]);
        }
        setLoading(false);
      });
  }, [id]);

  // When variant changes, cap qty at available stock
  useEffect(() => {
    if (!selectedVariant) return;
    const maxStock = selectedVariant.qty_available ?? selectedVariant.virtual_available ?? 999;
    if (qty > maxStock && maxStock > 0) {
      setQty(maxStock);
    }
  }, [selectedVariant, qty]);

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 size={32} className="animate-spin text-[#004475]" />
    </div>
  );
  if (!product) return <div className="text-center py-32 text-gray-400">Product not found</div>;

  const displayVariant = selectedVariant;
  const displayPrice = displayVariant ? (displayVariant.is_special_price ? displayVariant.special_price! : displayVariant.price) : product.list_price;
  const displaySku = displayVariant?.internal_reference || product.default_code || '';
  const displayStock = displayVariant ? { qty: displayVariant.qty_available ?? 0, virtual: displayVariant.virtual_available ?? 0 } : { qty: product.qty_available, virtual: product.virtual_available };
  const stock = stockLabel(displayStock.qty, displayStock.virtual);

  const handleAdd = () => {
    if (!product) return;
    addItem({
      product_id: displayVariant?.id || product.id,
      name: product.name + (displayVariant ? ` (${displayVariant.merged_name})` : ''),
      default_code: displaySku,
      price: displayPrice,
      qty,
      qty_available: displayStock.qty,
      virtual_available: displayStock.virtual,
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
          {/* Image */}
          <div className="bg-gray-50 rounded-xl h-64 flex items-center justify-center border border-gray-100 overflow-hidden">
            {displayVariant?.other_images?.[0] ? (
              <img src={displayVariant.other_images[0]} alt={product.name} className="w-full h-full object-contain p-4" />
            ) : product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-4" />
            ) : (
              <span className="text-7xl">🎨</span>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col gap-4">
            {displaySku && (
              <span className="text-xs text-gray-400 font-mono">SKU: {displaySku}</span>
            )}
            <h1 className="text-2xl font-bold text-[#004475]">
              {product.name}
              {displayVariant && <span className="text-lg font-medium text-gray-600 ml-2">({displayVariant.merged_name})</span>}
            </h1>

            {product.categ_id && (
              <span className="text-xs text-gray-500">{product.categ_id[1]}</span>
            )}

            {/* Variant selector */}
            {product.variant_ids?.length > 1 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  {product.variant_ids[0]?.attribute_values?.[0]?.display_name?.split(':')[0] || 'Option'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variant_ids.map(variant => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariant(variant)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                        selectedVariant?.id === variant.id
                          ? 'bg-[#004475] text-white border-[#004475]'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-[#004475]'
                      }`}
                    >
                      {variant.merged_name}
                      {variant.qty_available !== undefined && (
                        <span className={`ml-1.5 text-xs ${selectedVariant?.id === variant.id ? 'text-white/70' : 'text-gray-400'}`}>
                          ({variant.qty_available > 0 ? variant.qty_available : '×'})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stock badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium w-fit ${stock.color}`}>
              <span className={`w-2 h-2 rounded-full ${stock.dot}`} />
              {stock.label}
            </div>

            <div className="text-3xl font-bold text-[#004475]">
              £{displayPrice.toFixed(2)}
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
        {(displayVariant?.description_sale || product.description_sale || product.description) && (
          <div className="mt-8 pt-6 border-t border-gray-100">
            <h2 className="font-semibold text-[#004475] mb-3">Product Description</h2>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {displayVariant?.description_sale || product.description_sale || product.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
