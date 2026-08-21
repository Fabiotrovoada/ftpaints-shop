'use client';
import { useState } from 'react';

interface Invoice {
  id: number;
  name: string;
  invoice_date: string;
  invoice_date_due: string;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
}

interface Props {
  invoices: Invoice[];
  totalOutstanding: number;
  customerEmail: string;
  onClose: () => void;
}

export default function PaymentModal({ invoices, totalOutstanding, customerEmail, onClose }: Props) {
  const [mode, setMode] = useState<'select' | 'stripe' | 'bank'>('select');
  const [selectedIds, setSelectedIds] = useState<number[]>(
    invoices.filter(i => i.amount_residual > 0).map(i => i.id)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const unpaidInvoices = invoices.filter(i => i.amount_residual > 0);
  const selectedTotal = unpaidInvoices
    .filter(i => selectedIds.includes(i.id))
    .reduce((s, i) => s + i.amount_residual, 0);
  const selectedNames = unpaidInvoices
    .filter(i => selectedIds.includes(i.id))
    .map(i => i.name);

  function toggleInvoice(id: number) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function payWithStripe() {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/payment/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: selectedTotal,
          invoiceIds: unpaidInvoices.filter(i => selectedIds.includes(i.id)).map(i => i.id),
          description: `FTPaints Invoice Payment — ${selectedNames.join(', ')}`,
          customerEmail,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error === 'Stripe not configured') {
        setError('Online payment is not yet configured. Please use bank transfer.');
      } else {
        setError(data.error || 'Payment failed');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const bankName = process.env.NEXT_PUBLIC_BANK_NAME || 'Tide';
  const bankAccountName = 'FT Paints Ltd';
  const bankSortCode = '04-06-05';
  const bankAccountNumber = '20704785';
  const reference = selectedNames[0] || 'Your Invoice Number';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-[#004475] text-white p-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Pay Invoices</h2>
            <p className="text-gray-300 text-sm mt-0.5">Select invoices to pay</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Invoice selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Outstanding Invoices</p>
              <button
                onClick={() => setSelectedIds(
                  selectedIds.length === unpaidInvoices.length ? [] : unpaidInvoices.map(i => i.id)
                )}
                className="text-xs text-[#004475] hover:underline font-medium"
              >
                {selectedIds.length === unpaidInvoices.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="space-y-2">
              {unpaidInvoices.map(inv => (
                <label
                  key={inv.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedIds.includes(inv.id) ? 'border-[#004475] bg-[#f0f7f4]' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(inv.id)}
                    onChange={() => toggleInvoice(inv.id)}
                    className="accent-[#004475] w-4 h-4"
                  />
                  <div className="flex-1">
                    <p className="font-mono text-sm font-semibold text-gray-900">{inv.name}</p>
                    <p className="text-xs text-gray-500">
                      Due: {inv.invoice_date_due ? new Date(inv.invoice_date_due).toLocaleDateString('en-GB') : 'N/A'}
                      {new Date(inv.invoice_date_due) < new Date() && (
                        <span className="ml-2 text-red-500 font-medium">● OVERDUE</span>
                      )}
                    </p>
                  </div>
                  <span className="font-bold text-gray-900">£{inv.amount_residual.toFixed(2)}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Total */}
          <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Amount to pay</p>
              <p className="text-2xl font-bold text-[#004475]">£{selectedTotal.toFixed(2)}</p>
              <p className="text-xs text-gray-400">inc. VAT</p>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>{selectedIds.length} invoice{selectedIds.length !== 1 ? 's' : ''} selected</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Payment method toggle */}
          {mode === 'select' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700">Choose payment method</p>

              {/* Card / Stripe */}
              <button
                onClick={() => { setMode('stripe'); payWithStripe(); }}
                disabled={selectedIds.length === 0 || loading}
                className="w-full bg-[#004475] hover:bg-[#ff8f00] text-white rounded-xl p-4 flex items-center gap-4 transition-colors disabled:opacity-50"
              >
                <div className="text-2xl">💳</div>
                <div className="text-left">
                  <p className="font-semibold">Pay by Card</p>
                  <p className="text-xs text-gray-300">Visa, Mastercard, Amex — powered by Stripe</p>
                </div>
                <span className="ml-auto text-[#ff8f00] font-bold">£{selectedTotal.toFixed(2)}</span>
              </button>

              {/* Bank Transfer */}
              <button
                onClick={() => setMode('bank')}
                disabled={selectedIds.length === 0}
                className="w-full bg-white border-2 border-[#004475] text-[#004475] rounded-xl p-4 flex items-center gap-4 hover:bg-[#f0f7f4] transition-colors disabled:opacity-50"
              >
                <div className="text-2xl">🏦</div>
                <div className="text-left">
                  <p className="font-semibold">Bank Transfer</p>
                  <p className="text-xs text-gray-500">BACS / Faster Payments — 1-2 working days</p>
                </div>
                <span className="ml-auto text-[#004475] font-bold">£{selectedTotal.toFixed(2)}</span>
              </button>
            </div>
          )}

          {/* Bank transfer details */}
          {mode === 'bank' && (
            <div className="space-y-3">
              <button onClick={() => setMode('select')} className="text-sm text-gray-500 hover:text-gray-700">← Back</button>
              <div className="bg-[#f0f7f4] border border-[#004475]/20 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">🏦</span>
                  <p className="font-bold text-[#004475]">Bank Transfer Details</p>
                </div>
                {[
                  { label: 'Account Name', value: bankAccountName },
                  { label: 'Sort Code', value: bankSortCode },
                  { label: 'Account Number', value: bankAccountNumber },
                  { label: 'Amount', value: `£${selectedTotal.toFixed(2)}` },
                  { label: 'Reference', value: reference, highlight: true },
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-[#004475]/10 last:border-0">
                    <span className="text-sm text-gray-500">{row.label}</span>
                    <span className={`font-mono font-semibold text-sm ${row.highlight ? 'text-[#ff8f00] bg-[#004475] px-2 py-0.5 rounded' : 'text-gray-900'}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                ⚠️ <strong>Important:</strong> Please use <strong>{reference}</strong> as your payment reference so we can match it to your account.
              </div>
              <button
                onClick={() => {
                  const text = `FTPaints Bank Transfer\nAccount: ${bankAccountName}\nSort Code: ${bankSortCode}\nAccount No: ${bankAccountNumber}\nAmount: £${selectedTotal.toFixed(2)}\nReference: ${reference}`;
                  navigator.clipboard?.writeText(text);
                }}
                className="w-full btn-outline text-sm py-2.5"
              >
                📋 Copy bank details
              </button>
              <p className="text-xs text-center text-gray-400">Your account will be updated within 1-2 working days of receipt</p>
            </div>
          )}

          {mode === 'stripe' && loading && (
            <div className="text-center py-4 text-gray-500">
              <div className="animate-spin w-8 h-8 border-2 border-[#004475] border-t-transparent rounded-full mx-auto mb-2"/>
              Redirecting to secure payment...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
