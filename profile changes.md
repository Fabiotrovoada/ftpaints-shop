# Proper Account Area for the FT Paints Trade Portal

## Context

`app/account/page.tsx` is a single 309-line client component holding the entire "account" experience: three tabs (Orders / Invoices / Statement) driven by local `useState`, a KPI row, and nothing else. There is **no profile, no settings, no password change** — the app is currently 100% read-only against Odoo `res.partner`, and there is no per-order detail view at all (`getSaleOrderLines` in `lib/odoo.ts:838` was written but never called).

The goal is a real account area: linkable sub-routes under a shared account layout, a self-serve profile and password form that writes back to Odoo, and an overview dashboard that surfaces credit/terms data the app already fetches but only shows as a small navbar badge.

Two authorization defects found while exploring are fixed as part of this work (confirmed in scope with the user): the PDF routes authenticate but never authorize, and the orders list is scoped inconsistently with Buy Again.

**Backend reality that shapes everything below:** Odoo 16 over JSON-RPC (`lib/odoo.ts`). All RPC runs on a cached **admin** web session (`getWebSession`, `lib/odoo.ts:115`) — the logged-in customer's `uid` is only used to resolve their `partner_id`. Authorization is therefore purely application-level and must be enforced in every new route handler. The user's password is never stored (`lib/auth.ts:14-39`), which is why the password form requires the current password to be re-entered.

**Framework:** Next.js 16.2.1 / React 19. `params` and `searchParams` are Promises and must be awaited (see `app/api/account/orders/[id]/pdf/route.ts` for the existing correct pattern). Per `AGENTS.md`, check `node_modules/next/dist/docs/` before using an unfamiliar API.

---

## Decisions taken

| Question | Decision |
|---|---|
| Sections | Overview dashboard, Profile + password, Orders / Invoices / Statement as real routes |
| Address book | **Out of scope** — checkout keeps flattening the alternate address into the order `note` |
| Password | Re-enter current password → verify against Odoo → admin RPC write |
| Editable fields | Name + phone/mobile only. Email is `res.users.login`; editing it would lock the user out |
| Hardening | PDF ownership checks + orders scoped to the commercial partner |

---

## Route structure

```
app/account/layout.tsx              NEW  Navbar + sidebar nav + Footer for the whole subtree
app/account/page.tsx                REWRITE  Overview dashboard
app/account/orders/page.tsx         NEW  Orders list (moved out of the tab)
app/account/orders/[id]/page.tsx    NEW  Order detail with line items
app/account/invoices/page.tsx       NEW  Invoices list (moved out of the tab)
app/account/statement/page.tsx      NEW  Ledger with date-range filter
app/account/profile/page.tsx        NEW  Profile form + password form
app/account/pay/page.tsx            EDIT  Strip its own <Navbar/><Footer/> (layout provides them)
```

`/account/*` is already covered by the `middleware.ts` matcher, so no auth-routing change is needed.

**Important:** every existing page renders its own `<Navbar />` / `<Footer />`. Once `app/account/layout.tsx` renders them, `app/account/pay/page.tsx` **must** have its own removed or they double up.

---

## Shared foundations (build these first)

### 1. `types/account.ts` — NEW

`Order` and `Invoice` are currently duplicated inline in `app/account/page.tsx:8,16` and `app/account/pay/page.tsx:10`. Create one module exporting `Order`, `OrderLine`, `Invoice`, `Payment`, `StatementRow`, `Profile`, `CreditInfo`, and update both existing files to import from it.

### 2. `lib/odoo.ts` — partner resolution

Every account route repeats `getPartnerByUid(uid, '')` → `.partner_id[0]`. Add one helper and reuse it everywhere:

```ts
export async function resolveAccountPartner(uid: number):
  Promise<{ partnerId: number | null; commercialId: number | null }>
```

