'use client';
import Link from 'next/link';
import { useCart } from './CartContext';
import { ShoppingCart } from 'lucide-react';

export default function Header() {
  const { count, total } = useCart();

  return (
    <header className="bg-[#004475] text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-black tracking-tight">
            <span className="text-white">FT</span>
            <span className="text-[#d4a017]">Paints</span>
          </span>
          <span className="badge-trade text-[10px] px-1.5 py-0.5">TRADE</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-[#f97316] transition-colors">Products</Link>
          <Link href="/orders" className="hover:text-[#f97316] transition-colors">My Orders</Link>
        </nav>

        {/* Cart */}
        <Link href="/basket" className="flex items-center gap-2 bg-[#f97316] hover:bg-[#ea6c10] transition-colors px-4 py-2 rounded-lg font-semibold text-sm">
          <ShoppingCart size={18} />
          <span>Basket</span>
          {count > 0 && (
            <span className="bg-white text-[#004475] text-xs font-bold px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
          {total > 0 && (
            <span className="text-white/90">£{total.toFixed(2)}</span>
          )}
        </Link>
      </div>
    </header>
  );
}
