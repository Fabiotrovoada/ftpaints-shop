'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useBasket, type BasketItem } from '@/lib/basketStore';

// Resolve the per-unit colour list for a line, falling back to the legacy
// single-colour fields for baskets persisted before the per-unit change.
function colourList(item: BasketItem): Array<{ name?: string; code?: string; make?: string; model?: string; year?: string }> {
  if (item.colours?.length) return item.colours;
  if (item.colourName || item.colourCode) return [{ name: item.colourName, code: item.colourCode }];
  return [];
}

export default function BasketPage() {
  const { items, updateQty, removeItem, setColours, clearBasket } = useBasket();
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [onStop, setOnStop] = useState(false);
  const { data: session } = useSession();
  const router = useRouter();

  useEffect(() => {
    fetch('/api/account/credit').then(r => r.json()).then(d => setOnStop(d.onStop)).catch(() => {});
  }, []);

  async function placeOrder() {
    setPlacing(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: items.map(i => ({ productId: i.id, qty: i.qty, price: i.price, name: i.name, colours: i.colours, colourName: i.colourName, colourCode: i.colourCode })),
          note,
        }),
      });
      const data = await res.json();
      if (data.orderId) {
        clearBasket();
        setSuccess(true);
        setTimeout(() => router.push('/account'), 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPlacing(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="text-green-500 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Placed!</h2>
          <p className="text-gray-500">Redirecting to your account...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <div className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Your Basket</h1>

        {items.length === 0 ? (
          <div className="card p-12 text-center">
            <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 mb-4">Your basket is empty</p>
            <button onClick={() => router.push('/shop')} className="btn-primary">
              Browse Products
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Items */}
            <div className="lg:col-span-2 space-y-3">
              {/* Mixed stock banner */}
              {(() => {
                const partialItems = items.filter(i => typeof i.qtyAvailable === 'number' && i.qtyAvailable < i.qty && i.qtyAvailable > 0);
                const outItems = items.filter(i => typeof i.qtyAvailable === 'number' && i.qtyAvailable === 0);
                if (partialItems.length === 0 && outItems.length === 0) return null;
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <p className="font-semibold mb-1">Some items have limited stock</p>
                    <p className="text-amber-700">We&apos;ll dispatch what&apos;s available immediately and follow up on the rest within 3–5 working days. Our team will be in touch if anything is delayed.</p>
                  </div>
                );
              })()}
              {items.map(item => (
                <div key={item.id} className="card p-4">
                  {/* Top row: image + name + remove */}
                  <div className="flex items-start gap-3 mb-3">
                    {item.image ? (
                      <img
                        src={item.image.startsWith('http') ? item.image : item.image.startsWith('/') ? `https://www.ftpaints.co.uk${item.image}` : `data:image/png;base64,${item.image}`}
                        alt={item.name}
                        className="w-14 h-14 object-contain rounded flex-shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display='none'; }}
                      />
                    ) : (
                      <div className="w-14 h-14 bg-gray-100 rounded flex items-center justify-center text-gray-300 flex-shrink-0">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400 font-mono mb-0.5">{item.code}</p>
                      <Link href={`/shop/${item.id}`} className="text-sm font-semibold text-gray-900 hover:text-[#004475] hover:underline leading-tight block">
                        {item.name}
                      </Link>
                      {colourList(item).length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {colourList(item).map((c, ci) => (
                            <div key={ci} className="text-xs text-[#004475]">
                              <p>
                                🎨 {colourList(item).length > 1 && <span className="font-semibold">{ci + 1}. </span>}
                                {[c.name, c.code].filter(Boolean).join(' · ').toUpperCase()}
                              </p>
                              {[c.make, c.model, c.year].some(Boolean) && (
                                <p className="text-gray-500 pl-4">🚗 {[c.make, c.model, c.year].filter(Boolean).join(' ')}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Remove button top-right */}
                    <button onClick={() => removeItem(item.id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 p-0.5 mt-0.5">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  </div>

                  {/* Stock status */}
                  {typeof item.qtyAvailable === 'number' && (
                    <p className={`text-xs mb-2 ${item.qtyAvailable === 0 ? 'text-amber-600' : item.qtyAvailable < item.qty ? 'text-amber-600' : 'text-green-600'}`}>
                      {item.qtyAvailable === 0
                        ? '⚠ Available to order — 3–5 days'
                        : item.qtyAvailable < item.qty
                          ? `⚠ Only ${Math.floor(item.qtyAvailable)} in stock — rest on backorder`
                          : '✓ In stock — ships same day'}
                    </p>
                  )}

                  {/* Bottom row: price + qty controls + total */}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-[#004475] font-medium">£{item.price.toFixed(2)} each</p>
                    {colourList(item).length > 0 ? (
                      // Custom-mixed line: qty follows the number of colours — edit them inline.
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Qty {item.qty}</span>
                        <button
                          onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                          className="text-xs font-semibold text-[#004475] border border-[#004475]/30 hover:bg-[#004475]/5 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          {editingId === item.id ? 'Done' : '✏️ Edit colours'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button onClick={() => updateQty(item.id, item.qty - 1)} className="px-3 py-1.5 bg-[#004475] hover:bg-[#003360] text-sm font-bold text-white">−</button>
                        <span className="w-10 text-center text-sm py-1.5 font-medium">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, item.qty + 1)} className="px-3 py-1.5 bg-[#004475] hover:bg-[#003360] text-sm font-bold text-white">+</button>
                      </div>
                    )}
                    <p className="text-sm font-bold text-gray-900 text-right">£{(item.price * item.qty).toFixed(2)}</p>
                  </div>

                  {/* Inline colour editor (custom-mixed lines) */}
                  {editingId === item.id && colourList(item).length > 0 && (() => {
                    const list = colourList(item);
                    return (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">🎨 Edit colours to mix</p>
                        {list.map((c, ci) => (
                          <div key={ci} className="border border-gray-100 rounded-lg p-2 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#004475] w-5 flex-shrink-0">{ci + 1}.</span>
                              <input
                                value={c.name ?? ''}
                                onChange={e => setColours(item.id, list.map((x, j) => j === ci ? { ...x, name: e.target.value.toUpperCase() } : x))}
                                placeholder="Colour name"
                                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                              />
                              <input
                                value={c.code ?? ''}
                                onChange={e => setColours(item.id, list.map((x, j) => j === ci ? { ...x, code: e.target.value.toUpperCase() } : x))}
                                placeholder="Code"
                                className="w-24 flex-shrink-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                              />
                              <button
                                onClick={() => setColours(item.id, list.filter((_, j) => j !== ci))}
                                disabled={list.length <= 1}
                                title={list.length <= 1 ? 'A custom paint needs at least one colour' : 'Remove this colour'}
                                className="text-gray-300 hover:text-red-400 disabled:opacity-30 disabled:hover:text-gray-300 flex-shrink-0 p-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 pl-7">
                              <input
                                value={c.make ?? ''}
                                onChange={e => setColours(item.id, list.map((x, j) => j === ci ? { ...x, make: e.target.value } : x))}
                                placeholder="Make"
                                className="min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                              />
                              <input
                                value={c.model ?? ''}
                                onChange={e => setColours(item.id, list.map((x, j) => j === ci ? { ...x, model: e.target.value } : x))}
                                placeholder="Model"
                                className="min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                              />
                              <input
                                value={c.year ?? ''}
                                onChange={e => setColours(item.id, list.map((x, j) => j === ci ? { ...x, year: e.target.value } : x))}
                                placeholder="Year"
                                inputMode="numeric"
                                className="min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                              />
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => setColours(item.id, [...list, { name: '', code: '', make: '', model: '', year: '' }])}
                          className="text-xs font-medium text-[#004475] hover:underline mt-1"
                        >
                          + Add another colour
                        </button>
                      </div>
                    );
                  })()}

                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="space-y-4">
              <div className="card p-5">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Order Summary</h2>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal ({items.reduce((s, i) => s + i.qty, 0)} items)</span>
                    <span>£{total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>VAT (20%)</span>
                    <span>£{(total * 0.2).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
                    <span>Total inc. VAT</span>
                    <span>£{(total * 1.2).toFixed(2)}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order notes</label>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                    placeholder="Special instructions, delivery notes..."
                  />
                </div>

                <div className="space-y-2">
                  {onStop && (
                    <div className="bg-red-50 border border-red-300 rounded-lg px-3 py-2.5 text-sm text-red-700 font-medium text-center">
                      🛑 Your account is on stop — please pay outstanding invoices before placing new orders.
                    </div>
                  )}
                  <button
                    onClick={() => !onStop && router.push('/checkout')}
                    disabled={onStop}
                    className="w-full btn-primary py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Proceed to Checkout →
                  </button>
                  {onStop ? (
                    <button onClick={() => router.push('/account/pay')} className="w-full text-sm text-red-600 underline text-center">
                      Pay outstanding invoices →
                    </button>
                  ) : (
                    <p className="text-xs text-center text-gray-400">Choose delivery method &amp; payment at checkout</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => router.push('/shop')}
                className="w-full btn-outline text-sm py-2.5"
              >
                ← Continue Shopping
              </button>
            </div>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