Built on the existing `getPartnerByUid` (l.191) and `getCommercialPartnerId` (l.877) — **export `getCommercialPartnerId`, it is currently module-private.** Cache per uid via the existing `lib/cache.ts` with a new `TTL.PARTNER` (~300s); note `TTL.ORDERS`/`TTL.INVOICES` are declared but unused, so wiring the orders/invoices routes through the cache is a cheap win here too.

### 3. New Odoo helpers in `lib/odoo.ts`

- `updatePartnerProfile(partnerId, { name?, phone?, mobile? })` — `res.partner.write`. Whitelist the fields explicitly; never spread caller input into the write.
- `changeUserPassword(uid, newPassword)` — `res.users.write([[uid]], { password })`. Odoo's `res.users.write` hashes the password itself.
- `getPartnerProfile(partnerId)` — `res.partner.read` of `name, email, phone, mobile, street, street2, city, zip, country_id, vat, commercial_partner_id`.
- `getCustomerPayments(commercialId, since?)` — `account.payment.search_read`, domain `[['partner_id','child_of',commercialId],['payment_type','=','inbound'],['state','=','posted']]`, fields `id, name, date, amount, ref`. This is what turns the Statement page into a real ledger rather than an invoice list.
- `getInvoices` gains an optional date range (`invoice_date >= / <=`) and a `limit` override; today it is hard-capped at 50 (l.1085), which silently truncates a statement.

All follow the file's existing `try { ... } catch { return [] }` convention.

---

## API routes

### `app/api/account/profile/route.ts` — NEW

- `GET` → `{ name, email, phone, mobile, company, address, vat, creditLimit, creditUsed, paymentTermName }`. Reuse `getPartnerInfo` (l.200) so the overview page can get profile + credit in one call.
- `PATCH` → body `{ name?, phone?, mobile? }`. Validate server-side (name non-empty ≤ 128 chars; phone as a loose `[\d\s+()\-]{6,32}` check), resolve `partnerId` from the **session**, never from the body, then `updatePartnerProfile`. Return the updated record.

### `app/api/account/password/route.ts` — NEW

`POST { currentPassword, newPassword }`:

1. `getServerSession` → 401 if absent.
2. Verify current password: `authenticate(session.user.email, currentPassword)` (`lib/odoo.ts:169`). Reject if it returns `false` **or** if `result.user_id !== session.user.uid` — the second check matters because `authenticate` resolves the login itself.
3. Validate `newPassword` (min 8 chars, differs from current).
4. `changeUserPassword(session.user.uid, newPassword)`.
5. Return `{ ok: true }`. The NextAuth JWT does not embed the password, so the session stays valid — no forced sign-out.

Add a small in-memory attempt limiter (5 failures / 15 min, keyed by uid) using the same `Map` idiom as `lib/cache.ts`. This endpoint is a password oracle without it.

### `app/api/account/orders/[id]/route.ts` — NEW

`GET` → `{ order, lines }`. Ownership check first: `sale.order.search_count` with `[['id','=',orderId],['partner_id','child_of',commercialId]]` → 404 if 0. Then `getSaleOrders`-style read plus the existing **`getSaleOrderLines`** (l.838, currently dead code — reuse it, don't write a new one).

### `app/api/account/statement/route.ts` — NEW

`GET ?from=&to=` → `{ openingBalance, rows, totals }` where `rows` merges invoices and payments sorted by date with a running balance. Reuses the extended `getInvoices` and the new `getCustomerPayments`.

### `app/api/account/statement/pdf/route.ts` — EDIT

Accept the same `?from=&to=` params and use the same row-building function so the printable version matches what's on screen. (Note: despite the `/pdf` path this route returns **HTML** for browser print-to-PDF — keep it that way, don't add a PDF dependency.)

### Hardening — `orders/[id]/pdf/route.ts` and `invoices/[id]/pdf/route.ts`

Both currently fetch any id the caller asks for. Add an ownership check before the Odoo report fetch, using a shared helper so the two stay in sync:

