'use client';
import { useState, useEffect, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useBasket } from '@/lib/basketStore';
import { stateBadge } from '@/lib/orderState';
import type { Order, OrderLine } from '@/types/account';

const money = (n: number) => `£${n.toFixed(2)}`;
const ukDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString('en-GB') : '—');

interface OrderDetail extends Order {
  amount_untaxed?: number;
  amount_tax?: number;
  note?: string | false;
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const router = useRouter();
  const { addItem } = useBasket();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState('');

  useEffect(() => {
    if (!session) return;
    fetch(`/api/account/orders/${id}`)
      .then(async r => {
        if (r.status === 404) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then(d => {
        if (!d) return;
        setOrder(d.order || null);
        setLines(d.lines || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [session, id]);

  // Only real product lines can be reordered — Odoo sections and notes carry no
  // product_id and would otherwise land in the basket as £0 phantom rows.
  const productLines = lines.filter(l => Array.isArray(l.product_id));

  /**
   * Deliberately re-prices against the live catalogue instead of reusing the
   * order's price_unit: createSaleOrder writes whatever price the basket holds
   * straight onto the new Odoo quotation, so reordering a two-year-old order
   * from history would raise it at two-year-old prices.
   *
   * Anything the catalogue no longer returns (discontinued, or archived) is
   * skipped and named, rather than silently added at a stale price.
   */
  async function reorder() {
    setReordering(true);
    setReorderError('');
    try {
      const ids = productLines.map(l => (l.product_id as [number, string])[0]);
      const res = await fetch(`/api/products?ids=${ids.join(',')}`);
      const data = await res.json();
      const current = new Map<number, Record<string, unknown>>(
        ((data.products || []) as Record<string, unknown>[]).map(p => [p.id as number, p])
      );

      const unavailable: string[] = [];
      let added = 0;

      for (const line of productLines) {
        const [productId, productName] = line.product_id as [number, string];
        const product = current.get(productId);
        if (!product) { unavailable.push(productName); continue; }

        addItem({
          id: productId,
          name: (product.name as string) || productName,
          code: (product.default_code as string) || '',
          price: (product.list_price as number) ?? 0,
          qty: line.product_uom_qty,
          image: (product.image_url as string) || (product.image_128 as string) || undefined,
          qtyAvailable: product.qty_available as number | undefined,
        });
        added += 1;
      }

      if (added === 0) {
        setReorderError('None of the items on this order are still available to order online. Please contact sales@ftpaints.co.uk.');
        return;
      }
      if (unavailable.length > 0) {
        // Park the message for the basket page rather than blocking navigation.
        setReorderError(`Added ${added} item${added !== 1 ? 's' : ''}. No longer available: ${unavailable.join(', ')}.`);
        return;
      }
      router.push('/basket');
    } catch {
      setReorderError('Could not add these items to your basket. Please try again.');
    } finally {
      setReordering(false);
    }
  }

  if (loading) return <div className="card p-12 text-center text-gray-400">Loading order...</div>;

  if (notFound || !order) {
    return (
      <div className="card p-12 text-center">
        <div className="text-5xl mb-3">🔍</div>
        <p className="font-semibold text-gray-900">Order not found</p>
        <p className="text-gray-500 text-sm mt-1">This order does not exist on your account.</p>
        <Link href="/account/orders" className="btn-primary inline-block mt-4">Back to Orders</Link>
      </div>
    );
  }

  const badge = stateBadge(order.state);
  const subtotal = order.amount_untaxed ?? productLines.reduce((s, l) => s + l.price_subtotal, 0);
  const tax = order.amount_tax ?? Math.max(0, order.amount_total - subtotal);

  return (
    <div>
      <Link href="/account/orders" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-flex items-center gap-1">
        ← Back to Orders
      </Link>

      <div className="card p-5 mb-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold font-mono text-[#004475]">{order.name}</h1>
            <p className="text-sm text-gray-500 mt-1">Placed {ukDate(order.date_order)}</p>
          </div>
          <div className="text-right">
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge.className}`}>{badge.label}</span>
            <p className="text-2xl font-bold text-gray-900 mt-2">{money(order.amount_total)}</p>
            <p className="text-xs text-gray-400">inc. VAT</p>
          </div>
        </div>

        {reorderError && (
          <div className="mt-4 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm flex items-center justify-between gap-3 flex-wrap">
            <span>{reorderError}</span>
            <Link href="/basket" className="font-semibold underline whitespace-nowrap">Go to basket</Link>
          </div>
        )}

        <div className="flex gap-2 mt-5 flex-wrap">
          <button
            onClick={reorder}
            disabled={productLines.length === 0 || reordering}
            className="btn-accent text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {reordering ? 'Adding…' : '🔄 Reorder these items'}
          </button>
          <button
            onClick={() => window.open(`/api/account/orders/${order.id}/pdf`, '_blank')}
            className="btn-outline text-sm"
          >
            📄 View PDF
          </button>
          <Link href="/account/pay" className="btn-outline text-sm inline-flex items-center">
            💳 Pay invoices
          </Link>
        </div>

        {productLines.length > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Reordering adds these items to your basket at today&apos;s prices, not the prices on this order.
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="font-semibold text-gray-700 text-sm">
            {productLines.length} item{productLines.length !== 1 ? 's' : ''}
          </h2>
        </div>

        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-gray-400 text-sm">No line items on this order</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Product</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Qty</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Unit</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map(line => {
                  const product = Array.isArray(line.product_id) ? line.product_id : null;
                  return (
                    <tr key={line.id} className={product ? '' : 'bg-gray-50/60'}>
                      <td className="px-4 py-3">
                        {product ? (
                          <Link href={`/shop/${product[0]}`} className="font-medium text-gray-900 hover:text-[#004475] hover:underline">
                            {product[1]}
                          </Link>
                        ) : (
                          <span className="text-gray-500 italic">{line.name}</span>
                        )}
                        {product && line.name && line.name !== product[1] && (
                          <p className="text-xs text-gray-400 mt-0.5 whitespace-pre-line">{line.name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{product ? line.product_uom_qty : '—'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{product ? money(line.price_unit) : '—'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{product ? money(line.price_subtotal) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-gray-500">Subtotal</td>
                  <td className="px-4 py-2 text-right text-gray-700">{money(subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-gray-500">VAT</td>
                  <td className="px-4 py-2 text-right text-gray-700">{money(tax)}</td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-right font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-right font-bold text-[#004475]">{money(order.amount_total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {typeof order.note === 'string' && order.note.trim() && (
        <div className="card p-5 mt-5">
          <h2 className="font-semibold text-gray-700 text-sm mb-2">Order notes</h2>
          <p className="text-sm text-gray-600 whitespace-pre-line">{order.note}</p>
        </div>
      )}
    </div>
  );
}
