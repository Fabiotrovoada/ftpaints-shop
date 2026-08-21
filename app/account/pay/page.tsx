'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Invoice } from '@/types/account';

export const dynamic = 'force-dynamic';

function PayPageInner() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselect = searchParams?.get('invoice'); // optional: pre-select one invoice

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [payMethod, setPayMethod] = useState<'card' | 'bank'>('card');
  const [processing, setProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch('/api/account/invoices')
      .then(r => r.json())
      .then(d => {
        const unpaid = (d.invoices || []).filter((i: Invoice) => i.amount_residual > 0);
        setInvoices(unpaid);
        // Pre-select: specific invoice or all
        if (preselect) {
          const match = unpaid.find((i: Invoice) => i.name === preselect);
          if (match) setSelected(new Set([match.id]));
        } else {
          setSelected(new Set(unpaid.map((i: Invoice) => i.id)));
        }
        setLoading(false);
      });
  }, [session, preselect]);

  const selectedInvoices = invoices.filter(i => selected.has(i.id));
  const totalToPay = selectedInvoices.reduce((s, i) => s + i.amount_residual, 0);
  const totalOverdue = selectedInvoices
    .filter(i => i.invoice_date_due && new Date(i.invoice_date_due) < new Date())
    .reduce((s, i) => s + i.amount_residual, 0);

  function toggleAll() {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map(i => i.id)));
  }

  function toggle(id: number) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }

  async function payByCard() {
    if (selectedInvoices.length === 0) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/payment/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalToPay,
          invoiceIds: selectedInvoices.map(i => i.id),
          description: selectedInvoices.length === 1
            ? `Invoice ${selectedInvoices[0].name}`
            : `${selectedInvoices.length} invoices — FTPaints`,
          customerEmail: session?.user?.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error === 'Stripe not configured'
          ? 'Card payments are not yet configured. Please use bank transfer.'
          : 'Failed to start payment. Please try again.');
      }
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  const bankDetails = {
    'Account Name': 'FT Paints Ltd',
    'Sort Code': '04-06-05',
    'Account Number': '20704785',
    'Bank': 'Tide',
    'Reference': selectedInvoices.length === 1
      ? selectedInvoices[0].name
      : `FTPAY-${session?.user?.email?.split('@')[0]?.toUpperCase()}`,
  };

  function copyBankDetails() {
    const text = Object.entries(bankDetails).map(([k,v]) => `${k}: ${v}`).join('\n')
      + `\nAmount: £${totalToPay.toFixed(2)}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div>
      <div>

        <button onClick={() => router.push('/account')} className="text-sm text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1">
          ← Back to Account
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">Pay Invoices</h1>
        <p className="text-gray-500 text-sm mb-6">Select which invoices to pay, then choose your payment method</p>

        {loading ? (
          <div className="card p-12 text-center text-gray-400">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-3">✅</div>
            <p className="font-semibold text-gray-900">All paid up!</p>
            <p className="text-gray-500 text-sm mt-1">You have no outstanding invoices.</p>
            <button onClick={() => router.push('/account')} className="btn-primary mt-4">Back to Account</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Invoice selector */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-700 text-sm">{invoices.length} outstanding invoice{invoices.length !== 1 ? 's' : ''}</p>
                <button onClick={toggleAll} className="text-sm text-[#004475] font-medium hover:underline">
                  {selected.size === invoices.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              {invoices.map(inv => {
                const isOverdue = inv.invoice_date_due && new Date(inv.invoice_date_due) < new Date();
                const isSelected = selected.has(inv.id);
                const daysOverdue = isOverdue
                  ? Math.floor((new Date().getTime() - new Date(inv.invoice_date_due).getTime()) / 86400000)
                  : 0;

                return (
                  <label
                    key={inv.id}
                    className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? isOverdue ? 'border-red-400 bg-red-50' : 'border-[#004475] bg-[#f0f7f4]'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(inv.id)}
                      className="mt-1 accent-[#004475] w-4 h-4 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-mono font-bold text-gray-900">{inv.name}</p>
                        {isOverdue && (
                          <span className="text-xs bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full">
                            {daysOverdue}d overdue
                          </span>
                        )}
                        {!isOverdue && (
                          <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">
                            Due {new Date(inv.invoice_date_due).toLocaleDateString('en-GB')}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Invoiced {new Date(inv.invoice_date).toLocaleDateString('en-GB')} · 
                        Total £{inv.amount_total.toFixed(2)}
                        {inv.payment_state === 'partial' && ` · Partial payment made`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-gray-900">£{inv.amount_residual.toFixed(2)}</p>
                      <p className="text-xs text-gray-400">outstanding</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Payment panel */}
            <div className="space-y-4">
              {/* Summary */}
              <div className="card p-5 sticky top-20">
                <h3 className="font-bold text-gray-900 mb-3">Payment Summary</h3>

                {selectedInvoices.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">Select invoices above</p>
                ) : (
                  <>
                    <div className="space-y-1.5 mb-4">
                      {selectedInvoices.map(i => (
                        <div key={i.id} className="flex justify-between text-sm">
                          <span className="font-mono text-gray-600">{i.name}</span>
                          <span className="font-medium">£{i.amount_residual.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {totalOverdue > 0 && (
                      <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                        ⚠️ £{totalOverdue.toFixed(2)} is overdue
                      </div>
                    )}

                    <div className="border-t border-gray-100 pt-3 mb-4">
                      <div className="flex justify-between font-bold text-lg">
                        <span>Total</span>
                        <span className="text-[#004475]">£{totalToPay.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">inc. VAT</p>
                    </div>

                    {/* Payment method toggle */}
                    <div className="flex gap-2 mb-4">
                      <button
                        onClick={() => setPayMethod('card')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
                          payMethod === 'card' ? 'border-[#004475] bg-[#004475] text-white' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        💳 Card
                      </button>
                      <button
                        onClick={() => setPayMethod('bank')}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg border-2 transition-all ${
                          payMethod === 'bank' ? 'border-[#004475] bg-[#004475] text-white' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        🏦 Bank
                      </button>
                    </div>

                    {payMethod === 'card' ? (
                      <button
                        onClick={payByCard}
                        disabled={processing}
                        className="w-full btn-primary py-3 text-sm font-bold disabled:opacity-60"
                      >
                        {processing ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"/>
                            Redirecting...
                          </span>
                        ) : `Pay £${totalToPay.toFixed(2)} by Card`}
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className="bg-blue-50 rounded-xl p-4 text-xs space-y-2">
                          {Object.entries(bankDetails).map(([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-blue-500">{k}</span>
                              <span className={`font-mono font-bold ${k === 'Reference' ? 'text-[#ff8f00] bg-[#004475] px-1.5 rounded' : 'text-blue-900'}`}>{v}</span>
                            </div>
                          ))}
                          <div className="flex justify-between border-t border-blue-100 pt-2 mt-1">
                            <span className="text-blue-500">Amount</span>
                            <span className="font-mono font-bold text-blue-900">£{totalToPay.toFixed(2)}</span>
                          </div>
                        </div>
                        <button onClick={copyBankDetails} className={`w-full btn-outline text-sm py-2.5 ${copied ? 'bg-green-50 border-green-400 text-green-700' : ''}`}>
                          {copied ? '✓ Copied!' : '📋 Copy bank details'}
                        </button>
                        <p className="text-xs text-center text-gray-400">Account updated within 1-2 working days</p>
                      </div>
                    )}

                    {payMethod === 'card' && (
                      <p className="text-xs text-center text-gray-400 mt-2">Secure payment via Stripe · Visa, Mastercard, Amex</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


export default function PayPage() {
  return (
    <Suspense fallback={<div className="card p-12 text-center text-gray-400">Loading...</div>}>
      <PayPageInner />
    </Suspense>
  );
}
