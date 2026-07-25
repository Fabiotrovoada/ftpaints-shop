'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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

const BANK_DETAILS: [string, string][] = [
  ['Account Name', 'FT Paints Ltd'],
  ['Sort Code', '04-06-05'],
  ['Account Number', '20704785'],
];

const DELIVERY_METHODS = [
  {
    id: 'van',
    name: 'FTPaints Van Delivery',
    description: 'Our own driver — next available run in your area',
    price: 0,
    freeOver: null,
    icon: '🚐',
    badge: 'Free',
  },
  {
    id: 'standard',
    name: 'Standard Courier',
    description: '3-5 working days via courier',
    price: 0,
    freeOver: 50,
    icon: '📦',
    badge: null,
  },
  {
    id: 'next_day',
    name: 'Next Working Day',
    description: 'Order before 2pm for next day courier',
    price: 9.95,
    freeOver: null,
    icon: '⚡',
    badge: 'Popular',
  },
  {
    id: 'express',
    name: 'Express AM Delivery',
    description: 'Delivered before 12pm next day',
    price: 14.95,
    freeOver: null,
    icon: '🚀',
    badge: null,
  },
  {
    id: 'collection',
    name: 'Click & Collect',
    description: 'Collect from FTPaints — free of charge',
    price: 0,
    freeOver: null,
    icon: '🏪',
    badge: 'Free',
  },
];

// Available delivery slots (next 7 working days)
function getDeliverySlots(method: string) {
  if (method === 'collection') {
    const slots = [];
    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 0 || d.getDay() === 6) { i--; continue; }
      const dateStr = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      slots.push({ date: new Date(d), label: dateStr, times: ['09:00-12:00', '12:00-17:00'] });
    }
    return slots;
  }
  if (method === 'next_day' || method === 'express') {
    const d = new Date();
    // If before 2pm, include tomorrow
    const now = new Date();
    const cutoff = new Date(); cutoff.setHours(14, 0, 0, 0);
    const startOffset = now < cutoff ? 1 : 2;
    let found = 0;
    const slots = [];
    for (let i = startOffset; found < 3; i++) {
      const nd = new Date(d); nd.setDate(nd.getDate() + i);
      if (nd.getDay() === 0 || nd.getDay() === 6) continue;
      const label = nd.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
      slots.push({ date: nd, label, times: method === 'express' ? ['Before 12pm'] : ['AM', 'PM'] });
      found++;
    }
    return slots;
  }
  return [];
}

