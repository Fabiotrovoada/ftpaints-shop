'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import type { Invoice } from '@/types/account';

const NAV = [
  { href: '/account', label: 'Overview', icon: '📊' },
  { href: '/account/orders', label: 'Orders', icon: '📦' },
  { href: '/account/invoices', label: 'Invoices', icon: '🧾' },
  { href: '/account/statement', label: 'Statement', icon: '📄' },
  { href: '/account/profile', label: 'Profile', icon: '👤' },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [unpaid, setUnpaid] = useState(0);

  // Badge only — each page still fetches its own data. Lifting a shared
  // provider in here would fight the per-page fetch convention used everywhere
  // else in this app.
  useEffect(() => {
    if (!session) return;
    fetch('/api/account/invoices')
      .then(r => r.json())
      .then(d => setUnpaid(((d.invoices || []) as Invoice[]).filter(i => i.amount_residual > 0).length))
      .catch(() => {});
  }, [session]);

  // /account must match exactly or Overview stays lit on every sub-route.
  const isActive = (href: string) =>
    href === '/account' ? pathname === '/account' : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="lg:flex lg:gap-8">
          {/* Mobile: scrolling pill row. Desktop: sidebar. */}
          <nav className="lg:w-56 lg:flex-shrink-0 mb-6 lg:mb-0">
            <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
              {NAV.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 lg:w-full ${
                      active
                        ? 'bg-white text-[#004475] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
                    }`}
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                    {item.href === '/account/invoices' && unpaid > 0 && (
                      <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        {unpaid}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
