'use client';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useBasket } from '@/lib/basketStore';

function CreditBadge() {
  const [credit, setCredit] = useState<{ limit: number; used: number; onStop: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/account/credit').then(r => r.json()).then(setCredit).catch(() => {});
  }, []);
  if (!credit || credit.limit === 0) return null;
  const pct = Math.min(100, (credit.used / credit.limit) * 100);
  const remaining = credit.limit - credit.used;
  if (credit.onStop) return (
    <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded animate-pulse">
      🛑 ACCOUNT ON STOP
    </span>
  );
  return (
    <span className={`text-xs ${pct > 80 ? 'text-amber-400' : 'text-gray-400'}`}>
      Credit: £{remaining.toFixed(0)} remaining
    </span>
  );
}

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { itemCount } = useBasket();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: '/shop', label: 'Shop' },
    { href: '/replenishment', label: 'Replenishment' },
    { href: '/account', label: 'My Account' },
  ];

  return (
    <nav className="bg-[#004475] text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/shop" className="flex items-center gap-2">
            <span className="text-white font-black text-xl tracking-tight">FT<span style={{color: '#c8a951'}}>Paints</span></span>
            <span className="text-[10px] font-bold uppercase tracking-widest border border-[#c8a951] text-[#c8a951] px-1.5 py-0.5 rounded" style={{letterSpacing: '0.18em'}}>Trade</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={`text-sm font-medium transition-colors ${pathname.startsWith(l.href) ? 'text-white border-b-2 border-[#ff8f00] pb-0.5' : 'text-gray-300 hover:text-white'}`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Basket */}
            <Link href="/basket" className="relative p-2 hover:text-[#ff8f00] transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#ff8f00] text-[#004475] text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </Link>

            {/* Credit badge */}
            <CreditBadge />
            {/* User */}
            <span className="hidden md:block text-sm text-gray-300 truncate max-w-[160px]">
              {session?.user?.email}
            </span>

            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-gray-400 hover:text-white transition-colors hidden md:block"
            >
              Sign out
            </button>

            {/* Mobile menu toggle */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-1">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-[#001e3c] border-t border-[#ff8f00] px-4 py-3 space-y-2">
          {navLinks.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block text-sm font-medium text-gray-300 hover:text-white py-2"
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            className="block text-sm text-gray-400 hover:text-white py-2"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  );
}
