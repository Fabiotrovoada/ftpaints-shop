'use client';
import { useState, useRef } from 'react';
import { useBasket } from '@/lib/basketStore';

interface ImportRow {
  code: string;
  qty: number;
  name?: string;
  price?: number;
  found?: boolean;
  productId?: number;
}

export default function ImportOrder() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { addItem } = useBasket();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setImported(false);

    const text = await file.text();
    const lines = text.trim().split('\n');
    const parsed: ImportRow[] = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) continue;
      const code = parts[0];
      const qty = parseInt(parts[1]) || 1;
      if (!code || code.toLowerCase() === 'code' || code.toLowerCase() === 'ref') continue;
      parsed.push({ code, qty });
    }

    // Look up products by code
    if (parsed.length > 0) {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(parsed.map(p=>p.code).join(' '))}&limit=100`);
        const data = await res.json();
        const products = data.products || [];
        const productMap = new Map(products.map((p: { default_code?: string; id: number; name: string; list_price: number }) =>
          [p.default_code?.toLowerCase(), p]
        ));

        parsed.forEach(row => {
          const match = productMap.get(row.code.toLowerCase()) as { id: number; name: string; list_price: number } | undefined;
          if (match) {
            row.found = true;
            row.productId = match.id;
            row.name = match.name;
            row.price = match.list_price;
          } else {
            row.found = false;
          }
        });
      } catch (err) {
        console.error(err);
      }
    }

    setRows(parsed);
    setLoading(false);
  }

  function importAll() {
    rows.filter(r => r.found && r.productId).forEach(r => {
      addItem({ id: r.productId!, name: r.name!, code: r.code, price: r.price!, qty: r.qty });
    });
    setImported(true);
    setTimeout(() => { setOpen(false); setRows([]); setImported(false); }, 2000);
  }

  const foundCount = rows.filter(r => r.found).length;

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex-shrink-0 bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-600 cursor-pointer hover:bg-gray-50 flex items-center gap-1.5 whitespace-nowrap">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
        </svg>
        Import Order
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="bg-[#004475] text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Import Order</h2>
                <p className="text-gray-300 text-sm mt-0.5">Upload a CSV to bulk-add products</p>
              </div>
              <button onClick={() => { setOpen(false); setRows([]); }} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Format guide */}
              <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-600">
                <p className="font-semibold text-gray-800 mb-2">📄 CSV Format (2 columns):</p>
                <code className="block font-mono bg-gray-100 rounded p-2 text-gray-700">
                  Code,Quantity<br/>
                  SAT.210260,5<br/>
                  FMT7921,10<br/>
                  MMM.16000,2
                </code>
                <p className="mt-2 text-gray-500">First row can be a header (Code,Quantity) — it will be skipped automatically.</p>
              </div>

              {/* File upload */}
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 hover:border-[#004475] rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                </svg>
                <p className="text-sm font-medium text-gray-600">Click to upload CSV</p>
                <p className="text-xs text-gray-400 mt-1">or drag and drop</p>
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
              </div>

              {loading && <p className="text-center text-sm text-gray-500 animate-pulse">Looking up products...</p>}

              {/* Results */}
              {rows.length > 0 && !loading && (
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">
                    Found {foundCount} of {rows.length} products
                    {rows.length - foundCount > 0 && <span className="text-red-500 ml-1">({rows.length - foundCount} not found)</span>}
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {rows.map((r, i) => (
                      <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${r.found ? 'bg-green-50' : 'bg-red-50'}`}>
                        <div className="flex items-center gap-2">
                          <span className={r.found ? 'text-green-500' : 'text-red-400'}>
                            {r.found ? '✓' : '✗'}
                          </span>
                          <span className="font-mono text-xs">{r.code}</span>
                          {r.name && <span className="text-gray-600 truncate max-w-[150px]">{r.name.substring(0,30)}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          {r.price && <span className="text-gray-500">£{r.price.toFixed(2)}</span>}
                          <span className="font-bold text-gray-700">×{r.qty}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button onClick={() => { setRows([]); if(fileRef.current) fileRef.current.value=''; }}
                      className="btn-outline text-sm flex-1">Clear</button>
                    <button
                      onClick={importAll}
                      disabled={foundCount === 0}
                      className={`flex-1 btn-primary text-sm disabled:opacity-50 ${imported ? 'bg-green-500' : ''}`}
                    >
                      {imported ? '✓ Added to Basket!' : `Add ${foundCount} to Basket`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
