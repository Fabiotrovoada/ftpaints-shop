/**
 * Stock constants shared by the server (lib/odoo.ts) and the client components
 * that render stock badges. Deliberately free of any Odoo/env import so a
 * client bundle can pull it in.
 */

/**
 * Website category (product.public.category) whose products FT Paints makes in
 * house. Supply never runs out, so Odoo's on-hand quantity — which for
 * made-to-order goods sits at or below zero — must not reach the shop.
 *
 * This is the id from /shop?categoryId=..., NOT product.template.categ_id.
 * Membership is resolved over JSON-RPC (see getAlwaysInStockIds) rather than
 * from a card's categ_id, which holds the website category on the Mobile API
 * path and the internal category on the JSON-RPC path.
 */
export const ALWAYS_IN_STOCK_CATEGORY_ID = 24370;

/**
 * qty_available standing for "made in house — never runs out".
 *
 * Same idea as the Mobile API path's 999 ("in stock, exact count unknown"),
 * but far above any real quantity so a large trade order can never exceed it.
 */
export const UNLIMITED_QTY = 9_999_999;

/** True for stock that should read as a plain "In Stock" with no unit count. */
export function isUnlimitedStock(qty: number | undefined | null): boolean {
  return typeof qty === 'number' && qty >= UNLIMITED_QTY;
}