```ts
// lib/odoo.ts
export async function assertOwnsRecord(
  model: 'sale.order' | 'account.move', id: number, commercialId: number
): Promise<boolean>   // search_count with partner_id child_of commercialId
```

Return 404 (not 403) on failure so the endpoint does not confirm the id exists. Apply the check on the `raw=1` branch **and** before returning the HTML shell.

### Hardening — orders scoped to the commercial partner

`getSaleOrders` (l.824) filters `['partner_id','=',partnerId]` while `getPreviouslyPurchasedProducts` (l.907) resolves to `commercial_partner_id` and uses `child_of`. A child contact therefore sees a Buy Again list built from orders their Orders tab does not show. Change the domain to `[['partner_id','child_of',commercialId]]` and pass `commercialId` from `resolveAccountPartner`.

> **Flagged, not changed:** `getInvoices` (l.1085) still filters `partner_id` exactly. After this change orders are company-scoped and invoices are contact-scoped, so the overview KPIs mix scopes for child-contact logins. I recommend scoping invoices the same way, but it wasn't in the agreed scope — call it out after implementation and change it only on your say-so. The PDF ownership checks deliberately use the **commercial** scope so no user loses access to a PDF they can currently see.

---

## Pages

All pages stay `'use client'` with `useSession()` + `useEffect` + `fetch` — the established convention (there is no SWR/react-query, no server actions). Reuse the global classes in `app/globals.css`: `.card`, `.btn-primary`, `.btn-accent`, `.btn-outline`, and the brand hexes `#004475` / `#ff8f00`.

### `app/account/layout.tsx`

`<Navbar />` + a two-column shell (`max-w-6xl`): sidebar nav on `lg:`, horizontally-scrolling pill row on mobile (the `flex gap-1 overflow-x-auto pb-1` pattern from `app/shop/page.tsx:280`). Nav items: Overview, Orders, Invoices, Statement, Profile, with an **unpaid-invoice count badge** on Invoices. Active state from `usePathname()` — `bg-white text-[#004475] shadow-sm` active, `text-gray-500 hover:text-gray-700` inactive, matching today's tab styling. Then `{children}` and `<Footer />`.

Keep the layout itself thin; each page fetches its own data. Do not lift a shared data provider into the layout — that fights the per-page fetch convention used everywhere else in this codebase.

### `app/account/page.tsx` (Overview) — rewrite

- Keeps the `?payment=success|cancelled` banner logic from the current file (lines 46-49, 80-89), including the `<Suspense>` wrapper that `useSearchParams` requires.
- KPI row, reusing the existing stat-tile markup (lines 105-130): This Month spend, Total Orders, Outstanding, Overdue.
- **New credit panel** from `/api/account/credit` (route already exists, currently only feeding the navbar `CreditBadge`): limit, used, remaining as a progress bar, payment terms name, and a red "ACCOUNT ON STOP" state when `onStop`.
- Overdue banner + "Pay Outstanding" CTA → `/account/pay` (carried over from lines 132-146).
- Recent activity: 5 most recent orders and outstanding invoices, each linking to its full page.

### `app/account/orders/page.tsx`

The existing orders list (lines 165-201) plus a search-by-reference box and a state filter (All / Quotations / Confirmed / Complete / Cancelled) reusing the current state→label/colour map. Rows link to `/account/orders/[id]`; "View Order PDF" stays.

### `app/account/orders/[id]/page.tsx` — NEW

Header (reference, date, state pill, total), line-item table styled like `app/replenishment/page.tsx:182` (the only real table in the app), and actions: View PDF, Pay (if an invoice exists), and **Reorder** — push every line into `useBasket` (`lib/basketStore.ts`) and route to `/basket`. Reorder is the highest-value part of this page and reuses existing store code.

### `app/account/invoices/page.tsx`

Existing invoice cards (lines 202-256) plus status filter (All / Unpaid / Overdue / Paid) and a date-range filter. Keeps "Pay N outstanding" → `/account/pay`.

### `app/account/statement/page.tsx`

