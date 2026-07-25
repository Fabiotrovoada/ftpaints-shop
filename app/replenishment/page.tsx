'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { useBasket } from '@/lib/basketStore';

interface ReplenishItem {
  productId: number;
  productName: string;
  code: string;
  price: number;
  minStock: number;
  maxStock: number;
  currentStock: number; // customer's tracked stock
  lastOrderedQty: number;
  lastOrderedDate: string;
}

const STORAGE_KEY = 'ftpaints-replenishment';

function loadItems(): ReplenishItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

function saveItems(items: ReplenishItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export default function ReplenishmentPage() {
  const { data: session } = useSession();
  const { addItem } = useBasket();
  const [items, setItems] = useState<ReplenishItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: number; name: string; default_code: string; list_price: number }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addedAll, setAddedAll] = useState(false);

  useEffect(() => { setItems(loadItems()); }, []);

  async function searchProducts(q: string) {
    if (!q || q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setSearchResults(data.products || []);
    } finally { setSearchLoading(false); }
  }

  function addProduct(p: { id: number; name: string; default_code: string|false; list_price: number }) {
    const exists = items.find(i => i.productId === p.id);
    if (exists) return;
    const newItem: ReplenishItem = {
      productId: p.id,
      productName: p.name,
      code: p.default_code || '',
      price: p.list_price,
      minStock: 5,
      maxStock: 20,
      currentStock: 0,
      lastOrderedQty: 0,
      lastOrderedDate: '',
    };
    const updated = [...items, newItem];
    setItems(updated);
    saveItems(updated);
    setSearch('');
    setSearchResults([]);
  }

  function updateItem(id: number, field: keyof ReplenishItem, value: number | string) {
    const updated = items.map(i => i.productId === id ? { ...i, [field]: value } : i);
    setItems(updated);
    saveItems(updated);
  }

  function removeItem(id: number) {
    const updated = items.filter(i => i.productId !== id);
    setItems(updated);
    saveItems(updated);
  }

  // Items that need replenishment (current stock below min)
  const needsReorder = items.filter(i => i.currentStock <= i.minStock);
  const orderQty = (item: ReplenishItem) => Math.max(0, item.maxStock - item.currentStock);

  function addAllToBasket() {
    needsReorder.forEach(item => {
      const qty = orderQty(item);
      if (qty > 0) {
        addItem({ id: item.productId, name: item.productName, code: item.code, price: item.price, qty });
        const updated = items.map(i => i.productId === item.productId
          ? { ...i, currentStock: i.maxStock, lastOrderedQty: qty, lastOrderedDate: new Date().toLocaleDateString('en-GB') }
          : i);
        setItems(updated);
        saveItems(updated);
      }
    });
    setAddedAll(true);
    setTimeout(() => setAddedAll(false), 3000);
  }

  const stockStatus = (item: ReplenishItem) => {
    if (item.currentStock <= item.minStock) return { label: '🔴 Reorder Now', color: 'text-red-600 bg-red-50' };
    if (item.currentStock <= item.minStock * 1.5) return { label: '🟡 Running Low', color: 'text-amber-600 bg-amber-50' };
    return { label: '🟢 OK', color: 'text-green-600 bg-green-50' };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Smart Replenishment</h1>
            <p className="text-gray-500 text-sm mt-1">Track your stock levels and auto-generate reorders</p>
          </div>
          {needsReorder.length > 0 && (
            <button
              onClick={addAllToBasket}
              className={`btn-primary flex items-center gap-2 ${addedAll ? 'bg-green-500' : ''}`}
            >
              {addedAll ? '✓ Added to Basket' : `Reorder ${needsReorder.length} item${needsReorder.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {/* Alert banner */}
        {needsReorder.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <span className="text-2xl">!</span>
            <div>
              <p className="font-semibold text-red-800">{needsReorder.length} item{needsReorder.length > 1 ? 's' : ''} need reordering</p>
              <p className="text-sm text-red-600">{needsReorder.map(i => i.productName.split(' ').slice(0,3).join(' ')).join(', ')}</p>
            </div>
          </div>
        )}

        {/* Add product search */}
        <div className="card p-4 mb-6">
          <p className="text-sm font-semibold text-gray-700 mb-2">Add product to track</p>
          <div className="relative">
            <input
              type="text"
              placeholder="Search products to add..."
              value={search}
              onChange={e => { setSearch(e.target.value); searchProducts(e.target.value); }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
            />
            {searchLoading && <span className="absolute right-3 top-3 text-xs text-gray-400">Searching...</span>}
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 mt-1 max-h-48 overflow-y-auto">
                {searchResults.map(p => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                  >
                    <span className="font-mono text-xs text-gray-400 mr-2">{p.default_code || '—'}</span>
                    <span className="text-gray-900">{p.name.substring(0, 60)}</span>
                    <span className="float-right text-[#004475] font-semibold">£{p.list_price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Items table */}
        {items.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="text-5xl mb-4">—</div>
            <p className="text-gray-500 font-medium mb-2">No products tracked yet</p>
            <p className="text-gray-400 text-sm">Search above to add products you regularly order. Set your min/max stock levels and we'll tell you when to reorder.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600">Product</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-24">Current<br/>Stock</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-20">Min</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-20">Max</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-28">Status</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-24">Order Qty</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-20">Price</th>
                    <th className="text-center px-3 py-3 font-semibold text-gray-600 w-20">Last Order</th>
                    <th className="px-3 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {items.map(item => {
                    const status = stockStatus(item);
                    const qty = orderQty(item);
                    return (
                      <tr key={item.productId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-gray-400">{item.code}</p>
                          <p className="font-medium text-gray-900 text-xs leading-tight mt-0.5">{item.productName.substring(0,55)}</p>
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            value={item.currentStock}
                            onChange={e => updateItem(item.productId, 'currentStock', parseInt(e.target.value)||0)}
                            className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#004475]"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            value={item.minStock}
                            onChange={e => updateItem(item.productId, 'minStock', parseInt(e.target.value)||0)}
                            className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#004475]"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            value={item.maxStock}
                            onChange={e => updateItem(item.productId, 'maxStock', parseInt(e.target.value)||0)}
                            className="w-full text-center border border-gray-200 rounded px-1 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#004475]"
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color}`}>{status.label}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {qty > 0 ? (
                            <button
                              onClick={() => {
                                addItem({ id: item.productId, name: item.productName, code: item.code, price: item.price, qty });
                                updateItem(item.productId, 'currentStock', item.maxStock);
                                updateItem(item.productId, 'lastOrderedQty', qty);
                                updateItem(item.productId, 'lastOrderedDate', new Date().toLocaleDateString('en-GB'));
                              }}
                              className="bg-[#004475] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#ff8f00] font-medium"
                            >
                              + {qty}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center text-sm font-medium text-gray-700">
                          £{item.price.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-gray-400">
                          {item.lastOrderedDate ? (
                            <><span className="block">{item.lastOrderedDate}</span><span className="text-gray-500">×{item.lastOrderedQty}</span></>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => removeItem(item.productId)} className="text-gray-300 hover:text-red-400 transition-colors">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary footer */}
            {needsReorder.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  Total reorder value: <strong className="text-[#004475]">
                    £{needsReorder.reduce((s, i) => s + orderQty(i) * i.price, 0).toFixed(2)}
                  </strong>
                </p>
                <button onClick={addAllToBasket} className={`btn-primary text-sm ${addedAll ? 'bg-green-500' : ''}`}>
                  {addedAll ? '✓ Added!' : `Add all ${needsReorder.length} to Basket`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* How it works */}
        <div className="mt-6 card p-5">
          <h3 className="font-bold text-gray-800 mb-3 text-sm">How Smart Replenishment works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="flex gap-2"><span className="text-[#ff8f00] font-bold">1.</span><span>Add the products you regularly use and set your <strong>min</strong> and <strong>max</strong> stock levels</span></div>
            <div className="flex gap-2"><span className="text-[#ff8f00] font-bold">2.</span><span>Update your <strong>current stock</strong> count whenever you receive or use products</span></div>
            <div className="flex gap-2"><span className="text-[#ff8f00] font-bold">3.</span><span>When stock drops below your <strong>minimum</strong>, click reorder to top up to your maximum in one click</span></div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
