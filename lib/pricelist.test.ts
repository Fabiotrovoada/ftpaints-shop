/**
 * Fixtures are the real Bronze/Silver/Gold rules, captured from the live database
 * in Odoo's own `_order` (PRICELIST_ITEM_ORDER). Order matters: the engine takes
 * the first applicable rule and never re-sorts.
 *
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyPricelist, findPricelistRule, type PricelistInfo, type PricelistItem } from './pricelist.ts';

const mk = (o: Partial<PricelistItem> & { id: number }): PricelistItem => ({
  compute_price: 'formula', fixed_price: 0, percent_price: 0, price_discount: 0,
  price_surcharge: 0, price_round: 0, price_min_margin: 0, price_max_margin: 0,
  applied_on: '3_global', product_tmpl_id: false, product_id: false, categ_id: false,
  base: 'standard_price', base_pricelist_id: false, min_quantity: 0,
  min_cost: 0, max_cost: 0, date_start: false, date_end: false, ...o,
});

/** Each tier's "0 % discount on sales price" — the zero-cost fallback. */
const zeroCostFallback = (id: number) =>
  mk({ id, compute_price: 'percentage', base: 'list_price', min_cost: 0, max_cost: 0 });

const list = (id: number, name: string, items: PricelistItem[]): PricelistInfo =>
  ({ id, name, currency: 'GBP', items });

const BRONZE = list(1, 'Bronze Partner', [
  zeroCostFallback(6812),
  mk({ id: 1237, price_discount: -35, min_cost: 150.01, max_cost: 999999999 }),
  mk({ id: 1236, price_discount: -45, min_cost: 60.01, max_cost: 150 }),
  mk({ id: 1235, price_discount: -55, min_cost: 25.01, max_cost: 60 }),
  mk({ id: 1234, price_discount: -90, min_cost: 10.01, max_cost: 25 }),
  mk({ id: 1233, price_discount: -135, min_cost: 3.01, max_cost: 10 }),
  mk({ id: 1232, price_discount: -200, min_cost: 0.03, max_cost: 3 }),
]);

const SILVER = list(4, 'Silver Partner', [
  zeroCostFallback(6811),
  mk({ id: 6809, price_discount: -25, min_cost: 150, max_cost: 99999999 }),
  mk({ id: 6808, price_discount: -35, min_cost: 60, max_cost: 150 }),
  mk({ id: 6807, price_discount: -50, min_cost: 25.01, max_cost: 60 }),
  mk({ id: 6806, price_discount: -75, min_cost: 10.01, max_cost: 25 }),
  mk({ id: 6805, price_discount: -100, min_cost: 3.01, max_cost: 10 }),
  mk({ id: 6804, price_discount: -150, min_cost: 0.03, max_cost: 3 }),
]);

const GOLD = list(5, 'Gold Partner', [
  zeroCostFallback(6810),
  mk({ id: 1249, price_discount: -120, min_cost: 0.03, max_cost: 3 }),
  mk({ id: 1247, price_discount: -20, min_cost: 150.01, max_cost: 9999999999 }),
  mk({ id: 1246, price_discount: -25, min_cost: 60.01, max_cost: 150 }),
  mk({ id: 1245, price_discount: -30, min_cost: 25.01, max_cost: 60 }),
  mk({ id: 1244, price_discount: -55, min_cost: 10.01, max_cost: 25 }),
  mk({ id: 1243, price_discount: -75, min_cost: 3.01, max_cost: 10 }),
]);

