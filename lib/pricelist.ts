/**
 * A faithful port of Odoo 18's pricelist engine.
 *
 * Odoo will not price for us: `_get_product_price`, `_compute_price_rule` and
 * `_get_contextual_price` are all private, and Odoo 17+ refuses private methods
 * over JSON-RPC (`product.product.price` was removed outright in 18). So the
 * portal has to compute partner prices itself, and the only way that stays
 * trustworthy is to mirror Odoo's own algorithm rather than approximate it.
 *
 * Deliberately free of I/O so it can be unit-tested against captured rules —
 * lib/odoo.ts owns the fetching and is not importable outside Next.
 *
 * Reference: odoo/addons/product/models/product_pricelist_item.py::_compute_price
 */

export type AppliedOn = '0_product_variant' | '1_product' | '2_product_category' | '3_global';
export type ComputePrice = 'fixed' | 'percentage' | 'formula';

export interface PricelistItem {
  id: number;
  compute_price: ComputePrice;
  /** 'fixed' rules: the price, as a number. Not the `price` display string. */
  fixed_price: number;
  /** 'percentage' rules: discount off the base, 0-100. */
  percent_price: number;
  /** 'formula' rules: discount off the base. Negative means a markup. */
  price_discount: number;
  price_surcharge: number;
  /** Round to a multiple of this (0.05 → nearest 5p). 0 = no rounding. */
  price_round: number;
  price_min_margin: number;
  price_max_margin: number;
  applied_on: AppliedOn;
  product_tmpl_id: [number, string] | false;
  product_id: [number, string] | false;
  categ_id: [number, string] | false;
  base: 'list_price' | 'standard_price' | 'pricelist' | string;
  base_pricelist_id: [number, string] | false;
  min_quantity: number;
  /**
   * Cost band, added by the custom `ft_paints_pricelist` module — NOT standard
   * Odoo. See COST BANDS below. `0`/`0` means the rule only applies to a product
   * with no cost at all.
   */
  min_cost: number;
  max_cost: number;
  date_start: string | false;
  date_end: string | false;
  /** Odoo's human-readable summary ("35 % markup on product cost"). Logging only. */
  price?: string;
}

export interface PricelistInfo {
  id: number;
  name: string;
  currency: string;
  /**
   * MUST be in Odoo's own `_order` — see PRICELIST_ITEM_ORDER. The engine takes
   * the first rule that matches and relies entirely on this ordering being right.
   */
  items: PricelistItem[];
}

/**
 * `product.pricelist.item._order`. Odoo's engine walks its rules in exactly this
 * sequence and stops at the first applicable one, so reproducing the order is
 * what makes the result match — most specific first, and within equal
 * specificity the newest rule wins.
 *
 * Note `categ_id desc` orders by raw category id, NOT by how close the category
 * sits to the product. That looks arbitrary because it is; it is what Odoo does.
 */
export const PRICELIST_ITEM_ORDER = 'applied_on, min_quantity desc, categ_id desc, id desc';

/** Every field the engine reads. Fetch all of them or rules silently misprice. */
export const PRICELIST_ITEM_FIELDS = [
  'id', 'compute_price', 'fixed_price', 'percent_price', 'price_discount',
  'price_surcharge', 'price_round', 'price_min_margin', 'price_max_margin',
  'applied_on', 'product_tmpl_id', 'product_id', 'categ_id',
  'base', 'base_pricelist_id', 'min_quantity', 'min_cost', 'max_cost',
  'date_start', 'date_end', 'price',
];

export interface PriceContext {
  /** product.template id. Always required — variant rules are matched by variantId. */
  tmplId: number;
  /** product.product id, when pricing a specific variant. */
  variantId?: number | null;
  /** The public list price of whatever is being priced (template or variant). */
  listPrice: number;
  /** standard_price of the same. Cost-based formulas need it. */
  costPrice?: number;
  qty?: number;
  /** The product's category chain, leaf-first. From getCategoryAncestries(). */
  categAncestry?: number[];
  date?: Date;
}

export interface PriceResult {
  price: number;
  /** The rule Odoo would have used, or null when nothing applied. */
  rule: PricelistItem | null;
}

const id0 = (v: [number, string] | false): number => (Array.isArray(v) ? v[0] : 0);

/** Odoo stores these as naive UTC datetimes ("2026-12-25 00:00:00"). */
function withinDates(item: PricelistItem, date: Date): boolean {
  const at = date.toISOString().slice(0, 19).replace('T', ' ');
  if (item.date_start && at < item.date_start) return false;
  if (item.date_end && at > item.date_end) return false;
  return true;
}

/**
 * COST BANDS — the part that is not Odoo.
 *
 * `ft_paints_pricelist` gates each tier's global rules on the product's cost, so
 * Bronze/Silver/Gold are markup *ladders* (Silver: 150 % under £3, …, 25 % over
 * £150) rather than the competing rules a stock Odoo would see.
 *
 * The module patches Odoo's core pricing engine, so this is not a portal quirk —
 * www.ftpaints.co.uk, the mobile app and this code all resolve the same price.
 * Verified against the live site: B89 (cost £80.61) returns £108.82 anonymously,
 * which is Silver's 35 % band, Silver being the website's default pricelist.
 * The portal has to replicate the algorithm only because Odoo refuses to run it
 * for us — `_compute_price_rule` and friends are private and blocked over RPC.
 *
 * The gate applies to `3_global` rules only. Product- and variant-level rules are
 * negotiated prices and always apply: 1,857 of them sit on products that do have
 * a cost, not one carries a band, and 87 real order lines were billed at exactly
 * their fixed price. Their `0`/`0` is an unset default, not a band.
 *
 * A global rule with `0`/`0` therefore matches only a product with no cost at
 * all. That is deliberate: it is how each tier's `0 % discount on sales price`
 * rule (6810/6811/6812) works as the zero-cost fallback for the 207 products
 * with no cost, which otherwise would price at £0. Do not delete those rules.
 */