Date-range selector (This month / Last 3 months / This year / Custom) → `/api/account/statement`. Renders opening balance, the merged invoice/payment ledger with a running balance, closing balance, and an aged-debt summary (Current / 30 / 60 / 90+ days, bucketed from `invoice_date_due`). "Print statement" opens the existing `/api/account/statement/pdf` with the same range.

### `app/account/profile/page.tsx` — NEW

Two `.card` sections following the login-form markup in `app/page.tsx` (`useState` + `fetch`, inline `bg-red-50 border-red-200` error box, `bg-green-50` success box — there is no toast library):

1. **Your details** — Name, Phone, Mobile editable; Email shown disabled with a note that it is the login and must be changed by FT Paints; below it a read-only block showing company, billing address, VAT and payment terms with a "Contact us to update" note and a `mailto:sales@ftpaints.co.uk` link (same escape hatch the login page uses). Save → `PATCH /api/account/profile`, then `useSession().update({ name })` so the navbar reflects the new name immediately.
2. **Change password** — Current / New / Confirm, a live requirements hint, client-side match check, then `POST /api/account/password`. Buttons use the house `disabled:opacity-60` + label-swap idiom (`{saving ? 'Saving…' : 'Save changes'}`).

**`lib/auth.ts` change required for the name refresh:** the `jwt` callback (l.43) must handle the update trigger, otherwise `session.update()` is a no-op:

```ts
async jwt({ token, user, trigger, session }) {
  if (user) { /* existing */ }
  if (trigger === 'update' && session?.name) token.name = session.name;
  return token;
}
```

### `components/Navbar.tsx`

Point the account link at `/account` (unchanged) and add a small dropdown or secondary link to `/account/profile`. Minimal edit.

---

## Demo mode

`DEMO_MODE=true` short-circuits the orders/invoices/credit routes to `lib/demoData.ts`. Add matching branches to the new `GET /api/account/profile`, `/api/account/orders/[id]`, and `/api/account/statement` (a `DEMO_PROFILE` and `DEMO_PAYMENTS` in `lib/demoData.ts`), and make the write endpoints (`PATCH /profile`, `POST /password`) return a simulated success without touching Odoo when `DEMO_MODE` is on. `app/api/account/address/route.ts` is missing this branch today — worth adding while nearby.

---

## Verification

1. `npx tsc --noEmit` — no type errors (no test runner exists in this repo).
2. `npm run dev`, sign in as a trade account.
3. **Navigation** — every sidebar item loads, deep links work on refresh, active state is correct, mobile pill row scrolls, and `/account/pay` shows exactly one navbar and one footer.
4. **Profile** — change phone → save → reload → persisted; confirm in Odoo that `res.partner` shows the new value. Change name → navbar display name updates without a re-login.
5. **Password** — wrong current password is rejected with a clear message and does **not** change anything; 6 rapid wrong attempts get rate-limited; a valid change succeeds, the session survives, and signing out then back in with the **new** password works. Verify the old password no longer works.
6. **Order detail** — open an order, confirm the line items match the Odoo record and the PDF; Reorder fills the basket with the right products and quantities.
7. **Statement** — pick a range; opening + movements = closing; totals reconcile against the Invoices page for the same range; the print view matches the screen.
8. **Ownership checks (the security fix)** — while signed in as customer A, request `/api/account/orders/<an order id belonging to B>/pdf` and the same for an invoice. Both must return 404. Confirm A's own PDFs still open. Also test with a **child contact** login to confirm they can still open the parent company's documents.
9. **Orders scoping** — sign in as a child contact and confirm the Orders page now shows the company's orders, consistent with the Buy Again list.
10. `DEMO_MODE=true npm run dev` — every account page renders without hitting Odoo.

## Out of scope

Address book / multiple delivery addresses; email change; `/api/debug-auth` removal (an unauthenticated credential-testing oracle that also leaks env config — recommend deleting it separately); the `.env.local` / `.env.production` files with live Odoo admin and Stripe keys committed in the working tree.