const approx = (actual: number, expected: number, msg: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, want ${expected}`);

// B89 Octobase, template/variant 13372 — the product that started all of this.
const B89 = { tmplId: 13372, variantId: 13372, listPrice: 79.74, costPrice: 80.61 };

test('Silver ladder reproduces the live Mobile API prices', () => {
  // Every figure here was read back from /api/v1/product_template/<id>.
  const cases: Array<[number, number, string]> = [
    [0.80, 2.00, '1 Litre Lever Lid Can'],
    [8.61, 17.22, 'PROXL Plasticolour Black'],
    [24.25, 42.4375, 'Standard Thinners 25 Tin'],
    [46.80, 70.20, '2K Premium Thinners 25'],
    [80.61, 108.8235, 'B89 Octobase 3.5L'],
  ];
  for (const [cost, expected, name] of cases) {
    const { price } = applyPricelist(SILVER, { tmplId: 1, listPrice: 999, costPrice: cost });
    approx(price, expected, name);
  }
});

test('each tier prices B89 from its own ladder', () => {
  approx(applyPricelist(BRONZE, B89).price, 116.8845, 'Bronze 45 %');
  approx(applyPricelist(SILVER, B89).price, 108.8235, 'Silver 35 %');
  approx(applyPricelist(GOLD, B89).price, 100.7625, 'Gold 25 %');
});

test('a cost outside every band falls through to the zero-cost rule, not to £0', () => {
  // 207 sellable products have no cost. A cost-based rule would price them at
  // £0.00; the "0 % discount on sales price" rule is what catches them.
  const { price, rule } = applyPricelist(SILVER, {
    tmplId: 1, listPrice: 89.90, costPrice: 0,
  });
  assert.equal(rule?.id, 6811, 'the zero-cost fallback should win');
  approx(price, 89.90, 'zero-cost product keeps its list price');
});

test('the zero-cost rule does NOT shadow the ladder for a costed product', () => {
  // It sorts first by id, so gating it on the cost band is the whole fix.
  const rule = findPricelistRule(SILVER, { tmplId: 1, listPrice: 999, costPrice: 80.61 });
  assert.equal(rule?.id, 6808, 'the £60–150 band rule should win, not rule 6811');
});

test('band edges resolve the way Odoo ordered them', () => {
  // Silver's bands touch at 150: rule 6809 is 150+, rule 6808 is 60-150. Higher
  // id sorts first, so 6809 takes the boundary.
  assert.equal(findPricelistRule(SILVER, { tmplId: 1, listPrice: 9, costPrice: 150 })?.id, 6809);
  approx(applyPricelist(SILVER, { tmplId: 1, listPrice: 9, costPrice: 150 }).price, 187.5, 'at 150');
  // Bronze leaves a gap instead: 1236 ends at 150, 1237 starts at 150.01.
  assert.equal(findPricelistRule(BRONZE, { tmplId: 1, listPrice: 9, costPrice: 150 })?.id, 1236);
  assert.equal(findPricelistRule(BRONZE, { tmplId: 1, listPrice: 9, costPrice: 150.01 })?.id, 1237);
  // Below the lowest band there is no markup rule at all.
  assert.equal(findPricelistRule(BRONZE, { tmplId: 1, listPrice: 9, costPrice: 0.02 }), null);
});

test('negotiated fixed prices are never cost-band gated', () => {
  // 1,857 fixed rules sit on products that do have a cost and not one carries a
  // band; 87 real order lines were billed at exactly their fixed price. Gating
  // them would silently delete every negotiated price in the database.
  const ftPartners = list(47, 'FT-Partners A.P.S', [
    mk({ id: 6954, compute_price: 'fixed', base: 'list_price', applied_on: '1_product',
         product_tmpl_id: [13372, 'B89'], fixed_price: 86.54 }),
    mk({ id: 9001, price_discount: -35, min_cost: 60, max_cost: 150 }),
  ]);
  const { price, rule } = applyPricelist(ftPartners, B89);
  assert.equal(rule?.id, 6954);
  approx(price, 86.54, 'fixed rule wins over the ladder');
});

test('a variant rule beats a template rule for the same product', () => {
  const pl = list(4, 'Silver', [
    mk({ id: 6912, compute_price: 'fixed', base: 'list_price', applied_on: '0_product_variant',
         product_id: [107304, 'Octobase touch-up'], product_tmpl_id: [103597, 'Octobase'], fixed_price: 8 }),
    mk({ id: 6800, compute_price: 'fixed', base: 'list_price', applied_on: '1_product',
         product_tmpl_id: [103597, 'Octobase'], fixed_price: 25 }),
    ...SILVER.items,
  ]);
  approx(applyPricelist(pl, { tmplId: 103597, variantId: 107304, listPrice: 12, costPrice: 0 }).price, 8, 'variant');
  // A different variant of the same template falls through to the template rule.
  approx(applyPricelist(pl, { tmplId: 103597, variantId: 107306, listPrice: 12, costPrice: 0 }).price, 25, 'template');
});

test('a variant-only pricelist needs the sole variant id to price a grid card', () => {
  // FT-Partners ✨ NEW is 138 variant rules + 3 product rules and NO cost ladder.
  // Grid cards used to be priced with variantId null, so nothing matched and the
  // public base price survived: £108.82 on /shop vs £79.74 on /shop/13372.
  const ftpNew = list(50, 'FT-Partners NEW', [
    mk({ id: 8281, compute_price: 'fixed', base: 'list_price', applied_on: '0_product_variant',
         product_id: [13372, 'B89'], product_tmpl_id: [13372, 'B89'], fixed_price: 79.74 }),
  ]);
  const base = { tmplId: 13372, listPrice: 108.8235, costPrice: 80.61 };
  approx(applyPricelist(ftpNew, { ...base, variantId: 13372 }).price, 79.74, 'with the variant id');
  // Without it there is genuinely no applicable rule — the caller must supply it.
  assert.equal(findPricelistRule(ftpNew, { ...base, variantId: null }), null);
});

test('expired and future rules are skipped', () => {
  const pl = list(9, 'Seasonal', [
    mk({ id: 10, compute_price: 'fixed', base: 'list_price', applied_on: '1_product',
         product_tmpl_id: [13372, 'B89'], fixed_price: 5, date_end: '2020-01-01 00:00:00' }),
    ...SILVER.items,
  ]);
  const { rule } = applyPricelist(pl, B89);
  assert.equal(rule?.id, 6808, 'the expired rule must not win');
});

test('quantity thresholds still apply', () => {
  const pl = list(9, 'Bulk', [
    mk({ id: 20, compute_price: 'fixed', base: 'list_price', applied_on: '1_product',
         product_tmpl_id: [13372, 'B89'], fixed_price: 70, min_quantity: 10 }),
    ...SILVER.items,
  ]);
  approx(applyPricelist(pl, { ...B89, qty: 1 }).price, 108.8235, 'below threshold');
  approx(applyPricelist(pl, { ...B89, qty: 10 }).price, 70, 'at threshold');
});

test('a rule that computes to zero or less never wins over a real list price', () => {
  const pl = list(9, 'Broken', [
    mk({ id: 30, compute_price: 'fixed', base: 'list_price', applied_on: '1_product',
         product_tmpl_id: [13372, 'B89'], fixed_price: 0 }),
  ]);
  const { price, rule } = applyPricelist(pl, B89);
  approx(price, 79.74, 'falls back to the list price');
  assert.equal(rule, null, 'and reports that nothing applied');
});