export default function CheckoutPage() {
  const { data: session } = useSession();
  const { items, clearBasket } = useBasket();
  const router = useRouter();

  const [step, setStep] = useState<'delivery' | 'slot' | 'payment' | 'confirm'>('delivery');
  const [deliveryMethod, setDeliveryMethod] = useState('standard');
  const [deliverySlot, setDeliverySlot] = useState<{ date: Date; label: string; time: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'account' | 'card' | 'bank' | 'collection'>('card');
  const [hasAccountTerms, setHasAccountTerms] = useState(false);
  const [paymentTermName, setPaymentTermName] = useState<string | null>(null);

  // Check if customer has payment terms set on Odoo (lazy load — not from session)
  useEffect(() => {
    fetch('/api/account/credit')
      .then(r => r.json())
      .then(data => {
        const hasTerms = data?.paymentTerms === true;
        setHasAccountTerms(hasTerms);
        setPaymentTermName(data?.paymentTermName || null);
        setPaymentMethod(hasTerms ? 'account' : 'card');
      })
      .catch(() => {
        setHasAccountTerms(false);
        setPaymentMethod('card');
      });
  }, [session?.user?.uid]);
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderRef, setOrderRef] = useState('');
  const [placedTotal, setPlacedTotal] = useState(0);
  const [paymentError, setPaymentError] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState({ name: '', line1: '', line2: '', city: '', postcode: '' });
  const [savedAddress, setSavedAddress] = useState({ name: '', line1: '', line2: '', city: '', postcode: '' });
  const [useDifferentAddress, setUseDifferentAddress] = useState(false);

  // Auto-fill delivery address from Odoo partner record
  useEffect(() => {
    if (!session?.user?.uid) return;
    fetch('/api/account/address')
      .then(r => r.json())
      .then(data => {
        if (data?.street) {
          const addr = {
            name: data.name || '',
            line1: data.street || '',
            line2: data.street2 || '',
            city: data.city || '',
            postcode: data.zip || '',
          };
          setSavedAddress(addr);
          setDeliveryAddress(addr);
        }
      })
      .catch(() => {});
  }, [session?.user?.uid]);

  // Click & Collect agreement modal
  const [showCollectionAgreement, setShowCollectionAgreement] = useState(false);
  const [collectionAgreed, setCollectionAgreed] = useState(false);
  const [collectionChecks, setCollectionChecks] = useState({
    identity: false,
    timeframe: false,
    contact: false,
    terms: false,
  });

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const selectedMethod = DELIVERY_METHODS.find(m => m.id === deliveryMethod)!;
  const deliveryCost = selectedMethod.freeOver && subtotal >= selectedMethod.freeOver ? 0 : selectedMethod.price;
  const total = subtotal + deliveryCost;
  const vat = total * 0.2;
  const totalIncVat = total * 1.2;

  const slots = getDeliverySlots(deliveryMethod);
  const needsSlot = ['next_day', 'express', 'collection'].includes(deliveryMethod);

  async function placeOrder() {
    setPlacing(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: items.map(i => ({ productId: i.id, qty: i.qty, price: i.price, name: i.name, colours: i.colours, colourName: i.colourName, colourCode: i.colourCode })),
          note: [
            note,
            deliveryMethod !== 'collection' ? `Delivery: ${selectedMethod.name}` : `Click & Collect [C&C Agreement signed by ${session?.user?.email} on ${new Date().toLocaleDateString('en-GB')}]`,
            deliverySlot ? `Collection slot: ${deliverySlot.label} ${deliverySlot.time}` : '',
            deliveryAddress.line1 ? `Delivery address: ${Object.values(deliveryAddress).filter(Boolean).join(', ')}` : '',
            paymentMethod === 'collection' ? 'Payment: Pay on Collection at trade counter' :
            paymentMethod === 'account' ? `Payment: Invoice — ${paymentTermName || 'account terms'}` :
            paymentMethod === 'bank' ? 'Payment: Bank Transfer (BACS)' :
            paymentMethod === 'card' ? 'Payment: Card (Stripe)' : '',
          ].filter(Boolean).join(' | '),
        }),
      });
      const data = await res.json();
      if (data.orderId) {
        // Capture reference + total before clearBasket() empties the basket.
        setOrderRef(data.orderName || `#${data.orderId}`);
        setPlacedTotal(totalIncVat);
        clearBasket();
        setSuccess(true);
        setStep('confirm');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPlacing(false);
    }
  }

  const allCollectionChecked = Object.values(collectionChecks).every(Boolean);

  function handleDeliverySelect(id: string) {
    if (id === 'collection' && !collectionAgreed) {
      setDeliveryMethod('collection');
      setShowCollectionAgreement(true);
    } else {
      setDeliveryMethod(id);
      setDeliverySlot(null);
    }
  }

  if (items.length === 0 && !success) {
    router.push('/basket');
    return null;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Confirmed!</h2>
          <p className="text-gray-500 mb-2">Your order has been placed and sent to our team.</p>
          {deliverySlot && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 my-4 text-sm text-green-800">
              📅 {deliveryMethod === 'collection' ? 'Collection' : 'Delivery'} booked for <strong>{deliverySlot.label}</strong> {deliverySlot.time && `— ${deliverySlot.time}`}
            </div>
          )}

          {/* Order number */}
          {orderRef && (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 my-4 text-sm text-gray-600">
              Order number: <strong className="text-gray-900 font-mono">{orderRef}</strong>
            </div>
          )}

          {/* Bank transfer instructions */}
          {paymentMethod === 'bank' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 my-4 text-left">
              <h3 className="font-bold text-blue-900 mb-1 flex items-center gap-2">🏦 Complete Your Bank Transfer</h3>
              <p className="text-sm text-blue-700 mb-4">
                Please transfer <strong>£{placedTotal.toFixed(2)}</strong> using the details below,
                quoting your order number as the payment reference so we can match it to your order.
              </p>
              <div className="bg-white rounded-lg p-4 space-y-1 text-sm">
                {[...BANK_DETAILS, ['Amount', `£${placedTotal.toFixed(2)}`] as [string, string]].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-mono font-semibold text-gray-900">{v}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center py-1.5 pt-3">
                  <span className="text-gray-500">Payment Reference</span>
                  <span className="font-mono font-bold text-[#004475] text-base bg-[#ff8f00]/20 px-2 py-0.5 rounded">{orderRef}</span>
                </div>
              </div>
              {['standard', 'next_day', 'express'].includes(deliveryMethod) && (
                <p className="text-xs text-blue-600 mt-3">
                  ⚠️ Your order will be dispatched once payment is received (1–2 working days).
                </p>
              )}
            </div>
          )}

          <p className="text-sm text-gray-400 mb-2">A confirmation will be sent to {session?.user?.email}</p>
          <p className="text-sm text-gray-400 mb-6">If any items are low or out of stock, our team will be in touch within 1 working day.</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => router.push('/account')} className="btn-primary">View Order</button>
            <button onClick={() => router.push('/shop')} className="btn-outline">Continue Shopping</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Click & Collect Agreement Modal */}
      {showCollectionAgreement && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowCollectionAgreement(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-[#004475] text-white p-5 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🏪</span>
                <div>
                  <h2 className="text-lg font-bold">Click & Collect Agreement</h2>
                  <p className="text-blue-200 text-sm">FTPaints Trade Counter — Coventry</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Before selecting Click & Collect, please confirm you understand and agree to the following:
              </p>

              {/* Collection address */}
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-semibold text-gray-800 mb-1">📍 Collection Address</p>
                <p className="text-gray-600">FTPaints Ltd, Coventry Trade Counter</p>
                <p className="text-gray-500 text-xs mt-1">Mon–Fri: 8am–5pm · Sat: 8am–1pm · Closed Sunday</p>
              </div>

              {/* Agreement checkboxes */}
              <div className="space-y-3">
                {[
                  {
                    key: 'identity' as const,
                    text: 'I understand I must bring a valid photo ID (driving licence or passport) and quote my order number when collecting.',
                  },
                  {
                    key: 'timeframe' as const,
                    text: 'I agree to collect my order within 5 working days of receiving my "ready to collect" notification. Uncollected orders may be restocked.',
                  },
                  {
                    key: 'contact' as const,
                    text: 'I confirm my contact details are correct and I will be reachable when my order is ready. I may receive a call to arrange collection.',
                  },
                  {
                    key: 'terms' as const,
                    text: 'I accept the FTPaints Click & Collect Terms & Conditions including returns policy for collected goods.',
                  },
                ].map(item => (
                  <label key={item.key} className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    collectionChecks[item.key] ? 'border-[#004475] bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={collectionChecks[item.key]}
                      onChange={e => setCollectionChecks(c => ({ ...c, [item.key]: e.target.checked }))}
                      className="mt-0.5 accent-[#004475] w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-sm text-gray-700">{item.text}</span>
                  </label>
                ))}
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="flex gap-1">
                  {Object.values(collectionChecks).map((v, i) => (
                    <div key={i} className={`w-5 h-1.5 rounded-full ${v ? 'bg-[#004475]' : 'bg-gray-200'}`} />
                  ))}
                </div>
                <span>{Object.values(collectionChecks).filter(Boolean).length}/4 confirmed</span>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={() => {
                  setShowCollectionAgreement(false);
                  setDeliveryMethod('standard');
                  setCollectionChecks({ identity: false, timeframe: false, contact: false, terms: false });
                }}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!allCollectionChecked) return;
                  setCollectionAgreed(true);
                  setShowCollectionAgreement(false);
                }}
                disabled={!allCollectionChecked}
                className="flex-2 flex-1 py-2.5 rounded-xl bg-[#004475] text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#003360] transition-colors"
              >
                {allCollectionChecked ? '✓ I Agree — Select Click & Collect' : 'Tick all boxes to continue'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Checkout</h1>

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          {[
            { key: 'delivery', label: '1. Delivery' },
            { key: 'slot', label: '2. Book Slot' },
            { key: 'payment', label: '3. Payment' },
          ].map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-200"/>}
              <button
                onClick={() => {
                  if (s.key === 'slot' && !needsSlot) return;
                  setStep(s.key as typeof step);
                }}
                className={`px-3 py-1.5 rounded-full font-medium transition-colors ${
                  step === s.key ? 'bg-[#004475] text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {s.label}
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-4">

            {/* Step 1: Delivery */}
            {step === 'delivery' && (
              <div className="space-y-4">
                <div className="card p-5">
                  <h2 className="font-bold text-gray-900 mb-4">Choose Delivery Method</h2>
                  <div className="space-y-3">
                    {DELIVERY_METHODS.map(method => {
                      const cost = method.freeOver && subtotal >= method.freeOver ? 0 : method.price;
                      const isFreeBySpend = method.freeOver && subtotal >= method.freeOver;
                      return (
                        <label
                          key={method.id}
                          className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            deliveryMethod === method.id ? 'border-[#004475] bg-[#f0f7f4]' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input type="radio" name="delivery" value={method.id}
                            checked={deliveryMethod === method.id}
                            onChange={() => handleDeliverySelect(method.id)}
                            className="accent-[#004475]" />
                          <span className="text-2xl">{method.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-gray-900">{method.name}</p>
                              {method.badge && (
                                <span className="text-xs bg-[#ff8f00] text-[#004475] font-bold px-2 py-0.5 rounded-full">{method.badge}</span>
                              )}
                              {method.id === 'collection' && collectionAgreed && (
                                <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">✓ Agreement signed</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">{method.description}</p>
                            {method.freeOver && !isFreeBySpend && (
                              <p className="text-xs text-[#004475] mt-0.5">Free on orders over £{method.freeOver}</p>
                            )}
                          </div>
                          <div className="text-right">
                            {isFreeBySpend ? (
                              <div>
                                <span className="text-xs text-gray-400 line-through">£{method.price.toFixed(2)}</span>
                                <span className="block text-sm font-bold text-green-600">FREE</span>
                              </div>
                            ) : (
                              <span className="text-sm font-bold text-gray-900">
                                {cost === 0 ? 'FREE' : `£${cost.toFixed(2)}`}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Delivery address (not for collection) */}
                {deliveryMethod !== 'collection' && (
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="font-bold text-gray-900">Delivery Address</h2>
                      <span className="text-xs text-red-500 font-medium">* Required</span>
                    </div>

                    {/* Show saved address if available */}
                    {savedAddress.line1 && !useDifferentAddress ? (
                      <div>
                        <div className="bg-blue-50 border border-[#004475]/20 rounded-xl p-4 mb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{savedAddress.name}</p>
                              <p className="text-gray-600 text-sm mt-0.5">{savedAddress.line1}</p>
                              {savedAddress.line2 && <p className="text-gray-600 text-sm">{savedAddress.line2}</p>}
                              <p className="text-gray-600 text-sm">{savedAddress.city}{savedAddress.postcode ? `, ${savedAddress.postcode}` : ''}</p>
                            </div>
                            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-1 rounded-full ml-2 flex-shrink-0">✓ Saved</span>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setUseDifferentAddress(true);
                            setDeliveryAddress({ name: '', line1: '', line2: '', city: '', postcode: '' });
                          }}
                          className="text-sm text-[#004475] font-medium hover:underline flex items-center gap-1"
                        >
                          📦 Deliver to a different address
                        </button>
                      </div>
                    ) : (
                      <div>
                        {savedAddress.line1 && useDifferentAddress && (
                          <button
                            onClick={() => {
                              setUseDifferentAddress(false);
                              setDeliveryAddress(savedAddress);
                            }}
                            className="text-sm text-[#004475] font-medium hover:underline mb-3 flex items-center gap-1"
                          >
                            ← Use my saved address
                          </button>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { key: 'name', label: 'Company / Name', full: true },
                            { key: 'line1', label: 'Address Line 1', full: true },
                            { key: 'line2', label: 'Address Line 2 (optional)', full: true },
                            { key: 'city', label: 'City', full: false },
                            { key: 'postcode', label: 'Postcode', full: false },
                          ].map(f => (
                            <input
                              key={f.key}
                              placeholder={f.label}
                              value={(deliveryAddress as Record<string,string>)[f.key]}
                              onChange={e => setDeliveryAddress(a => ({ ...a, [f.key]: e.target.value }))}
                              className={`border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475] ${f.full ? 'col-span-2' : ''}`}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => {
                    // Address required for delivery (not collection)
                    if (deliveryMethod !== 'collection' && !deliveryAddress.line1.trim()) {
                      alert('Please enter a delivery address before continuing.');
                      return;
                    }
                    setStep(needsSlot ? 'slot' : 'payment');
                  }}
                  className="btn-primary w-full py-3 text-base"
                >
                  Continue → {needsSlot ? 'Book Slot' : 'Payment'}
                </button>
              </div>
            )}

            {/* Step 2: Book slot */}
            {step === 'slot' && (
              <div className="card p-5">
                <button onClick={() => setStep('delivery')} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">← Back</button>
                <h2 className="font-bold text-gray-900 mb-1">
                  {deliveryMethod === 'collection' ? '📅 Choose Collection Slot' : '📅 Choose Delivery Slot'}
                </h2>
                <p className="text-sm text-gray-500 mb-5">
                  {deliveryMethod === 'collection'
                    ? 'Select a date and time to collect from FTPaints'
                    : 'We\'ll aim to deliver in your preferred window'}
                </p>

                {slots.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <p>No slot selection required for Standard Delivery.</p>
                    <p className="text-sm mt-1">We'll deliver within 3-5 working days.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {slots.map((slot, si) => (
                      <div key={si}>
                        <p className="font-semibold text-gray-700 mb-2 text-sm">{slot.label}</p>
                        <div className="flex gap-2 flex-wrap">
                          {slot.times.map(time => (
                            <button
                              key={time}
                              onClick={() => setDeliverySlot({ date: slot.date, label: slot.label, time })}
                              className={`px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${
                                deliverySlot?.label === slot.label && deliverySlot?.time === time
                                  ? 'border-[#004475] bg-[#004475] text-white'
                                  : 'border-gray-200 text-gray-700 hover:border-[#004475]'
                              }`}
                            >
                              {time}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setStep('payment')}
                  disabled={needsSlot && !deliverySlot && slots.length > 0}
                  className="btn-primary w-full py-3 text-base mt-6 disabled:opacity-50"
                >
                  Continue → Payment
                </button>
              </div>
            )}

            {/* Step 3: Payment */}
            {step === 'payment' && (
              <div className="space-y-4">
                <button onClick={() => setStep(needsSlot ? 'slot' : 'delivery')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">← Back</button>

                <div className="card p-5">
                  <h2 className="font-bold text-gray-900 mb-4">Payment Method</h2>
                  <div className="space-y-3">
                    {[
                      {
                        id: 'account',
                        icon: '📋',
                        label: `Pay on Account${paymentTermName ? ` — ${paymentTermName}` : ''}`,
                        desc: 'Invoice will be raised — pay within your agreed payment terms',
                        badge: 'Trade',
                        requiresTerms: true,
                        requiresCollection: false,
                      },
                      {
                        id: 'collection',
                        icon: '🏪',
                        label: 'Pay on Collection',
                        desc: 'Pay in full at our Coventry trade counter when you collect',
                        badge: 'C&C Only',
                        requiresTerms: false,
                        requiresCollection: true,
                      },
                      {
                        id: 'card',
                        icon: '💳',
                        label: 'Pay by Card',
                        desc: 'Visa, Mastercard, Amex — processed securely by Stripe',
                        badge: null,
                        requiresTerms: false,
                        requiresCollection: false,
                      },
                      {
                        id: 'bank',
                        icon: '🏦',
                        label: 'Bank Transfer',
                        desc: 'Pay by BACS — order held until payment confirmed',
                        badge: null,
                        requiresTerms: false,
                        requiresCollection: false,
                      },
                    ]
                      .filter(pm => !pm.requiresTerms || hasAccountTerms)
                      .filter(pm => !pm.requiresCollection || deliveryMethod === 'collection')
                      .map(pm => (
                      <label key={pm.id}
                        className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          paymentMethod === pm.id ? 'border-[#004475] bg-[#f0f7f4]' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <input type="radio" name="payment" value={pm.id}
                          checked={paymentMethod === pm.id}
                          onChange={() => { setPaymentMethod(pm.id as typeof paymentMethod); setPaymentError(''); }}
                          className="accent-[#004475]" />
                        <span className="text-2xl">{pm.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-gray-900">{pm.label}</p>
                            {pm.badge && <span className="text-xs bg-[#ff8f00] text-[#004475] font-bold px-2 py-0.5 rounded-full">{pm.badge}</span>}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{pm.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {paymentMethod === 'bank' && (
                  <div className="card p-5 bg-blue-50 border-blue-200">
                    <h3 className="font-semibold text-blue-900 mb-3">🏦 Bank Transfer Details</h3>
                    <div className="space-y-2 text-sm">
                      {[
                        ['Account Name', 'FT Paints Ltd'],
                        ['Sort Code', '04-06-05'],
                        ['Account Number', '20704785'],
                        ['Reference', 'Your order number (shown after placing order)'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between py-1.5 border-b border-blue-100 last:border-0">
                          <span className="text-blue-600">{k}</span>
                          <span className="font-mono font-semibold text-blue-900">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="card p-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Order Notes (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                    placeholder="Special instructions, access notes, specific requirements..." />
                </div>

                <button
                  onClick={paymentMethod === 'card' ? async () => {
                    // Check stock first — out of stock items need a quote, not Stripe
                    const outOfStock = items.filter(i => typeof i.qtyAvailable === 'number' && i.qtyAvailable < i.qty);
                    if (outOfStock.length > 0) {
                      setPaymentError(`"${outOfStock[0].name}" is out of stock. Please use Bank Transfer or your account terms.`);
                      return;
                    }
                    setPaymentError('');
                    setPlacing(true);
                    try {
                      const res = await fetch('/api/payment/create-session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          amount: totalIncVat,
                          description: 'FTPaints Order',
                          customerEmail: session?.user?.email,
                          reference: `ORD-${Date.now()}`,
                          lines: items.map(item => ({
                            product_id: item.id,
                            code: item.code,
                            name: item.name,
                            qty: item.qty,
                            price: item.price,
                          })),
                        }),
                      });
                      const d = await res.json();
                      if (!res.ok) {
                        setPaymentError(d.error || 'Payment service unavailable. Please try again or use Bank Transfer.');
                        setPlacing(false);
                        return;
                      }
                      if (d.url) {
                        window.location.href = d.url;
                      } else {
                        setPaymentError('Unable to connect to payment service. Please try again or use Bank Transfer.');
                        setPlacing(false);
                      }
                    } catch {
                      setPaymentError('Network error. Please check your connection and try again.');
                      setPlacing(false);
                    }
                  } : placeOrder}
                  disabled={placing}
                  className="btn-primary w-full py-3 text-base disabled:opacity-60"
                >
                  {placing ? 'Placing order...' : (
                    paymentMethod === 'card' ? `Pay £${totalIncVat.toFixed(2)} by Card` :
                    paymentMethod === 'bank' ? `Place Order — Pay £${totalIncVat.toFixed(2)} by Bank Transfer` :
                    `Place Order on Account — £${totalIncVat.toFixed(2)}`
                  )}
                </button>
                <p className="text-xs text-center text-gray-400">
                  {paymentMethod === 'account' ? 'Invoice raised on despatch — 30 day payment terms apply' :
                   paymentMethod === 'bank' ? 'Order confirmed when payment received (1-2 working days)' :
                   'Secure payment processed by Stripe'}
                </p>
                {paymentError && (
                  <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 text-center">
                    ⚠️ {paymentError}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Order summary */}
          <div className="space-y-4">
            <div className="card p-4 sticky top-20">
              <h3 className="font-bold text-gray-900 mb-3">Order Summary</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {items.map(item => (
                  <div key={item.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 truncate flex-1 mr-2">{item.name.substring(0,35)} ×{item.qty}</span>
                      <span className="font-medium text-gray-900 flex-shrink-0">£{(item.price * item.qty).toFixed(2)}</span>
                    </div>
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
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span><span>£{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>{selectedMethod.name}</span>
                  <span>{deliveryCost === 0 ? <span className="text-green-600 font-medium">FREE</span> : `£${deliveryCost.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>VAT (20%)</span><span>£{vat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-100 pt-2 mt-1">
                  <span>Total</span><span>£{totalIncVat.toFixed(2)}</span>
                </div>
              </div>
              {deliverySlot && (
                <div className="mt-3 bg-green-50 rounded-lg p-2.5 text-xs text-green-800">
                  📅 {deliveryMethod === 'collection' ? 'Collecting' : 'Delivery'}: <strong>{deliverySlot.label}</strong>
                  {deliverySlot.time && ` — ${deliverySlot.time}`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
