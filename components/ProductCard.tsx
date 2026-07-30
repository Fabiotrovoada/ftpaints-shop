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
  /** Number of Odoo variants. >1 means a size must be chosen before ordering. */
  variant_count?: number;
  /** The single orderable product.product id, when the product has only one. */
  variant_id?: number | null;
  offer?: string;
  shipping?: string;
  rating?: number;
  seller_ids?: number[];
  sellers?: SellerInfo[];
  product_tag_ids?: number[];
  tag_names?: string[];
  /** ISO date of the customer's most recent purchase — Buy Again only */
  last_purchased?: string | null;
  /** ISO timestamp of the last view — Recently Viewed only, injected client-side */
  viewed_at?: string | null;
}

// '2026-03-12' → '12 Mar 2026'
function formatPurchaseDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Recent views read better relative ("2 days ago") — past a week the actual
// date is more useful, so fall back to formatPurchaseDate.
function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days <= 7) return `${days} days ago`;
  return `on ${formatPurchaseDate(iso)}`;
}

export default function ProductCard({
  product,
  onRemove,
  removeLabel = '✕ Remove from Buy Again',
}: { product: Product; onRemove?: () => void; removeLabel?: string }) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
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
  // Two reasons a card cannot add straight to the basket:
  //  - Custom-mixed paints and similar carry their price on the VARIANT, leaving
  //    the template at 0, so the basket would get a £0.00 line.
  //  - Anything with several sizes needs one picked. The basket stores whatever id
  //    it is given and the order writes it to sale.order.line.product_id, which
  //    must be a product.product — a template id there is either rejected by Odoo
  //    or, because the id ranges overlap, silently books an unrelated product.
  // Both send the customer to the detail page to choose.
  const needsVariantChoice = !(product.list_price > 0) || (product.variant_count ?? 1) > 1;
  // Quantity breaks are no longer offered — one price regardless of quantity,
  // matching the product detail page. Partner pricing comes from the Odoo
  // pricelist overlay applied server-side, not from qty tiers.
  const currentPrice = product.list_price;

  function handleAdd() {
    addItem({
      // The basket feeds sale.order.line.product_id, which must be a
      // product.product. Adding the template id here booked whatever variant
      // happened to share that id — a different product almost half the time.
      id: product.variant_id ?? product.id,
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
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Code + name */}
        <div>
          <p className="text-xs text-gray-400 font-mono truncate">{product.default_code || '—'}</p>
          <h3 onClick={() => router.push(`/shop/${product.id}`)} className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2 mt-0.5 cursor-pointer hover:text-[#004475] hover:underline">{product.name}</h3>
          {product.categ_id && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{(product.categ_id as [number,string])[1]}</p>
          )}
          {product.last_purchased && (
            <p className="text-xs text-[#004475]/70 font-medium mt-1 truncate">
              🕘 Last ordered {formatPurchaseDate(product.last_purchased)}
            </p>
          )}
          {product.viewed_at && (
            <p className="text-xs text-[#004475]/70 font-medium mt-1 truncate">
              👁 Viewed {formatRelativeDate(product.viewed_at)}
            </p>
          )}
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className={needsVariantChoice ? 'text-sm font-semibold text-gray-500' : 'text-lg font-bold text-[#004475]'}>
            {needsVariantChoice ? 'Price varies by size' : `£${currentPrice.toFixed(2)}`}
          </span>
        </div>

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
          {!needsVariantChoice && (
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
          )}
          {/* Add to basket — or pick a size first, when the price lives on the variant */}
          {needsVariantChoice ? (
            <button
              onClick={() => router.push(`/shop/${product.id}`)}
              className="w-full py-2 text-sm font-semibold rounded-lg transition-all bg-[#004475] hover:bg-[#003360] text-white cursor-pointer"
            >
              Choose size →
            </button>
          ) : (
            <button
              onClick={handleAdd}
              className={`w-full cursor-pointer py-2 text-sm font-semibold rounded-lg transition-all ${added ? 'bg-green-500 text-white' : 'bg-[#ff8f00] hover:bg-[#e07d00] text-white'}`}
            >
              {added ? '✓ Added to Basket' : 'Add to Basket'}
            </button>
          )}
          {/* Optional remove control (e.g. Buy Again — dismiss a product) */}
          {onRemove && (
            <button
              onClick={onRemove}
              className="w-full py-1.5 text-xs font-medium text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
            >
              {removeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
