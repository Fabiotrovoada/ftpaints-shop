'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProductCard from '@/components/ProductCard';
import ImportOrder from '@/components/ImportOrder';
import { useFavourites } from '@/lib/favourites';

interface Product {
  id: number;
  name: string;
  default_code: string | false;
  list_price: number;
  standard_price: number;
  qty_available: number;
  virtual_available: number;
  categ_id: [number, string] | false;
  uom_id: [number, string] | false;
  image_128?: string;
  product_tag_ids?: number[];
}

interface Category { id: number; name: string; complete_name?: string; parent_id: [number,string]|false; image_url?: string | null; }
interface Tag { id: number; name: string; product_count: number; }

function SpendTracker() {
  const [spend, setSpend] = useState<number|null>(null);
  const [paymentTermName, setPaymentTermName] = useState<string | null>(null);
  const { data: session } = useSession();
  useEffect(() => {
    if (!session) return;
    // Fetch spend
    fetch('/api/account/orders')
      .then(r => r.json())
      .then(d => {
        const orders = d.orders || [];
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonth = orders
          .filter((o: { date_order: string; amount_total: number }) => new Date(o.date_order) >= monthStart)
          .reduce((s: number, o: { amount_total: number }) => s + o.amount_total, 0);
        setSpend(thisMonth);
      }).catch(() => {});
    // Fetch actual payment terms from Odoo
    fetch('/api/account/credit')
      .then(r => r.json())
      .then(d => setPaymentTermName(d?.paymentTermName || null))
      .catch(() => {});
  }, [session]);
  return (
    <>
      {spend !== null && (
        <span className="text-white font-medium">
          This month: £{spend.toFixed(2)}
        </span>
      )}
      {paymentTermName && (
        <span className="text-gray-400">· {paymentTermName}</span>
      )}
    </>
  );
}

const COLLECTIONS = [
  { id: 'all',        label: 'All Products' },
  { id: 'featured',  label: 'Featured' },
  { id: 'favourites',label: 'Favourites' },
  { id: 'clearance', label: 'Clearance' },
  { id: 'instock',   label: 'In Stock' },
];

