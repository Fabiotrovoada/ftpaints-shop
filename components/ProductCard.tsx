'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useBasket } from '@/lib/basketStore';
import { useFavourites } from '@/lib/favourites';

interface SellerInfo {
  price: number;
  min_qty: number;
  partner_name: string;
}

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  original_price?: number;
  standard_price?: number;
  qty_available: number;
  virtual_available?: number;
  categ_id: [number, string] | false;
  uom_id?: [number, string] | false;
  image_128?: string;
  image_url?: string | null;
  description_sale?: string;
  barcode?: string;
  quantity_breaks?: Array<{ qty: number; price: number }>;
  variant_count?: number;
  offer?: string;
  shipping?: string;
  rating?: number;
  seller_ids?: number[];
  sellers?: SellerInfo[];
  product_tag_ids?: number[];
  tag_names?: string[];
}

interface QuantityBreak {
  qty: number;
  price: number;
}

function getQuantityBreaks(price: number): QuantityBreak[] {
  // Standard breaks — can be enhanced with Odoo pricelist data
  return [
    { qty: 5, price: price * 0.95 },
    { qty: 10, price: price * 0.90 },
    { qty: 20, price: price * 0.85 },
  ];
}

export default function ProductCard({ product }: { product: Product }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [showBreaks, setShowBreaks] = useState(false);
  const router = useRouter();
  const [partNumber, setPartNumber] = useState('');
  const [partSaved, setPartSaved] = useState(false);
  const { addItem } = useBasket();
  const { toggle, isFavourite } = useFavourites();

  const inStock = product.qty_available > 0;
  // qty_available of 999 = "in stock, exact count unknown" from Mobile API
  const exactQty = product.qty_available < 999 ? product.qty_available : null;
  const lowStock = inStock && exactQty !== null && exactQty <= 5;
  const isFav = isFavourite(product.id);
  // FT Custom Mixed Paints are bespoke — no quantity breaks (shown or applied)
  const categoryName = Array.isArray(product.categ_id) ? product.categ_id[1] : '';
  const hideBreaks = categoryName.includes('FT Custom Mixed Paints');
  // Use real quantity breaks from Odoo if available, otherwise generate standard breaks
  const breaks = hideBreaks
    ? []
    : (product.quantity_breaks && product.quantity_breaks.length > 0)
      ? product.quantity_breaks
      : getQuantityBreaks(product.list_price);

  // Current price based on qty
  const currentBreak = [...breaks].reverse().find(b => qty >= b.qty);
  const currentPrice = currentBreak ? currentBreak.price : product.list_price;
  const saving = product.list_price - currentPrice;

  function handleAdd() {
    addItem({
      id: product.id,
      name: product.name,
      code: product.default_code || '',
      price: currentPrice,
      qty,
      image: product.image_url || product.image_128 || undefined,
      qtyAvailable: product.qty_available,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function savePartNumber() {
    // Store locally — can be synced to Odoo partner notes later
    const key = `part_${product.id}`;
    localStorage.setItem(key, partNumber);
    setPartSaved(true);
    setTimeout(() => setPartSaved(false), 2000);
  }

  // Load saved part number
  useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`part_${product.id}`);
      if (saved) setPartNumber(saved);
    }
  });

  return (
    <div className="card flex flex-col gap-2 hover:shadow-md transition-shadow overflow-hidden">
      {/* Image */}
      <div className="bg-gray-50 h-36 flex items-center justify-center relative overflow-hidden">
        {(product.image_url || product.image_128) ? (
          <img
            onClick={() => router.push(`/shop/${product.id}`)}
            src={product.image_url || `data:image/png;base64,${product.image_128}`}
            alt={product.name}
            className="h-full w-full object-contain p-2 cursor-pointer"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <svg className="w-12 h-12 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )}
        {/* Favourite button */}
        <button
          onClick={() => toggle(product.id)}
          className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-sm transition-all ${isFav ? 'bg-red-100 text-red-500' : 'bg-white text-gray-300 hover:text-red-400'} shadow-sm`}
        >
          {isFav ? '❤️' : '♡'}
        </button>
        {/* Group discount badge */}
        {breaks.length > 0 && (
          <div className="absolute top-2 left-2 bg-[#ff8f00] text-white text-xs font-bold px-1.5 py-0.5 rounded">
            Qty Breaks
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Code + name */}
        <div>
          <p className="text-xs text-gray-400 font-mono truncate">{product.default_code || '—'}</p>
          <h3 onClick={() => router.push(`/shop/${product.id}`)} className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mt-0.5 cursor-pointer hover:text-[#004475] hover:underline">{product.name}</h3>
          {product.categ_id && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{(product.categ_id as [number,string])[1]}</p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-[#004475]">
            £{currentPrice.toFixed(2)}
          </span>
          {saving > 0 && (
            <span className="text-xs text-gray-400 line-through">£{product.list_price.toFixed(2)}</span>
          )}
          {saving > 0 && (
            <span className="text-xs text-green-600 font-medium">-{((saving/product.list_price)*100).toFixed(0)}%</span>
          )}
        </div>

        {/* Quantity breaks toggle */}
        {!hideBreaks && (
          <>
            <button
              onClick={() => setShowBreaks(!showBreaks)}
              className="text-left text-xs text-[#004475] font-medium hover:underline"
            >
              Quantity breaks {showBreaks ? '▲' : '▼'}
            </button>

            {showBreaks && (
              <div className="bg-[#004475] rounded-lg p-2 text-xs space-y-1">
                <div className="flex justify-between text-white/70">
                  <span>1+</span><span className="font-medium">£{product.list_price.toFixed(2)}</span>
                </div>
                {breaks.map(b => (
                  <div key={b.qty} className={`flex justify-between ${qty >= b.qty ? 'text-[#ff8f00] font-semibold' : 'text-white'}`}>
                    <span>{b.qty}+</span>
                    <span>£{b.price.toFixed(2)} <span className="text-white/50">(-{((product.list_price-b.price)/product.list_price*100).toFixed(0)}%)</span></span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Stock status */}
        <span className={`badge-${inStock ? (lowStock ? 'lowstock' : 'instock') : 'available'} self-start`}>
          {inStock
            ? (lowStock
                ? `⚠️ Low (${Math.floor(exactQty!)})`
                : exactQty !== null
                  ? `✓ In Stock (${Math.floor(exactQty)})`
                  : '✓ In Stock')
            : 'Available to Order'}
        </span>

        {/* Qty stepper + Add */}
        <div className="flex flex-col gap-2 mt-auto">
          {/* Stepper row */}
          <div className="flex items-stretch rounded-lg overflow-hidden border border-gray-200 h-9 w-full">
            <button
              onClick={() => setQty(q => Math.max(1, q-1))}
              className="flex-shrink-0 w-10 bg-[#004475] hover:bg-[#003360] text-white font-bold text-lg flex items-center justify-center"
            >−</button>
            <div className="flex-1 flex items-center justify-center border-x border-gray-200 bg-white">
              <input
                type="number"
                min={1}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value)||1))}
                className="w-full text-center text-sm font-semibold focus:outline-none bg-transparent appearance-none"
                style={{MozAppearance: 'textfield', lineHeight: '1', padding: '0', margin: '0', display: 'block'}}
              />
            </div>
            <button
              onClick={() => setQty(q => q+1)}
              className="flex-shrink-0 w-10 bg-[#004475] hover:bg-[#003360] text-white font-bold text-lg flex items-center justify-center"
            >+</button>
          </div>
          {/* Add to basket - full width */}
          <button
            onClick={handleAdd}
            className={`w-full py-2 text-sm font-semibold rounded-lg transition-all ${added ? 'bg-green-500 text-white' : 'bg-[#ff8f00] hover:bg-[#e07d00] text-white'}`}
          >
            {added ? '✓ Added to Basket' : 'Add to Basket'}
          </button>
        </div>
      </div>
    </div>
  );
}
