'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchResult {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  image_url?: string | null;
  image_128?: string;
}

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`)
        .then(r => r.json())
        .then(data => setResults(data.products || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function goToProduct(id: number) {
    router.push(`/shop/${id}`);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onClose()}
            placeholder="Search products, codes, brands..."
            className="flex-1 text-sm focus:outline-none text-gray-900"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {query.trim() && (
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">Searching...</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">No products found</div>
            ) : (
              results.map(product => (
                <button
                  key={product.id}
                  onClick={() => goToProduct(product.id)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {(product.image_url || product.image_128) ? (
                      <img
                        src={product.image_url || `data:image/png;base64,${product.image_128}`}
                        alt={product.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <Search size={14} className="text-gray-200" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{product.default_code || '—'}</p>
                  </div>
                  {product.list_price > 0 && (
                    <span className="text-sm font-semibold text-[#004475] flex-shrink-0">£{product.list_price.toFixed(2)}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