export default function ShopPage() {
  const { data: session } = useSession();
  const { ids: favIds } = useFavourites();

  const [products, setProducts]       = useState<Product[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [categories, setCategories]   = useState<Category[]>([]);
  const [tags, setTags]             = useState<Tag[]>([]);
  const [selectedTag, setSelectedTag] = useState<number|null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [expandedCat, setExpandedCat] = useState<number | null>(null);
  const [expandedSubCat, setExpandedSubCat] = useState<number | null>(null);
  const [expandedSubSubCat, setExpandedSubSubCat] = useState<number | null>(null);
  // Sidebar: closed by default on mobile, open on desktop
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showFilterHint, setShowFilterHint] = useState(false);

  // On mount: open sidebar on desktop, check if first visit for hint
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    setSidebarOpen(!isMobile);
    // Show hint on first visit (mobile only)
    if (isMobile) {
      const hintShown = localStorage.getItem('ftpaints-filter-hint');
      if (!hintShown) {
        setShowFilterHint(true);
        localStorage.setItem('ftpaints-filter-hint', '1');
        setTimeout(() => setShowFilterHint(false), 4000);
      }
    }
  }, []);

  // Filters
  const [search, setSearch]           = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [categoryId, setCategoryId]   = useState<number|null>(null);
  const [collection, setCollection]   = useState('all');
  const [page, setPage]               = useState(0);
  const [sort, setSort]               = useState('name asc');

  const limit = 18;

  // Load categories once
  useEffect(() => {
    if (!session) return;
    fetch('/api/categories')
      .then(r => r.json())
      .then(d => setCategories(Array.isArray(d.categories) ? d.categories : []))
      .catch(() => setCategories([]));
  }, [session]);

  // Load tags once
  useEffect(() => {
    if (!session) return;
    fetch('/api/tags')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.tags)) setTags(d.tags); })
      .catch(() => {});
  }, [session]);

  const loadProducts = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      // Map UI sort values to Odoo field names
      const sortMap: Record<string, string> = {
        'name asc': 'name asc',
        'name desc': 'name desc',
        'list_price asc': 'list_price asc',
        'list_price desc': 'list_price desc',
        'default_code asc': 'default_code asc',
      };
      // Favourites: ask the server for exactly the favourited templates, so the
      // whole set shows regardless of catalogue pagination (not just the current page).
      if (collection === 'favourites') {
        const favArray = Array.from(favIds);
        if (favArray.length === 0) {
          setProducts([]);
          setTotal(0);
          return;
        }
        const favRes = await fetch(`/api/products?ids=${favArray.join(',')}`);
        const favData = await favRes.json();
        const favProds = Array.isArray(favData.products) ? favData.products : [];
        setProducts(favProds);
        setTotal(favProds.length);
        return;
      }

      const params = new URLSearchParams({
        search,
        inStockOnly: String(inStockOnly || collection === 'instock'),
        offset: String(page * limit),
        limit: String(limit),
        sort: sortMap[sort] || 'name asc',
      });
      if (categoryId) params.set('categoryId', String(categoryId));
      if (selectedTag) params.set('tagId', String(selectedTag));
      if (collection === 'clearance') params.set('clearance', 'true');

      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      const prods = Array.isArray(data.products) ? data.products : [];

      setProducts(prods);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [session, search, inStockOnly, categoryId, selectedTag, collection, page, sort, favIds]);

  useEffect(() => { loadProducts(); }, [loadProducts, selectedTag, sort]);

  const totalPages = Math.ceil(total / limit);

  // Build category hierarchy
  const allCats = Array.isArray(categories) ? categories : [];
  // Top level = categories with no parent (both brand and non-brand root categories)
  const topCats = allCats.filter((c: Category & { is_brand?: boolean }) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
  // Get children of a category
  const getChildren = (parentId: number) => allCats.filter(c => c.parent_id && (c.parent_id as [number,string])[0] === parentId).sort((a,b) => a.name.localeCompare(b.name));
  const getGrandChildren = (parentId: number) => allCats.filter(c => c.parent_id && (c.parent_id as [number,string])[0] === parentId).sort((a,b) => a.name.localeCompare(b.name));
  const getGreatGrandChildren = (parentId: number) => allCats.filter(c => c.parent_id && (c.parent_id as [number,string])[0] === parentId).sort((a,b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Spend tracker bar */}
      <div className="bg-[#001e3c] text-white py-2 px-4 text-xs border-b border-[#ff8f00]">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <span className="text-gray-400 hidden sm:block">{session?.user?.email}</span>
          <div className="flex items-center gap-4 flex-wrap">
            <SpendTracker />
            <span className="text-gray-400">· All prices exc. VAT</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">

        {/* Collection tabs */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {COLLECTIONS.map(c => (
            <button
              key={c.id}
              onClick={() => { setCollection(c.id); setPage(0); }}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 ${
                collection === c.id
                  ? 'bg-[#004475] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex gap-5">
          {/* Sidebar filters */}
          {/* Mobile overlay backdrop */}
          {sidebarOpen && (
            <div className="md:hidden fixed inset-0 bg-black/20 z-10" onClick={() => setSidebarOpen(false)} />
          )}
          <aside className={`
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
            ${sidebarOpen ? 'md:w-56' : 'md:w-0 md:overflow-hidden'}
            fixed md:relative top-0 left-0 h-full md:h-auto
            w-72 md:w-56 z-20 md:z-auto
            transition-all duration-200 ease-in-out
            overflow-y-auto md:overflow-visible
          `}>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-5 sticky top-20">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 text-sm">Filters</h3>
                <button onClick={() => { setCategoryId(null); setInStockOnly(false); setSearch(''); setSelectedTag(null); }}
                  className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
              </div>

              {/* In Stock toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => { setInStockOnly(!inStockOnly); setPage(0); }}
                  className={`w-9 h-5 rounded-full transition-colors flex items-center ${inStockOnly ? 'bg-[#004475]' : 'bg-gray-200'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${inStockOnly ? 'translate-x-4' : 'translate-x-0'}`} />
                </div>
                <span className="text-sm text-gray-700">In stock only</span>
              </label>

              {/* Brand / Tags filter — collapsible */}
              {tags.length > 0 && (
                <div>
                  <button
                    onClick={() => setTagsExpanded(!tagsExpanded)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-700"
                  >
                    <span>Brand</span>
                    <span className={`text-gray-400 text-xs transition-transform ${tagsExpanded ? 'rotate-180' : ''}`}>▼</span>
                  </button>

                  {tagsExpanded && (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => { setSelectedTag(null); setPage(0); }}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!selectedTag ? 'bg-[#004475] text-white border-[#004475]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#004475] hover:text-[#004475]'}`}
                      >
                        All
                      </button>
                      {tags.map(tag => (
                        <button
                          key={tag.id}
                          onClick={() => {
                            const newTagId = tag.id === selectedTag ? null : tag.id;
                            setSelectedTag(newTagId);
                            setCategoryId(null);
                            setPage(0);
                            if (newTagId) setProducts([]);
                          }}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedTag === tag.id ? 'bg-[#004475] text-white border-[#004475]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#004475] hover:text-[#004475]'}`}
                          title={`${tag.product_count} products`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Collapsible Categories — Ocado-style */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Categories</p>
                <div className="space-y-0.5 max-h-[50vh] overflow-y-auto -mx-1 px-1">
                  {/* All Categories */}
                  <button
                    onClick={() => { setCategoryId(null); setSelectedTag(null); setPage(0); setExpandedCat(null); setExpandedSubCat(null); setExpandedSubSubCat(null); if(window.innerWidth < 768) setSidebarOpen(false); }}
                    className={`w-full text-left text-sm px-2 py-2 rounded-lg transition-colors font-medium ${!categoryId ? 'bg-[#004475] text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                  >All Categories</button>

                  {/* Top-level brand categories */}
                  {topCats.map(cat => {
                    const children = getChildren(cat.id);
                    const isExpanded = expandedCat === cat.id;
                    const isActive = categoryId === cat.id;

                    return (
                      <div key={cat.id}>
                        {/* Brand category row */}
                        <div className={`flex items-center rounded-lg ${isActive ? 'bg-[#004475]' : 'hover:bg-gray-100'}`}>
                          <button
                            onClick={() => { setCategoryId(cat.id); setSelectedTag(null); setPage(0); if(window.innerWidth < 768) setSidebarOpen(false); }}
                            className={`flex-1 text-left text-sm px-2 py-2 font-medium ${isActive ? 'text-white' : 'text-gray-700'}`}
                          >
                            {cat.name}
                          </button>
                          {children.length > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedCat(isExpanded ? null : cat.id); setExpandedSubCat(null); }}
                              className={`px-2 py-2 text-sm ${isActive ? 'text-white/70' : 'text-gray-400'}`}
                            >
                              {isExpanded ? '▲' : '▶'}
                            </button>
                          )}
                        </div>

                        {/* Subcategories */}
                        {isExpanded && children.length > 0 && (
                          <div className="ml-3 border-l-2 border-gray-200 pl-2 space-y-0.5 mt-0.5">
                            {children.map(sub => {
                              const grandChildren = getGrandChildren(sub.id);
                              const isSubExpanded = expandedSubCat === sub.id;
                              const isSubActive = categoryId === sub.id;

                              return (
                                <div key={sub.id}>
                                  <div className={`flex items-center rounded-lg ${isSubActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                    <button
                                      onClick={() => { setCategoryId(sub.id); setSelectedTag(null); setPage(0); if(window.innerWidth < 768) setSidebarOpen(false); }}
                                      className={`flex-1 text-left text-xs px-2 py-1.5 ${isSubActive ? 'text-[#004475] font-semibold' : 'text-gray-600'}`}
                                    >
                                      {sub.name}
                                    </button>
                                    {grandChildren.length > 0 && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setExpandedSubCat(isSubExpanded ? null : sub.id); }}
                                        className="px-2 py-1.5 text-xs text-gray-400"
                                      >
                                        {isSubExpanded ? '▲' : '▶'}
                                      </button>
                                    )}
                                  </div>

                                  {/* Sub-subcategories (level 3) */}
                                  {isSubExpanded && grandChildren.length > 0 && (
                                    <div className="ml-3 border-l border-gray-200 pl-2 space-y-0.5 mt-0.5">
                                      {grandChildren.map(gsub => {
                                        const greatGrandChildren = getGreatGrandChildren(gsub.id);
                                        const isGSubExpanded = expandedSubSubCat === gsub.id;
                                        const isGSubActive = categoryId === gsub.id;

                                        return (
                                          <div key={gsub.id}>
                                            <div className={`flex items-center rounded-lg ${isGSubActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                              <button
                                                onClick={() => { setCategoryId(gsub.id); setPage(0); if(window.innerWidth < 768) setSidebarOpen(false); }}
                                                className={`flex-1 text-left text-xs px-2 py-1.5 ${isGSubActive ? 'text-[#004475] font-semibold' : 'text-gray-600'}`}
                                              >
                                                {gsub.name}
                                              </button>
                                              {greatGrandChildren.length > 0 && (
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); setExpandedSubSubCat(isGSubExpanded ? null : gsub.id); }}
                                                  className="px-2 py-1.5 text-xs text-gray-400"
                                                >
                                                  {isGSubExpanded ? '▲' : '▶'}
                                                </button>
                                              )}
                                            </div>

                                            {/* Sub-sub-subcategories (level 4) */}
                                            {isGSubExpanded && greatGrandChildren.length > 0 && (
                                              <div className="ml-3 border-l border-gray-200 pl-2 space-y-0.5 mt-0.5">
                                                {greatGrandChildren.map(ggsub => (
                                                  <button
                                                    key={ggsub.id}
                                                    onClick={() => { setCategoryId(ggsub.id); setPage(0); if(window.innerWidth < 768) setSidebarOpen(false); }}
                                                    className={`w-full text-left text-xs px-2 py-1 rounded ${categoryId === ggsub.id ? 'text-[#004475] font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
                                                  >
                                                    {ggsub.name}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sort */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Sort by</p>
                <select
                  value={sort}
                  onChange={e => { setSort(e.target.value); setPage(0); }}
                  className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#004475]"
                >
                  <option value="name asc">Name A-Z</option>
                  <option value="name desc">Name Z-A</option>
                  <option value="list_price asc">Price: Low to High</option>
                  <option value="list_price desc">Price: High to Low</option>
                  <option value="default_code asc">Product Code</option>
                </select>
              </div>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Search + controls bar */}
            <div className="flex gap-2 mb-4">
              {/* Burger button with first-visit hint */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => { setSidebarOpen(!sidebarOpen); setShowFilterHint(false); }}
                  className={`bg-white border rounded-lg px-3 py-2.5 flex-shrink-0 transition-colors ${sidebarOpen ? 'border-[#004475] text-[#004475] bg-blue-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
                  title="Toggle filters"
                >
                  {sidebarOpen ? '✕' : '☰'}
                </button>
                {/* First-visit hint tooltip */}
                {showFilterHint && (
                  <div className="absolute top-full left-0 mt-2 z-30 w-44 bg-[#004475] text-white text-xs rounded-xl px-3 py-2 shadow-lg">
                    <div className="absolute -top-1.5 left-4 w-3 h-3 bg-[#004475] rotate-45" />
                    👆 Tap to filter by category &amp; brand
                  </div>
                )}
              </div>
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search products, codes, brands..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(0); }}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004475]"
                />
              </div>

              <ImportOrder />
            </div>

            {/* Product grid */}
            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({length:12}).map((_,i) => (
                  <div key={i} className="card animate-pulse">
                    <div className="bg-gray-100 h-36"/>
                    <div className="p-3 space-y-2">
                      <div className="bg-gray-100 rounded h-3 w-1/2"/>
                      <div className="bg-gray-100 rounded h-3"/>
                      <div className="bg-gray-100 rounded h-3 w-3/4"/>
                      <div className="bg-gray-100 rounded h-8 mt-3"/>
                    </div>
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-5xl mb-3">🔍</div>
                <p className="text-lg font-medium">No products found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {products.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button onClick={() => { setPage(p=>Math.max(0,p-1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={page===0}
                  className="btn-outline text-sm disabled:opacity-40 px-4 py-2">← Prev</button>
                <span className="text-sm text-gray-500 px-4">Page {page+1} of {totalPages}</span>
                <button onClick={() => { setPage(p=>Math.min(totalPages-1,p+1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={page>=totalPages-1}
                  className="btn-outline text-sm disabled:opacity-40 px-4 py-2">Next →</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
