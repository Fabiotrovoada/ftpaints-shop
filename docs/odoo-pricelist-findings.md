# Odoo pricing findings — things to decide or fix in Odoo, not in code

Captured from the live database (Odoo 18.0+e) on 31 July 2026 while fixing the portal's pricing.

> **This supersedes an earlier version of this document that said the Bronze/Silver/Gold tiers were
> no-ops and recommended deleting rules 6810/6811/6812. That was wrong — see §1. Those rules must be
> kept.**

## 1. Pricing runs on a custom engine, and all three channels share it

`ft_paints_pricelist` (TechUltra Solutions, v18.0.0.0.4) adds `min_cost` and `max_cost` to
`product.pricelist.item`, plus a non-stored `compute_price` field on `product.template`, and
**patches Odoo's core pricing engine**. The website, the mobile app and the trade portal therefore
all resolve a price the same way:

1. **A negotiated fixed rule** — on the variant first, then the template. Never cost-band gated.
2. Otherwise **the tier's cost-band ladder**, chosen by the product's cost.
3. Otherwise the plain sales price.

A stock Odoo, evaluating `applied_on, min_quantity desc, categ_id desc, id desc` and taking the first
match, would stop at each tier's `0 % discount on sales price` rule and always return the sales
price. That is *not* what happens here — the cost bands are what decide.

The tier rules are **cost-band markup ladders**:

| Product cost | Bronze 🥉 | Silver 🥈 | Gold 🥇 |
|---|---|---|---|
| £0.03 – 3 | 200 % | 150 % | 120 % |
| £3.01 – 10 | 135 % | 100 % | 75 % |
| £10.01 – 25 | 90 % | 75 % | 55 % |
| £25.01 – 60 | 55 % | 50 % | 30 % |
| £60 – 150 | 45 % | 35 % | 25 % |
| £150 + | 35 % | 25 % | 20 % |

Example — **3.5L B89 Octobase System Deep Black**, cost £80.61, sales price £79.74:
Silver's £60–150 band gives `80.61 × 1.35 = £108.82`. Standard Odoo would say £79.74.

### The `0 %` rules are the zero-cost fallback — do not delete them

Rules **6812** (Bronze), **6811** (Silver) and **6810** (Gold) carry `min_cost = max_cost = 0`, so
they match only a product whose cost is £0. That is what stops the 207 sellable zero-cost products
from pricing at £0.00 through a cost-based rule. Deleting them would break those products.

### Confirmed against the live site

Fetching `get_combination_info` from www.ftpaints.co.uk anonymously (website default pricelist is
Silver) returns the band price on every product checked — B89 at **£108.82**, Silver's 35 % band, not
its £79.74 sales price. The portal's engine reproduces the website exactly on 5/5 products and the
Mobile API on 500/500.

229 real `sale.order.line` records from Bronze/Silver/Gold customers, costed products only:

| `price_unit` matches | share |
|---|---|
| **cost-band price** | **67 %** |
| the plain sales price | **1 %** |
| neither — manual override or negotiated | 32 % |

### Who is on which list

66 portal logins:

| Pricelist | Users |
|---|---|
| Bronze Partner 🥉 | 55 |
| Silver Partner 🥈 | 3 |
| Gold Partner 🥇 | 3 |
| FT-Partners ✨ NEW | 2 |
| Per-customer lists | 3 |

## 2. `compute_price` disagrees with its own Mobile API on one product

For B89 (template 13372):

- `product.template.compute_price` → **£100.7625** (cost × 1.25 — the £150+ band)
- `/api/v1/product_template/13372` → **£108.8235** (cost × 1.35 — the correct £60–150 band)

Reproducible across repeated reads as the same user. Every other product sampled agreed exactly.
B89 is also the only sampled product whose **cost (£80.61) exceeds its sales price (£79.74)**, which
suggests a band-boundary comparison being made against different fields in the two code paths.

The portal uses the Mobile API value, which is the correct one. Worth reporting to TechUltra anyway.

## 3. Product data that distorts cost-based pricing

Because every tier price is derived from **cost**, cost errors are price errors.

| Problem | Count |
|---|---|
| Sellable products with `standard_price` (cost) = 0 | 207 |
| Sellable products with `list_price` ≤ 0 | 182 |
| Sellable products with a **negative** `list_price` | 1 |

The negative one is worth correcting regardless:

- **Caslek MS Lacquer** (template 128935) — sales price **−£3.33**

A product whose cost exceeds its sales price (B89 is one: £80.61 vs £79.74) is not necessarily wrong,
but it does mean the band price lands well above the shelf price. Worth reviewing the cost data if
that is unexpected.

## 4. FT-Partners ✨ A.P.S is a very large list

| Pricelist | Rules |
|---|---|
| FT-Partners ✨ A.P.S | **747** |
| Gold Partner 🥇 | 262 |
| Price List for Mirage Body Shop | 172 |
| Price List for The Paintshop Coventry | 163 |
| Price List for WIZARD OF BODS | 162 |
| FT-Partners ✨ | 159 |

The portal used to read at most 500 rules per list, silently dropping 247 of A.P.S's. The limit is
now 2000. No portal login is on that list today, but worth remembering if one ever grows past 2000.

Negotiated fixed prices are **not** cost-band gated — 2,052 product/variant fixed rules exist, 1,857
of them on products that do have a cost, and none carries a band. 87 real order lines were billed at
exactly their fixed price. The portal follows that behaviour.

## 5. Product template / variant id collisions

Not a pricing issue, but it came out of the same work.

`sale.order.line.product_id` must be a `product.product` (a variant). The portal's product cards used
to put the `product.template` id in the basket instead. The two id sequences overlap: **14,904 of
32,704 sellable template ids (45.6 %) also exist as a valid variant id**, usually belonging to an
unrelated product. For example basket id `85062` means "ISOPON METALIK NO.2 KIT 1.1L" as a template
but "ECLIPSE - 2K CLEAR (1LT)" as a variant.

The portal now adds variant ids and cross-checks the product name before booking a line, refusing
rather than guessing. Nothing needs doing in Odoo — but if any past quotation lists a product the
customer says they did not order, this is the likely explanation.
