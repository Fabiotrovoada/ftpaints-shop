import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Cookies & Local Storage | FTPaints Trade Portal',
  description: 'What the FTPaints Trade Portal stores on your device, and why.',
};

// Update whenever the tables below change.
const LAST_UPDATED = '30 July 2026';

const COOKIES = [
  {
    name: 'next-auth.session-token',
    secureName: '__Secure-next-auth.session-token',
    purpose: 'Keeps you signed in to your trade account as you move between pages.',
    expiry: '30 days',
  },
  {
    name: 'next-auth.callback-url',
    secureName: '__Secure-next-auth.callback-url',
    purpose: 'Remembers the page you were heading to so we can return you there after you sign in.',
    expiry: 'When you close your browser',
  },
  {
    name: 'next-auth.csrf-token',
    secureName: '__Host-next-auth.csrf-token',
    purpose: 'Security. Stops another website from submitting the sign-in form on your behalf.',
    expiry: 'When you close your browser',
  },
];

const LOCAL_STORAGE = [
  { key: 'ftpaints-basket', purpose: 'The items currently in your basket, so it survives a refresh.' },
  { key: 'ftpaints-favourites', purpose: 'Products you have marked as a favourite.' },
  { key: 'ftpaints-buyagain-hidden', purpose: 'Items you have chosen to hide from your Buy Again list.' },
  { key: 'ftpaints-recently-viewed', purpose: 'The last 24 products you looked at, so they are easy to find again.' },
  { key: 'ftpaints-replenishment', purpose: 'Your replenishment list and the stock levels you have recorded against it.' },
  { key: 'ftpaints-filter-hint', purpose: 'Whether you have dismissed the tip about the shop filters.' },
  { key: 'part_<product number>', purpose: 'Your own part number saved against a product, so it shows on future orders.' },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-lg font-bold text-[#004475] mb-4">{title}</h2>
      <div className="space-y-4 text-sm text-gray-700 leading-relaxed">{children}</div>
    </section>
  );
}

export default function CookiesPage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Standalone header — this page is reachable without signing in, so it
          deliberately avoids Navbar, which expects a session and a basket. */}
      <header className="bg-[#004475] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-white font-black text-xl tracking-tight">
                FT<span style={{ color: '#c8a951' }}>Paints</span>
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-widest border border-[#c8a951] text-[#c8a951] px-1.5 py-0.5 rounded"
                style={{ letterSpacing: '0.18em' }}
              >
                Trade
              </span>
            </Link>
            <Link href="/" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">
              Back to sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold text-[#004475]">Cookies &amp; local storage</h1>
        <p className="text-sm text-gray-500 mt-2">Last updated {LAST_UPDATED}</p>

        <p className="mt-6 text-sm text-gray-700 leading-relaxed">
          This page explains everything the FTPaints Trade Portal stores on your device. We keep it short
          because there is not much to tell: the portal uses no advertising, analytics or tracking cookies.
          Everything below is needed to sign you in and to keep your basket working.
        </p>

        <div className="mt-8 space-y-6">
          <Section title="1. Strictly necessary cookies">
            <p>
              These three cookies are set by the portal itself. They cannot be switched off, because without
              them you would not be able to sign in.
            </p>
            <div className="overflow-x-auto -mx-6 sm:-mx-8 px-6 sm:px-8">
              <table className="w-full min-w-[560px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Cookie</th>
                    <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Purpose</th>
                    <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {COOKIES.map(c => (
                    <tr key={c.name} className="border-b border-gray-100 align-top">
                      <td className="py-3 pr-4">
                        <code className="text-xs font-mono text-[#004475] break-all">{c.name}</code>
                        <div className="text-[11px] text-gray-400 mt-1 break-all">
                          Named <code className="font-mono">{c.secureName}</code> over a secure connection
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{c.purpose}</td>
                      <td className="py-3 text-gray-700 whitespace-nowrap">{c.expiry}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="2. Information saved in your browser">
            <p>
              A few things are kept in your browser&apos;s local storage rather than in a cookie. This
              information stays on your device and is never sent to our servers. Clearing your browser data
              removes it.
            </p>
            <div className="overflow-x-auto -mx-6 sm:-mx-8 px-6 sm:px-8">
              <table className="w-full min-w-[480px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-2 pr-4 text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                    <th className="py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">What it holds</th>
                  </tr>
                </thead>
                <tbody>
                  {LOCAL_STORAGE.map(s => (
                    <tr key={s.key} className="border-b border-gray-100 align-top">
                      <td className="py-3 pr-4">
                        <code className="text-xs font-mono text-[#004475] break-all">{s.key}</code>
                      </td>
                      <td className="py-3 text-gray-700">{s.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="3. Card payments">
            <p>
              When you pay by card we send you to Stripe, our payment processor, at{' '}
              <code className="text-xs font-mono text-[#004475]">checkout.stripe.com</code>. Stripe sets its own
              cookies on that page to process the payment and to prevent fraud. Those cookies belong to Stripe
              and are covered by{' '}
              <a
                href="https://stripe.com/cookies-policy/legal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#004475] font-medium hover:underline"
              >
                Stripe&apos;s cookie policy
              </a>
              .
            </p>
            <p>
              No Stripe code runs on this portal, so Stripe sets nothing on your device until you are actually
              on their payment page.
            </p>
          </Section>

          <Section title="4. What we don't do">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>No advertising or conversion pixels.</li>
              <li>No analytics or website statistics tools.</li>
              <li>No session recording or behavioural profiling.</li>
              <li>Nothing shared with third parties for marketing.</li>
            </ul>
            <p>
              If that changes we will update this page and ask for your consent before anything non-essential
              is loaded.
            </p>
          </Section>

          <Section title="5. Managing this">
            <p>
              Every browser lets you view, block or delete cookies and local storage from its settings. Two
              things worth knowing before you do:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Blocking the cookies in section 1 will stop you being able to sign in.</li>
              <li>Clearing local storage will empty your basket, favourites, recently viewed and replenishment list.</li>
            </ul>
            <p>
              Any questions about this page, or about the personal data we hold on your trade account, please
              email{' '}
              <a href="mailto:sales@ftpaints.co.uk" className="text-[#004475] font-medium hover:underline">
                sales@ftpaints.co.uk
              </a>
              .
            </p>
          </Section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
