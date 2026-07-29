'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
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
  // One colour spec per unit of quantity for FT Custom Mixed Paints.
  const [colourSpecs, setColourSpecs] = useState<{ name: string; code: string; make: string; model: string; year: string }[]>([{ name: '', code: '', make: '', model: '', year: '' }]);

  // Variants: group by attribute name
  const variants = product?.variant_ids || [];
  const hasVariants = variants.length > 1;

  // Active price = selected variant price OR product list price
  const activePrice = selectedVariant ? selectedVariant.price : (product?.list_price || 0);
  const activeCode = selectedVariant?.internal_reference || (product?.default_code as string) || '';

  // FT Custom Mixed Paints are bespoke: no quantity breaks, plus a customer
  // colour spec captured onto the order.
  const categoryName = Array.isArray(product?.categ_id) ? product.categ_id[1] : '';
  const isCustomMixed = categoryName.includes('FT Custom Mixed Paints');
  // Quantity breaks disabled for now — hide the UI and skip break pricing.
  const hideBreaks = true; // was: isCustomMixed
  // Every unit needs at least one of its two colour fields before adding a custom paint.
  const colourMissing = isCustomMixed && colourSpecs.some(s => !s.name.trim() && !s.code.trim());
  const breaks = (product && !hideBreaks) ? (
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

  // Keep one colour row per unit for custom-mixed paints, preserving typed values.
  useEffect(() => {
    if (!isCustomMixed) return;
    setColourSpecs(prev => {
      if (prev.length === qty) return prev;
      if (qty < prev.length) return prev.slice(0, qty);
      return [...prev, ...Array.from({ length: qty - prev.length }, () => ({ name: '', code: '', make: '', model: '', year: '' }))];
    });
  }, [qty, isCustomMixed]);

  useEffect(() => {
    if (!session || !id) return;
    fetch(`/api/products/${id}`)
      .then(r => r.json())
      .then(d => { setProduct(d.product); setLoading(false); })
      .catch(() => setLoading(false));
  }, [session, id]);

  function handleAdd() {
    if (!product) return;
    if (colourMissing) return;
    const variantSuffix = selectedVariant && hasVariants ? ` (${selectedVariant.merged_name})` : '';
    addItem({
      id: selectedVariant ? selectedVariant.id : product.id,
      name: product.name + variantSuffix,
      code: activeCode,
      price: currentPrice,
      qty,
      image: product.image_url || product.image_128,
      colours: isCustomMixed
        ? colourSpecs.map(s => ({
            name: s.name.trim() || undefined,
            code: s.code.trim() || undefined,
            make: s.make.trim() || undefined,
            model: s.model.trim() || undefined,
            year: s.year.trim() || undefined,
          }))
        : undefined,
    });
    // For custom-mixed paints, clear the colour spec + qty after adding so the
    // customer can pick another size and enter its colour on a fresh slate.
    if (isCustomMixed) {
      setColourSpecs([{ name: '', code: '', make: '', model: '', year: '' }]);
      setQty(1);
    }
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
          <Link href="/shop" className="hover:text-[#004475]">Shop</Link>
          <span>/</span>
          {product.categ_id && (
            <>
              {/* Back to the shop with this category already applied, so "more
                  like this one" is one click rather than a hunt through the tree. */}
              <Link
                href={`/shop?categoryId=${(product.categ_id as [number,string])[0]}`}
                className="hover:text-[#004475] hover:underline truncate"
              >
                {(product.categ_id as [number,string])[1]}
              </Link>
              <span>/</span>
            </>
          )}
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
              {!hideBreaks && (
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
              )}
            </div>

            {/* Custom colour spec (FT Custom Mixed Paints only) — one row per unit */}
            {isCustomMixed && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-sm font-semibold text-gray-700">🎨 Custom Colour Details</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-3">
                  {qty > 1
                    ? `Tell us the colour to mix for each of your ${qty} units — enter a name, a code, or both.`
                    : 'Tell us the colour to mix — enter a name, a code, or both.'}
                </p>
                <div className="space-y-3">
                  {colourSpecs.map((spec, i) => (
                    <div key={i}>
                      {qty > 1 && (
                        <p className="text-xs font-semibold text-[#004475] mb-1">Colour {i + 1} of {qty}</p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Colour name</label>
                          <input
                            value={spec.name}
                            onChange={e => setColourSpecs(prev => prev.map((s, j) => j === i ? { ...s, name: e.target.value.toUpperCase() } : s))}
                            placeholder="e.g. Gentian Blue"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Colour code</label>
                          <input
                            value={spec.code}
                            onChange={e => setColourSpecs(prev => prev.map((s, j) => j === i ? { ...s, code: e.target.value.toUpperCase() } : s))}
                            placeholder="e.g. RAL 5010"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Make</label>
                          <input
                            value={spec.make}
                            onChange={e => setColourSpecs(prev => prev.map((s, j) => j === i ? { ...s, make: e.target.value } : s))}
                            placeholder="e.g. Ford"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Model</label>
                          <input
                            value={spec.model}
                            onChange={e => setColourSpecs(prev => prev.map((s, j) => j === i ? { ...s, model: e.target.value } : s))}
                            placeholder="e.g. Focus"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <label className="block text-xs text-gray-500 mb-1">Year</label>
                          <input
                            value={spec.year}
                            onChange={e => setColourSpecs(prev => prev.map((s, j) => j === i ? { ...s, year: e.target.value } : s))}
                            placeholder="e.g. 2018"
                            inputMode="numeric"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {colourMissing && (
                  <p className="text-xs text-amber-600 mt-2">
                    {qty > 1
                      ? 'Enter a colour name or code for every unit to add this custom paint to your basket.'
                      : 'Enter a colour name or code to add this custom paint to your basket.'}
                  </p>
                )}
              </div>
            )}

            {/* Qty + Add */}
            <div className="flex gap-3">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setQty(q => Math.max(1, q-1))} className="px-3 py-3 bg-gray-50 hover:bg-gray-100 font-bold text-gray-600">−</button>
                <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1,parseInt(e.target.value)||1))}
                  className="w-14 text-center py-3 focus:outline-none text-sm font-medium" />
                <button onClick={() => setQty(q => q+1)} className="px-3 py-3 bg-gray-50 hover:bg-gray-100 font-bold text-gray-600">+</button>
              </div>
              <button onClick={handleAdd} disabled={colourMissing}
                className={`flex-1 py-3 font-bold rounded-xl transition-all text-sm ${added ? 'bg-green-500 text-white' : 'bg-[#004475] hover:bg-[#ff8f00] text-white'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#004475]`}>
                {added ? '✓ Added to Basket' : `Add to Basket — £${(currentPrice * qty).toFixed(2)}`}
              </button>
              <button onClick={() => product && toggle(product.id)}
                className={`px-4 py-3 rounded-xl border-2 transition-all ${isFav ? 'border-red-400 bg-red-50 text-red-500' : 'border-gray-200 text-gray-400 hover:border-red-300'}`}>
                {isFav ? '❤️' : '♡'}
              </button>
            </div>

            {/* Multi-size cue: a persistent banner that each size is added on its own.
                Upgrades to a bold "Added" state after a successful add. */}
            {isCustomMixed && hasVariants && (
              <div
                className={`flex items-start gap-3 rounded-xl border-2 px-4 py-3 transition-colors ${
                  added
                    ? 'border-green-500 bg-green-50 text-green-800'
                    : 'border-amber-300 bg-amber-50 text-amber-800'
                }`}
              >
                <span className="text-xl leading-none flex-shrink-0">{added ? '✓' : '🎨'}</span>
                <div>
                  <p className="text-sm font-bold">
                    {added ? 'Added to basket!' : 'Ordering more than one size?'}
                  </p>
                  <p className="text-sm">
                    {added
                      ? 'Pick another size, enter its colour, and add it as a separate item.'
                      : 'Add each size separately — pick a size, enter its colour name/code, then Add to Basket. The fields reset so you can add the next size.'}
                  </p>
                </div>
              </div>
            )}

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
      <Footer />
    </div>
  );
}