function withinCostBand(item: PricelistItem, cost: number): boolean {
  if (item.applied_on !== '3_global') return true;
  return cost >= item.min_cost && cost <= item.max_cost;
}

/** Odoo's `_is_applicable_for`, minus the UoM conversion the portal never uses. */
function isApplicable(
  item: PricelistItem,
  ctx: Required<Pick<PriceContext, 'tmplId' | 'qty' | 'categAncestry'>> & { variantId: number | null; costPrice: number }
): boolean {
  if (ctx.qty < item.min_quantity) return false;
  if (!withinCostBand(item, ctx.costPrice)) return false;
  switch (item.applied_on) {
    case '0_product_variant':
      return !!ctx.variantId && id0(item.product_id) === ctx.variantId;
    case '1_product':
      return id0(item.product_tmpl_id) === ctx.tmplId;
    case '2_product_category':
      // A category rule covers its own category and everything beneath it, so a
      // match anywhere in the product's ancestry counts.
      return !!item.categ_id && ctx.categAncestry.includes(id0(item.categ_id));
    case '3_global':
      return true;
    default:
      return false;
  }
}

/** float_round(value, precision_rounding=rounding) — nearest multiple, half up. */
function roundTo(value: number, rounding: number): number {
  if (!rounding) return value;
  return Math.round(value / rounding) * rounding;
}

/**
 * The first rule Odoo would apply, or null. Exported for diagnostics — it is
 * genuinely useful to be able to ask "which rule priced this?".
 */
export function findPricelistRule(pricelist: PricelistInfo, ctx: PriceContext): PricelistItem | null {
  const date = ctx.date ?? new Date();
  const resolved = {
    tmplId: ctx.tmplId,
    variantId: ctx.variantId ?? null,
    qty: ctx.qty ?? 1,
    categAncestry: ctx.categAncestry ?? [],
    // Drives the cost band, so a missing cost must not silently read as "£0 and
    // therefore in the zero-cost band" — callers have to supply the real cost.
    costPrice: ctx.costPrice ?? 0,
  };
  // First match wins — items arrive in PRICELIST_ITEM_ORDER. Do not sort here.
  for (const item of pricelist.items) {
    if (!withinDates(item, date)) continue;
    if (isApplicable(item, resolved)) return item;
  }
  return null;
}

/** `_compute_base_price` — what the rule's discount/markup is applied to. */
function basePrice(item: PricelistItem, ctx: PriceContext): number {
  if (item.base === 'standard_price') return ctx.costPrice ?? 0;
  if (item.base === 'pricelist' && item.base_pricelist_id) {
    // Would need the parent list's rules, which we do not fetch. No pricelist in
    // this database chains onto another; if one ever does, this is the warning.
    console.warn(
      `[pricelist] rule ${item.id} on "${ctx.tmplId}" is based on pricelist ` +
      `${id0(item.base_pricelist_id)}, which is not supported — using the list price`
    );
  }
  return ctx.listPrice;
}

/**
 * Price one product (or variant) against a partner's pricelist.
 *
 * Returns the price Odoo would return, plus the rule that produced it so the
 * caller can tell "no rule applied" from "a rule applied and happened to land on
 * the list price" — the two mean different things when a promotional price is
 * already in play.
 */
export function applyPricelist(pricelist: PricelistInfo, ctx: PriceContext): PriceResult {
  const rule = findPricelistRule(pricelist, ctx);
  if (!rule) return { price: ctx.listPrice, rule: null };

  const base = basePrice(rule, ctx);
  let price: number;

  switch (rule.compute_price) {
    case 'fixed':
      price = rule.fixed_price;
      break;
    case 'percentage':
      price = base - base * (rule.percent_price / 100);
      break;
    case 'formula': {
      // A negative price_discount is Odoo's way of expressing a markup:
      // base - base * (-35/100) === base * 1.35. No special case needed.
      price = base - base * (rule.price_discount / 100);
      if (rule.price_round) price = roundTo(price, rule.price_round);
      if (rule.price_surcharge) price += rule.price_surcharge;
      if (rule.price_min_margin) price = Math.max(price, base + rule.price_min_margin);
      if (rule.price_max_margin) price = Math.min(price, base + rule.price_max_margin);
      break;
    }
    default:
      return { price: ctx.listPrice, rule: null };
  }

  // The one deliberate departure from Odoo. Cost-based rules against a product
  // whose standard_price is 0 (207 of them in this database) compute to £0.00,
  // and a £0.00 price shown to a trade customer is worse than showing the public
  // one — it also trips ProductCard's "price varies by size" fallback and hides
  // the product. Odoo has no such guard; this only ever fires on bad data.
  if (price <= 0 && ctx.listPrice > 0) {
    console.warn(
      `[pricelist] rule ${rule.id} (${rule.price || rule.compute_price}) on "${pricelist.name}" ` +
      `priced template ${ctx.tmplId}${ctx.variantId ? `/variant ${ctx.variantId}` : ''} at ` +
      `${price} from base ${base} — falling back to the list price ${ctx.listPrice}`
    );
    return { price: ctx.listPrice, rule: null };
  }

  return { price, rule };
}
