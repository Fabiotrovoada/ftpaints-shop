# Odoo pricelist findings — things to fix in Odoo, not in code

Captured from the live database (Odoo 18.0+e) on 31 July 2026, while fixing the portal's
pricelist engine. The portal now reproduces Odoo's pricing exactly, which means **everything below
changes what customers pay the moment it is changed in Odoo**. None of it can or should be worked
around in the portal.

## 1. The Bronze / Silver / Gold tiers are currently no-ops

Odoo evaluates pricelist rules in the order `applied_on, min_quantity desc, categ_id desc, id desc`
and applies the **first** one that matches. Each tier has seven competing global rules, and because
the `0 % discount on sales price` rule is the newest on each list, it always wins — the cost-markup
rules beneath it are never reached.

**Net effect today: for any product without its own rule, Bronze, Silver and Gold all pay the plain
public list price.** The three tiers are indistinguishable except where a product- or variant-level
rule exists (Bronze has none at all).

| Pricelist | Rule id | Rule | Reached? |
|---|---|---|---|
| **Bronze Partner 🥉** (id 1) | 6812 | 0 % discount on sales price | **wins** |
| | 1237 | 35 % markup on product cost | never |
| | 1236 | 45 % markup on product cost | never |
| | 1235 | 55 % markup on product cost | never |
| | 1234 | 90 % markup on product cost | never |
| | 1233 | 135 % markup on product cost | never |
| | 1232 | 200 % markup on product cost | never |
| **Silver Partner 🥈** (id 4) | 6811 | 0 % discount on sales price | **wins** |
| | 6809 | 25 % markup on product cost | never |
| | 6808 | 35 % markup on product cost | never |
| | 6807 | 50 % markup on product cost | never |
| | 6806 | 75 % markup on product cost | never |
| | 6805 | 100 % markup on product cost | never |
| | 6804 | 150 % markup on product cost | never |
| **Gold Partner 🥇** (id 5) | 6810 | 0 % discount on sales price | **wins** |
| | 1249 | 120 % markup on product cost | never |
| | 1247 | 20 % markup on product cost | never |
| | 1246 | 25 % markup on product cost | never |
| | 1245 | 30 % markup on product cost | never |
| | 1244 | 55 % markup on product cost | never |
| | 1243 | 75 % markup on product cost | never |

Note the six markup rules per tier cannot all apply anyway — they are all global with no minimum
quantity, so even without the `0 %` rule only one of them would ever be used. They look like the
remains of an intended per-category structure.

**If the tiers are supposed to differ**, either delete rules 6810/6811/6812 and give each tier a
single markup rule, or scope the markups to product categories (`Apply On = Product Category`) so
they stop competing with each other. Whatever you choose, the portal will follow automatically.

### Who this affects

66 portal logins, by assigned pricelist:

| Pricelist | Users |
|---|---|
| Bronze Partner 🥉 | 54 |
| Silver Partner 🥈 | 3 |
| Gold Partner 🥇 | 3 |
| FT-Partners ✨ NEW | 3 |
| Per-customer lists | 3 |

## 2. Product data that breaks cost-based rules

| Problem | Count |
|---|---|
| Sellable templates with `standard_price` (cost) = 0 | 207 |
| Sellable templates with `list_price` ≤ 0 | 182 |
| Sellable templates with a **negative** `list_price` | 1 |

A cost-based rule against a zero-cost product computes to **£0.00**. Odoo has no guard against this;
the portal now refuses to show a £0.00 price and falls back to the list price, logging a warning. So
these products are safe in the portal but would still price at £0 in Odoo itself if a cost-based rule
were ever reached.

The negative one is worth correcting regardless:

- **Caslek MS Lacquer** (template id 128935) — list price **£-3.33**

## 3. One pricelist was over the portal's old fetch limit

| Pricelist | Rules |
|---|---|
| FT-Partners ✨ A.P.S | **747** |
| Gold Partner 🥇 | 262 |
| Price List for Mirage Body Shop | 172 |
| Price List for The Paintshop Coventry | 163 |
| Price List for WIZARD OF BODS | 162 |
| FT-Partners ✨ | 159 |

The portal used to read at most 500 rules per list, silently dropping 247 of A.P.S's. No portal login
is on that list today, so nothing was mispriced by it. The limit is now 2000 — worth remembering if a
list ever grows past that.

## 4. Product template / variant id collisions

Not a pricing issue, but it came out of the same work and is worth knowing about.

`sale.order.line.product_id` must be a `product.product` (a variant). The portal's product cards used
to put the `product.template` id in the basket instead. The two id sequences overlap: **14,904 of
32,704 sellable template ids (45.6%) also exist as a valid variant id**, usually belonging to an
unrelated product. For example basket id `85062` means "ISOPON METALIK NO.2 KIT 1.1L" as a template
but "ECLIPSE - 2K CLEAR (1LT)" as a variant.

The portal now adds variant ids and cross-checks the product name before booking a line, refusing
rather than guessing. Nothing needs doing in Odoo — but if any past quotation lists a product the
customer says they did not order, this is the likely explanation.
