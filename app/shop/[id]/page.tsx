'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import { useBasket } from '@/lib/basketStore';
import { useFavourites } from '@/lib/favourites';

interface VariantOption {
  id: number;
  name: string;
  merged_name: string;
  price: number;
  internal_reference?: string;
  attribute_values?: Array<{ name: string; display_name: string; attribute_id: number }>;
}

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  original_price?: number;
  standard_price?: number;
  qty_available: number;
  categ_id: [number, string] | false;
  uom_id?: [number, string] | false;
  image_url?: string | null;
  image_1920?: string;
  image_128?: string;
  description?: string;
  description_sale?: string;
  weight?: number;
  volume?: number;
  barcode?: string | false;
  quantity_breaks?: Array<{ qty: number; price: number }>;
  variant_count?: number;
  variant_ids?: VariantOption[];
  offer?: string;
  shipping?: string;
  product_tag_ids?: number[];
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const { addItem } = useBasket();
  const { toggle, isFavourite } = useFavourites();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'specs'>('details');
  const [selectedVariant, setSelectedVariant] = useState<VariantOption | null>(null);

  // Variants: group by attribute name
  const variants = product?.variant_ids || [];
  const hasVariants = variants.length > 1;

  // Active price = selected variant price OR product list price
  const activePrice = selectedVariant ? selectedVariant.price : (product?.list_price || 0);
  const activeCode = selectedVariant?.internal_reference || (product?.default_code as string) || '';

  const breaks = product ? (
    (product.quantity_breaks && product.quantity_breaks.length > 0)
      ? product.quantity_breaks
      : [
    { qty: 5,  price: activePrice * 0.95 },
    { qty: 10, price: activePrice * 0.90 },
    { qty: 20, price: activePrice * 0.85 },
  ]) : [];

  const currentBreak = [...breaks].reverse().find(b => qty >= b.qty);
  const currentPrice = currentBreak ? currentBreak.price : activePrice;
  const isFav = product ? isFavourite(product.id) : false;

  // Auto-select first variant if available
  useEffect(() => {
    if (product && product.variant_ids && product.variant_ids.length > 0 && !selectedVariant) {
      setSelectedVariant(product.variant_ids[0]);
    }
  }, [product]);

  useEffect(() => {
    if (!session || !id) return;
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(d => { setProduct(d.product); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session, id]);

  function handleAdd() {
    if (!product) return;
    const variantSuffix = selectedVariant && hasVariants ? ` (${selectedVariant.merged_name})` : '';
    addItem({
      id: selectedVariant ? selectedVariant.id : product.id,
      name: product.name + variantSuffix,
      code: activeCode,
      price: currentPrice,
      qty,
      image: product.image_url || product.image_128
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
          <div className="bg-gray-100 rounded-2xl h-80" />
          <div className="space-y-4">
            <div className="bg-gray-100 rounded h-4 w-1/3" />
            <div className="bg-gray-100 rounded h-8 w-3/4" />
            <div className="bg-gray-100 rounded h-4 w-1/2" />
            <div className="bg-gray-100 rounded h-12 mt-6" />
          </div>
        </div>
      </div>
    </div>
  );

  if (!product) return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-12 text-center text-gray-400">
        <p className="text-2xl mb-2">Product not found</p>
        <button onClick={() => router.push('/shop')} className="btn-primary mt-4">← Back to Shop</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {/* Breadcrumb */}
        <nav className="text-sm text-gray-500 mb-4 flex items-center gap-2">
          <button onClick={() => router.push('/shop')} className="hover:text-[#004475]">Shop</button>
          <span>/</span>
          {product.categ_id && <span className="hover:text-[#004475]">{(product.categ_id as [number,string])[1]}</span>}
          <span>/</span>
          <span className="text-gray-900 font-medium truncate">{product.name.substring(0, 40)}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Image */}
          <div className="card p-6 flex items-center justify-center min-h-64 bg-white">
            {(product.image_url || product.image_1920 || product.image_128) ? (
              <img
                src={product.image_url || (product.image_1920 ? `data:image/png;base64,${product.image_1920}` : `data:image/png;base64,${product.image_128}`)}
                alt={product.name}
                className="max-h-72 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
              />
            ) : (
              <div className="text-gray-200 text-center">
                <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-sm mt-2">No image</p>
              </div>
            )}
          </div>

          {/* Info */}
          <div className="space-y-4">
            <div>
              <p className="font-mono text-sm text-gray-400">{product.default_code || '—'}</p>
              <h1 className="text-2xl font-bold text-gray-900 mt-1 leading-tight">{product.name}</h1>
              {product.categ_id && (
                <p className="text-sm text-gray-500 mt-1">{(product.categ_id as [number,string])[1]}</p>
              )}
            </div>

            {/* Stock */}
            <div className="flex items-center gap-3">
              <span className={`badge-stock ${product.qty_available > 0 ? 'badge-instock' : 'badge-available'}`}>
                {product.qty_available > 0
                  ? `✓ In Stock (${Math.floor(product.qty_available)} units)`
                  : 'Available to Order'}
              </span>
              {product.barcode && (
                <span className="text-xs text-gray-400 font-mono">Barcode: {product.barcode}</span>
              )}
            </div>

            {/* Variants selector */}
            {hasVariants && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                {/* Group by attribute */}
                {(() => {
                  const attributeName = variants[0]?.attribute_values?.[0]?.display_name?.split(':')[0] || 'Size';
                  return (
                    <>
                      <p className="text-sm font-semibold text-gray-700 mb-3">{attributeName}</p>
                      <div className="flex flex-wrap gap-2">
                        {variants.map(v => (
                          <button
                            key={v.id}
                            onClick={() => setSelectedVariant(v)}
                            className={`px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                              selectedVariant?.id === v.id
                                ? 'border-[#004475] bg-[#004475] text-white'
                                : 'border-gray-200 text-gray-700 hover:border-[#004475] hover:text-[#004475]'
                            }`}
                          >
                            {v.merged_name}
                            {selectedVariant?.id !== v.id && (
                              <span className="ml-1.5 text-xs opacity-60">£{v.price.toFixed(2)}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      {selectedVariant && (
                        <p className="text-xs text-gray-400 mt-2">
                          Code: {selectedVariant.internal_reference || '—'}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Price */}
            <div className="bg-gray-50 rounded-xl p-4">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold text-[#004475]">£{currentPrice.toFixed(2)}</span>
                {currentBreak && (
                  <span className="text-sm text-gray-400 line-through">£{product.list_price.toFixed(2)}</span>
                )}
                <span className="text-xs text-gray-400">per {product.uom_id ? (product.uom_id as [number,string])[1] : 'unit'} excl. VAT</span>
              </div>

              {/* Quantity breaks */}
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">📊 Quantity Breaks</p>
                <div className="flex gap-2 flex-wrap">
                  {[{qty:1, price: product.list_price}, ...breaks].map(b => (
                    <button
                      key={b.qty}
                      onClick={() => setQty(b.qty)}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                        qty >= b.qty && (!breaks.find(br => br.qty > b.qty && qty >= br.qty))
                          ? 'border-[#ff8f00] bg-[#ff8f00] text-[#004475]'
                          : 'border-gray-200 text-gray-600 hover:border-[#004475]'
                      }`}
                    >
                      {b.qty}+ = £{b.price.toFixed(2)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Qty + Add */}
            <div className="flex gap-3">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q-1))} className="px-3 py-3 bg-gray-50 hover:bg-gray-100 font-bold text-gray-600">−</button>
                <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1,parseInt(e.target.value)||1))}
                  className="w-14 text-center py-3 focus:outline-none text-sm font-medium" />
                <button onClick={() => setQty(q => q+1)} className="px-3 py-3 bg-gray-50 hover:bg-gray-100 font-bold text-gray-600">+</button>
              </div>
              <button onClick={handleAdd}
                className={`flex-1 py-3 font-bold rounded-xl transition-all text-sm ${added ? 'bg-green-500 text-white' : 'bg-[#004475] hover:bg-[#ff8f00] text-white'}`}>
                {added ? '✓ Added to Basket' : `Add to Basket — £${(currentPrice * qty).toFixed(2)}`}
              </button>
              <button onClick={() => product && toggle(product.id)}
                className={`px-4 py-3 rounded-xl border-2 transition-all ${isFav ? 'border-red-400 bg-red-50 text-red-500' : 'border-gray-200 text-gray-400 hover:border-red-300'}`}>
                {isFav ? '❤️' : '♡'}
              </button>
            </div>

            {/* Description */}
            {(product.description_sale || product.description) && (
              <div className="text-sm text-gray-600 leading-relaxed bg-blue-50 rounded-xl p-4">
                {product.description_sale || product.description}
              </div>
            )}
          </div>
        </div>

        {/* Specs tabs */}
        <div className="mt-8 card overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(['details', 'specs'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                className={`px-6 py-3 text-sm font-medium capitalize transition-colors ${activeTab===t ? 'border-b-2 border-[#004475] text-[#004475]' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'details' ? 'Product Details' : 'Technical Specs'}
              </button>
            ))}
          </div>
          <div className="p-5">
            {activeTab === 'details' ? (
              <div className="space-y-3 text-sm">
                {[
                  ['Product Name', product.name],
                  ['Internal Reference', product.default_code || '—'],
                  ['Category', product.categ_id ? (product.categ_id as [number,string])[1] : '—'],
                  ['Unit of Measure', product.uom_id ? (product.uom_id as [number,string])[1] : '—'],
                  ['Barcode', product.barcode || '—'],
                  ['Stock Available', product.qty_available > 0 ? `${Math.floor(product.qty_available)} units` : 'Available to order'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {[
                  ['Weight', (product.weight ?? 0) > 0 ? `${product.weight} kg` : '—'],
                  ['Volume', (product.volume ?? 0) > 0 ? `${product.volume} L` : '—'],
                  ['Sale Price', `£${product.list_price.toFixed(2)} excl. VAT`],
                  ['Price inc. VAT (20%)', `£${(product.list_price * 1.2).toFixed(2)}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between py-2 border-b border-gray-50 last:border-0">
                    <span className="text-gray-500">{label}</span>
                    <span className="font-medium text-gray-900">{value}</span>
                  </div>
                ))}
                <div className="bg-amber-50 rounded-lg p-3 mt-3">
                  <p className="text-xs text-amber-700">📄 Technical Data Sheet (TDS) and Safety Data Sheet (SDS) available on request — contact sales@ftpaints.co.uk</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Back */}
        <div className="mt-6">
          <button onClick={() => router.push('/shop')} className="btn-outline text-sm">← Back to Shop</button>
        </div>
      </div>
    </div>
  );
}
