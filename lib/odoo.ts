// Odoo client for FTPaints Trade Portal
// Mobile API v1 for auth, products, categories, cart
// JSON-RPC (with web session) for invoices, orders, partner
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const ODOO_URL = process.env.ODOO_URL!;
const ODOO_DB = process.env.ODOO_DB!;

// ─── Mobile API helpers ───────────────────────────────────────────────────────
// Per API docs: ALL endpoints use Content-Type: application/json
// GET requests still send a JSON body with user_id + auth_token

// Odoo Mobile API GET routes: send JSON body with Content-Type: application/json
// Cloudflare WAF blocks GET+body without this header; Odoo rejects without the body.
import * as https from 'https';
import * as http from 'http';
import { cacheGet, cacheSet, TTL } from './cache';
import {
  applyPricelist,
  PRICELIST_ITEM_FIELDS,
  PRICELIST_ITEM_ORDER,
  type PricelistInfo,
  type PricelistItem,
} from './pricelist';

function httpsGetWithBody(urlStr: string, body: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: false,
    };
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * The Mobile API reports failures inside an HTTP 200 as `{success: false, success_msg}`
 * rather than a JSON-RPC error envelope. Callers used to read straight past that and
 * see an empty product list, which is indistinguishable from a genuinely empty
 * category — so a server-side crash looked like "No products found" forever.
 */
export class OdooMobileError extends Error {
  constructor(readonly endpoint: string, message: string) {
    super(message);
    this.name = 'OdooMobileError';
  }
}

async function mobileGet(
  endpoint: string,
  authPayload: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Promise<unknown> {
  const url = `${ODOO_URL}${endpoint}`;
  const body = JSON.stringify({ ...authPayload, ...extra });
  const responseText = await httpsGetWithBody(url, body);
  const data = JSON.parse(responseText) as { jsonrpc?: string; result?: unknown; error?: { message: string } };
  if (data.error) throw new Error((data.error as { message: string }).message);
  const result = data.result !== undefined ? data.result : data;
  if (result && typeof result === 'object' && (result as { success?: boolean }).success === false) {
    const msg = (result as { success_msg?: string }).success_msg;
    throw new OdooMobileError(endpoint, msg ? String(msg) : 'Mobile API returned success:false');
  }
  return result;
}

async function mobilePost(
  endpoint: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`${ODOO_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { jsonrpc?: string; result?: unknown; error?: { message: string } };
  if (data.error) throw new Error(data.error.message);
  return data.result !== undefined ? data.result : data;
}

// ─── Admin token (for catalog browsing) ──────────────────────────────────────
interface AdminToken { user_id: number; auth_token: string; [key: string]: unknown }
let _adminToken: AdminToken | null = null;
let _adminTokenExpiry = 0;

async function getAdminToken(): Promise<AdminToken> {
  if (_adminToken && Date.now() < _adminTokenExpiry) return _adminToken;
  const login = process.env.ODOO_ADMIN_EMAIL!;
  const password = process.env.ODOO_ADMIN_PASSWORD!;
  const result = (await mobilePost('/api/v1/sign_in', { login, password })) as {
    success?: boolean; user_id?: number; auth_token?: string;
  };
  if (!result?.success || !result.user_id || !result.auth_token) {
    throw new Error('Admin Mobile API sign_in failed');
  }
  _adminToken = { user_id: result.user_id, auth_token: result.auth_token };
  _adminTokenExpiry = Date.now() + 3_600_000; // 1 hour
  return _adminToken;
}

// ─── Web Session (JSON-RPC for invoices, orders, partner) ────────────────────
interface WebSession { cookies: string; expiresAt: number }
let _webSession: WebSession | null = null;

export async function getWebSession(): Promise<string> {
  if (_webSession && Date.now() < _webSession.expiresAt) return _webSession.cookies;
  const login = process.env.ODOO_ADMIN_EMAIL!;
  const password = process.env.ODOO_ADMIN_PASSWORD!;
  const res = await fetch(`${ODOO_URL}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { db: ODOO_DB, login, password },
    }),
  });
  const rawCookies = res.headers.get('set-cookie') || '';
  const data = (await res.json()) as { result?: { uid?: number } };
  if (!data.result?.uid) throw new Error(`Web session authenticate failed for ${login}`);
  const sessionMatch = rawCookies.match(/session_id=([^;]+)/);
  const cookieHeader = sessionMatch ? `session_id=${sessionMatch[1]}` : rawCookies;
  _webSession = { cookies: cookieHeader, expiresAt: Date.now() + 3_600_000 };
  return cookieHeader;
}

let _rpcId = 1;
export async function jsonrpcCallKw(
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  const cookies = await getWebSession();
  const res = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookies },
    body: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: _rpcId++,
      params: { model, method, args, kwargs: { ...kwargs, context: {} } },
    }),
  });
  const data = (await res.json()) as { result?: unknown; error?: { data?: { message?: string }; message?: string } };
  if (data.error) {
    const msg = data.error.data?.message || data.error.message || 'RPC error';
    throw new Error(msg);
  }
  if (method === 'read' && Array.isArray(data.result)) {
    // read with multiple IDs returns an array — return full result
    const ids = args[0] as unknown[];
    if (Array.isArray(ids) && ids.length > 1) return data.result;
    // single ID: return first element
    return data.result[0] || null;
  }
  return data.result;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authenticate(
  email: string,
  password: string
): Promise<{ user_id: number; auth_token: string } | false> {
  try {
    // Try trade partner login first, then regular
    for (const endpoint of ['/api/v1/sign_in_partner', '/api/v1/sign_in']) {
      const result = (await mobilePost(endpoint, { login: email, password })) as {
        success?: boolean; user_id?: number; auth_token?: string;
      };
      if (result?.success && result.user_id && result.auth_token) {
        return { user_id: result.user_id, auth_token: result.auth_token };
      }
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Partner ─────────────────────────────────────────────────────────────────

export async function getPartnerByUid(uid: number, _password: string): Promise<Record<string, unknown>> {
  try {
    const rows = (await jsonrpcCallKw('res.users', 'read', [[uid]], {
      fields: ['name', 'email', 'partner_id', 'company_id'],
    })) as Record<string, unknown> | null;
    return rows ?? {};
  } catch { return {}; }
}

export async function getPartnerInfo(_uid: number, _password: string, partnerId: number): Promise<Record<string, unknown> | null> {
  try {
    return (await jsonrpcCallKw('res.partner', 'read', [[partnerId]], {
      fields: ['name', 'email', 'phone', 'mobile', 'street', 'street2', 'city', 'zip', 'country_id',
               'vat', 'commercial_partner_id', 'credit', 'credit_limit', 'property_payment_term_id'],
    })) as Record<string, unknown> | null;
  } catch { return null; }
}

// ─── Account area ─────────────────────────────────────────────────────────────

/**
 * uid → the contact's own partner id and their commercial (company) partner id.
 * Every account route needs both: writes and the profile view target the
 * contact, while documents and history are scoped to the company.
 *
 * Cached because it is two RPCs that almost never change, and every page in the
 * account area hits it.
 */
export async function resolveAccountPartner(
  uid: number
): Promise<{ partnerId: number | null; commercialId: number | null }> {
  const key = `partner:${uid}`;
  const hit = cacheGet<{ partnerId: number | null; commercialId: number | null }>(key);
  if (hit) return hit;
  try {
    const user = await getPartnerByUid(uid, '');
    const partnerId = (user?.partner_id as [number, string] | undefined)?.[0] ?? null;
    if (!partnerId) return { partnerId: null, commercialId: null };
    const commercialId = await getCommercialPartnerId(partnerId);
    const resolved = { partnerId, commercialId };
    cacheSet(key, resolved, TTL.PARTNER);
    return resolved;
  } catch {
    return { partnerId: null, commercialId: null };
  }
}

export async function getPartnerProfile(partnerId: number): Promise<Record<string, unknown> | null> {
  try {
    return (await jsonrpcCallKw('res.partner', 'read', [[partnerId]], {
      fields: ['name', 'email', 'phone', 'mobile', 'street', 'street2', 'city', 'zip',
               'country_id', 'vat', 'commercial_partner_id'],
    })) as Record<string, unknown> | null;
  } catch { return null; }
}

/**
 * Whitelisted write — caller input is never spread into the vals, so a crafted
 * body cannot reach fields like `credit_limit` or `email` (the login).
 */
export async function updatePartnerProfile(
  partnerId: number,
  fields: { name?: string; phone?: string; mobile?: string }
): Promise<boolean> {
  try {
    const vals: Record<string, string> = {};
    if (typeof fields.name === 'string') vals.name = fields.name;
    if (typeof fields.phone === 'string') vals.phone = fields.phone;
    if (typeof fields.mobile === 'string') vals.mobile = fields.mobile;
    if (Object.keys(vals).length === 0) return true;
    await jsonrpcCallKw('res.partner', 'write', [[partnerId], vals]);
    return true;
  } catch { return false; }
}

/** Odoo's res.users.write hashes the password itself — never pre-hash here. */
export async function changeUserPassword(uid: number, newPassword: string): Promise<boolean> {
  try {
    await jsonrpcCallKw('res.users', 'write', [[uid], { password: newPassword }]);
    return true;
  } catch { return false; }
}

/**
 * Does this record belong to the customer's company? Used by the PDF routes,
 * which authenticate but historically did not authorize — any signed-in user
 * could read any order or invoice by guessing an id.
 */
export async function assertOwnsRecord(
  model: 'sale.order' | 'account.move',
  id: number,
  commercialId: number
): Promise<boolean> {
  try {
    const count = await jsonrpcCallKw(model, 'search_count', [
      [['id', '=', id], ['partner_id', 'child_of', commercialId]],
    ]) as number;
    return count > 0;
  } catch { return false; }
}

// ─── Field normalizer: Mobile API → Frontend format ──────────────────────────
// Mobile API field  →  Frontend field
// price             →  list_price
// cost              →  standard_price
// internal_reference → default_code
// available_in_stock (bool) → qty_available (number: 999 if true, 0 if false)
// category_id {id, name, parent_id, parent_name} → categ_id [id, name]
// image_url (full URL) → image_url (keep as URL; frontend updated to use it)
// bulk_deal_values [{qty, price}] → quantity_breaks

interface MobileProduct {
  id: number;
  name: string;
  price: number;
  is_special_price?: boolean;
  special_price?: number;
  cost?: number;
  internal_reference?: string;
  available_in_stock?: boolean | number;
  category_id?: { id: number; name: string; parent_id?: number; parent_name?: string };
  image_url?: string;
  other_images?: string[];
  description_sale?: string;
  description_ecommerce?: string;
  bulk_deal_values?: Array<{ qty: number; price: number }>;
  variant_ids?: Array<{
    id: number;
    name: string;
    price?: number;
    merged_name?: string;
    internal_reference?: string;
    barcode?: string;
    attribute_values?: Array<{ name: string; display_name: string; attribute_id: number }>;
  }>;
  type?: string;
  barcode?: string;
  offer?: string;
  shipping?: string;
  overall_rating?: number;
  product_tag_ids?: number[];
  // JSON-RPC specific fields (from search_read)
  default_code?: string;
  list_price?: number;
  standard_price?: number;
  qty_available?: number;
  virtual_available?: number;
  categ_id?: [number, string] | false;
  uom_id?: [number, string] | false;
  image_128?: string;
  product_variant_count?: number;
  product_variant_id?: [number, string] | false;
}

function normalizeMobileProduct(p: MobileProduct) {
  const catId = p.category_id?.id && p.category_id.id > 0 ? p.category_id.id : null;
  const catName = p.category_id?.name || '';
  // qty_available: Mobile API returns boolean available_in_stock
  // Use a high number (999) when true so UI shows "In Stock"
  const qty = typeof p.available_in_stock === 'number'
    ? p.available_in_stock
    : (p.available_in_stock ? 999 : 0);

  return {
    id: p.id,
    name: p.name,
    default_code: p.internal_reference || false,
    list_price: p.is_special_price && p.special_price ? p.special_price : (p.price || 0),
    original_price: p.price || 0,
    standard_price: p.cost || 0,
    qty_available: qty,
    virtual_available: qty,
    categ_id: catId ? [catId, catName] as [number, string] : false,
    image_url: p.image_url || null,
    image_128: null, // no base64 from Mobile API — use image_url
    description_sale: p.description_sale || p.description_ecommerce || '',
    barcode: p.barcode || '',
    quantity_breaks: p.bulk_deal_values || [],
    variant_count: (p.variant_ids || []).length,
    // See toProductCard — the one orderable product.product, when unambiguous.
    variant_id: p.variant_ids?.length === 1 ? p.variant_ids[0].id : null,
    // Include full variant details for product detail page
    variant_ids: Array.isArray(p.variant_ids) ? p.variant_ids : [],
    offer: p.offer || '',
    shipping: p.shipping || '',
    rating: p.overall_rating || 0,
    type: p.type || 'consu',
    uom_id: false,
    product_tag_ids: [],
  };
}

// The product.template fields every ProductCard needs, and the single mapping
// from a raw JSON-RPC row to that card shape. Used by every search_read that
// feeds a product grid (tag/category browse, favourites, Buy Again) so the
// shape can never drift between them.
export const TEMPLATE_CARD_FIELDS = [
  'id', 'name', 'default_code', 'list_price', 'standard_price',
  'qty_available', 'virtual_available', 'categ_id', 'uom_id',
  'image_128', 'product_tag_ids', 'type', 'barcode',
  // Cards must know whether a size still has to be chosen, and which variant to
  // put in the basket — sale.order.line.product_id is a product.product, and a
  // template id there resolves to an unrelated product. The Mobile API path
  // derives both from variant_ids.
  'product_variant_count', 'product_variant_id',
];

function toProductCard(p: MobileProduct): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name,
    default_code: p.default_code || false,
    list_price: p.list_price || 0,
    standard_price: p.standard_price || 0,
    qty_available: p.qty_available || 0,
    virtual_available: p.virtual_available || 0,
    categ_id: p.categ_id || false,
    uom_id: p.uom_id || false,
    image_128: null, // base64 is heavy — the frontend loads image_url instead
    image_url: p.image_128 ? `${ODOO_URL}/web/image/product.template/${p.id}/image_128` : null,
    product_tag_ids: p.product_tag_ids || [],
    type: p.type || 'consu',
    barcode: p.barcode || '',
    variant_count: p.product_variant_count ?? (p.variant_ids || []).length,
    // The product.product to order when there is only one. Null for multi-variant
    // products — those must go through the detail page to pick a size.
    variant_id: Array.isArray(p.product_variant_id)
      ? p.product_variant_id[0]
      : (p.variant_ids?.length === 1 ? p.variant_ids[0].id : null),
  };
}

// ─── Products (Mobile API) ────────────────────────────────────────────────────

/**
 * Rebuild a product window over JSON-RPC when the Mobile API listing raises.
 *
 * The domain is a verified stand-in for the mobile listing rather than a guess:
 * `public_categ_ids child_of <id>` reproduces the mobile itemCount exactly on
 * every category checked (24375→94, 20786→2054, 22184→239, 24371→1005,
 * 20784→9872, 24504→6260), and an empty domain gives the same 33,258 total.
 * Notably there is no is_published / sale_ok / type filter in play.
 */
async function getProductsViaRpc(
  admin: AdminToken,
  options: { search?: string; categoryId?: number; inStockOnly?: boolean; offset?: number; limit?: number }
): Promise<{ products: Record<string, unknown>[]; total: number }> {
  const domain: unknown[] = [];
  if (options.categoryId) domain.push(['public_categ_ids', 'child_of', options.categoryId]);
  if (options.search) {
    domain.push('|', '|',
      ['name', 'ilike', options.search],
      ['default_code', 'ilike', options.search],
      ['barcode', 'ilike', options.search]);
  }
  if (options.inStockOnly) domain.push(['qty_available', '>', 0]);

  const total = (await jsonrpcCallKw('product.template', 'search_count', [domain])) as number;
  const rows = (await jsonrpcCallKw('product.template', 'search_read', [
    domain,
    TEMPLATE_CARD_FIELDS,
  ], {
    offset: options.offset || 0,
    limit: options.limit || 25,
    // Ascending id is close to the mobile listing's own order (its page 1 starts
    // 1, 4008, 4009, 4032, 5641), so a customer paging through a category that
    // fell back part-way doesn't see products repeat or disappear.
    order: 'id asc',
    context: {},
  })) as MobileProduct[];

  const products = rows.map(toProductCard);
  await applyMobilePrices(admin, products);
  return { products, total };
}

interface MobilePriceSnapshot {
  ok: boolean;
  price: number;
  special: number;
  breaks: Array<{ qty: number; price: number }>;
}

/**
 * Put real Mobile-API prices back onto JSON-RPC-sourced cards.
 *
 * Necessary because the mobile price is not product.template.list_price (7698 is
 * 33.5475 vs a 27.32 list) and can't be recomputed locally — the website
 * pricelist holds several cost-plus rules with nothing to say which one a given
 * product lands on. The per-product endpoint is the only source, and the listing
 * endpoint has no id-based filter (`ids`, `product_ids` and friends are silently
 * ignored and return the whole catalogue), so this fans out one call per card
 * with bounded concurrency and caches each result.
 *
 * A card whose own detail call also raises keeps its JSON-RPC list_price, which
 * may read low. That is only ever the products that caused the fallback.
 */
async function applyMobilePrices(admin: AdminToken, products: Record<string, unknown>[]): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < products.length) {
      const p = products[cursor++];
      const id = typeof p.id === 'number' ? p.id : Number(p.id);
      if (!id) continue;

      const key = `mobile-price:${id}`;
      let snap = cacheGet<MobilePriceSnapshot>(key);
      if (!snap) {
        try {
          const result = (await mobileGet(`/api/v1/product_template/${id}`, admin)) as {
            product_template?: MobileProduct;
          } | null;
          const t = result?.product_template;
          snap = t
            ? {
                ok: true,
                price: t.price || 0,
                special: t.is_special_price && t.special_price ? t.special_price : 0,
                breaks: t.bulk_deal_values || [],
              }
            : { ok: false, price: 0, special: 0, breaks: [] };
        } catch {
          // Cache the failure too — retrying it on every page render would turn a
          // handful of broken products into a permanent latency tax.
          snap = { ok: false, price: 0, special: 0, breaks: [] };
        }
        cacheSet(key, snap, TTL.PRODUCTS);
      }

      if (!snap.ok) continue;
      // original_price is the pre-special base applyPricelistToProducts prices
      // from; setting only list_price would re-base the partner's price wrongly.
      p.original_price = snap.price;
      p.list_price = snap.special || snap.price;
      p.quantity_breaks = snap.breaks;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, products.length) }, worker));
}

export async function getProducts(
  _uid: number,
  _password: string,
  options: {
    search?: string;
    categoryId?: number;
    inStockOnly?: boolean;
    offset?: number;
    limit?: number;
    sort?: string;
  } = {}
) {
  const admin = await getAdminToken();
  const limit = options.limit || 25;
  const offset = options.offset || 0;

  // Fetch a single Mobile-API page (1-indexed) for the current filters.
  async function fetchMobilePage(pageNum: number): Promise<{ rows: MobileProduct[]; total: number }> {
    if (options.search) {
      const result = (await mobileGet(`/api/v1/search/${pageNum}`, admin, {
        search_term: options.search,
        ...(options.inStockOnly ? { show_in_stock_only: true } : {}),
      })) as { products?: MobileProduct[]; itemCount?: number };
      const rows = result?.products || [];
      return { rows, total: result?.itemCount ?? rows.length };
    }
    const filterBy: Record<string, unknown> = {};
    if (options.categoryId) filterBy.categ_id = options.categoryId;
    const result = (await mobileGet(`/api/v1/all_product_template/${pageNum}`, admin, {
      filter_by: filterBy,
      ...(options.inStockOnly ? { available_in_stock: true } : {}),
    })) as { product_templates?: MobileProduct[]; itemCount?: number };
    const rows = result?.product_templates || [];
    return { rows, total: result?.itemCount ?? rows.length };
  }

  // The Mobile API paginates by page number with a fixed, server-controlled page
  // size that ignores our display `limit`. Learn that size from page 1, then fetch
  // exactly the page(s) spanning our [offset, offset+limit) window and slice it
  // precisely — so the grid shows `limit` items per page and never skips products
  // at the page seams.
  async function fetchViaMobile(): Promise<{ products: Record<string, unknown>[]; total: number }> {
    const page1 = await fetchMobilePage(1);
    const serverPageSize = page1.rows.length || limit;

    const startPage = Math.floor(offset / serverPageSize) + 1;
    const endPage = Math.floor((offset + limit - 1) / serverPageSize) + 1;

    const collected: MobileProduct[] = [];
    for (let pg = startPage; pg <= endPage; pg++) {
      const rows = pg === 1 ? page1.rows : (await fetchMobilePage(pg)).rows;
      collected.push(...rows);
      if (rows.length < serverPageSize) break; // reached the final, short page
    }

    const windowStart = offset - (startPage - 1) * serverPageSize;
    return {
      products: collected.slice(windowStart, windowStart + limit).map(normalizeMobileProduct),
      total: page1.total,
    };
  }

  // Odoo's mobile module raises on any response containing a product that belongs
  // to more than one website category ("Expected singleton"), which takes out whole
  // categories and scattered pages. Once a filter has been seen to fail, serve it
  // from JSON-RPC for the rest of the TTL rather than retrying per page — that also
  // keeps one ordering across every page of that filter.
  const degradedKey = `mobile-degraded:${options.categoryId || ''}:${options.search || ''}:${options.inStockOnly ? 1 : 0}`;
  let result: { products: Record<string, unknown>[]; total: number };
  if (cacheGet<boolean>(degradedKey)) {
    result = await getProductsViaRpc(admin, options);
  } else {
    try {
      result = await fetchViaMobile();
    } catch (err) {
      if (!(err instanceof OdooMobileError)) throw err;
      console.error(`[odoo] Mobile listing failed, falling back to JSON-RPC (${err.endpoint}): ${err.message}`);
      cacheSet(degradedKey, true, TTL.PRODUCTS);
      result = await getProductsViaRpc(admin, options);
    }
  }
  const products = result.products;
  const total = result.total;

  // Sort client-side since Mobile API doesn't support sorting
  if (options.sort) {
    const [sortField, sortDir] = options.sort.split(' ');
    products.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aVal = (a as any)[sortField] ?? '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bVal = (b as any)[sortField] ?? '';
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : (aVal < bVal ? -1 : aVal > bVal ? 1 : 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }

  return { products, total };
}

/**
 * Rebuild the Mobile API's product_template payload from JSON-RPC, so a product the
 * mobile module refuses to serialise still has a working detail page.
 *
 * Two deliberate gaps, both because the mobile payload has no JSON-RPC equivalent:
 *  - price is the raw list price, not the mobile cost-plus price (which can't be
 *    recomputed locally — the website pricelist has several cost-plus rules with
 *    nothing to say which one a product lands on);
 *  - quantity breaks come back empty. Odoo's bulk.order rows are *not* what
 *    bulk_deal_values reflects: template 20723 has three bulk.order rows and the
 *    Mobile API still returns an empty bulk_deal_values, so guessing from them
 *    would invent a bulk price that does not exist.
 */
async function buildProductViaRpc(id: number): Promise<MobileProduct | undefined> {
  const row = (await jsonrpcCallKw('product.template', 'read', [[id]], {
    fields: ['id', 'name', 'list_price', 'standard_price', 'default_code', 'barcode',
             'description_sale', 'public_categ_ids', 'type', 'qty_available'],
  })) as Record<string, unknown> | null;
  if (!row || typeof row.id !== 'number') return undefined;

  // The website category, not the internal categ_id: the detail page's breadcrumb
  // links to /shop?categoryId=N, and the shop filters on public categories.
  const publicCatIds = Array.isArray(row.public_categ_ids) ? row.public_categ_ids as number[] : [];
  let category: { id: number; name: string } | undefined;
  if (publicCatIds.length) {
    try {
      const cats = (await jsonrpcCallKw('product.public.category', 'read', [[publicCatIds[0]]], {
        fields: ['id', 'name'],
      })) as { id: number; name: string } | null;
      if (cats) category = { id: cats.id, name: cats.name };
    } catch { /* breadcrumb simply shows no category */ }
  }

  const variants = (await jsonrpcCallKw('product.product', 'search_read', [
    [['product_tmpl_id', '=', id]],
    ['id', 'name', 'default_code', 'barcode', 'lst_price', 'product_template_attribute_value_ids'],
  ], { context: {} })) as Array<{
    id: number; name: string; default_code?: string | false; barcode?: string | false;
    lst_price?: number; product_template_attribute_value_ids?: number[];
  }>;

  // Variant labels ("P120") come from the attribute values, the same text the
  // Mobile API puts in merged_name.
  const attrIds = [...new Set(variants.flatMap(v => v.product_template_attribute_value_ids || []))];
  const attrById = new Map<number, { name: string; display_name: string; attribute_id: number }>();
  if (attrIds.length) {
    try {
      const raw = await jsonrpcCallKw('product.template.attribute.value', 'read', [attrIds], {
        fields: ['id', 'name', 'display_name', 'attribute_id'],
      });
      const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const a of rows as Array<{ id: number; name: string; display_name: string; attribute_id: [number, string] | false }>) {
        attrById.set(a.id, {
          name: a.name,
          display_name: a.display_name,
          attribute_id: Array.isArray(a.attribute_id) ? a.attribute_id[0] : 0,
        });
      }
    } catch { /* variants still selectable, just unlabelled */ }
  }

  return {
    id: row.id,
    name: String(row.name || ''),
    price: typeof row.list_price === 'number' ? row.list_price : 0,
    cost: typeof row.standard_price === 'number' ? row.standard_price : 0,
    internal_reference: typeof row.default_code === 'string' ? row.default_code : '',
    barcode: typeof row.barcode === 'string' ? row.barcode : '',
    description_sale: typeof row.description_sale === 'string' ? row.description_sale : '',
    available_in_stock: typeof row.qty_available === 'number' ? Math.floor(row.qty_available) : 0,
    category_id: category,
    image_url: `${ODOO_URL}/web/image/product.template/${row.id}/image_1024`,
    type: typeof row.type === 'string' ? row.type : 'consu',
    bulk_deal_values: [],
    variant_ids: variants.map(v => {
      const attrs = (v.product_template_attribute_value_ids || [])
        .map(a => attrById.get(a))
        .filter(Boolean) as Array<{ name: string; display_name: string; attribute_id: number }>;
      return {
        id: v.id,
        name: v.name,
        merged_name: attrs.map(a => a.name).join(' / ') || v.name,
        price: typeof v.lst_price === 'number' ? v.lst_price : 0,
        internal_reference: typeof v.default_code === 'string' ? v.default_code : '',
        barcode: typeof v.barcode === 'string' ? v.barcode : '',
        attribute_values: attrs,
      };
    }),
  };
}

export async function getProductById(_uid: number, _password: string, id: number) {
  const admin = await getAdminToken();
  let product: MobileProduct | undefined;
  try {
    const result = (await mobileGet(`/api/v1/product_template/${id}`, admin)) as {
      product_template?: MobileProduct;
      success?: boolean;
    } | null;
    product = result?.product_template;
  } catch (err) {
    if (!(err instanceof OdooMobileError)) throw err;
    // The mobile module raises on products in more than one website category —
    // without this the product simply 404s. See OdooMobileError.
    console.error(`[odoo] Mobile product ${id} failed, falling back to JSON-RPC: ${err.message}`);
    product = await buildProductViaRpc(id);
  }
  if (!product || !product.id) return null;
  const normalized = normalizeMobileProduct(product);

  // Fetch real stock quantity via JSON-RPC (more accurate than Mobile API boolean)
  try {
    const stockData = await jsonrpcCallKw('product.template', 'read', [[id]], {
      fields: ['qty_available', 'virtual_available'],
    }) as Record<string, unknown> | null;
    if (stockData && typeof stockData.qty_available === 'number') {
      normalized.qty_available = Math.floor(stockData.qty_available);
      normalized.virtual_available = typeof stockData.virtual_available === 'number'
        ? Math.floor(stockData.virtual_available)
        : normalized.qty_available;
    }
  } catch { /* fall back to Mobile API stock status */ }

  // Fetch per-variant stock quantities via JSON-RPC
  if (normalized.variant_ids && normalized.variant_ids.length > 0) {
    const variantIds = normalized.variant_ids.map((v: { id: number }) => v.id);
    try {
      // standard_price rides along on a read that was happening anyway — cost is
      // per-variant, and cost-based pricelist rules need it to price a size.
      const variantStocksRaw = await jsonrpcCallKw('product.product', 'read', [variantIds], {
        fields: ['id', 'qty_available', 'virtual_available', 'standard_price'],
      });
      // product.product read can return either an array or a dict keyed by id
      type VariantRow = { id: number; qty_available: number; virtual_available: number; standard_price?: number };
      let stockMap: Map<number, VariantRow>;
      if (Array.isArray(variantStocksRaw)) {
        stockMap = new Map((variantStocksRaw as VariantRow[]).map(s => [s.id, s]));
      } else {
        // Dict format: { "139022": { id, qty_available, ... }, ... }
        stockMap = new Map(Object.values(variantStocksRaw as Record<string, VariantRow>).map(s => [s.id, s]));
      }
      // Enrich each variant with its stock data
      normalized.variant_ids = normalized.variant_ids.map(v => {
        const stock = stockMap.get(v.id);
        if (stock) {
          return {
            ...v,
            qty_available: stock.qty_available,
            virtual_available: stock.virtual_available,
            standard_price: stock.standard_price ?? 0,
          };
        }
        return v;
      });
    } catch (e) {
      console.error('Variant stock fetch failed:', e instanceof Error ? e.message : e);
      /* variants without per-unit stock — template-level stock is shown */
    }
  }

  return normalized;
}

export async function getCategories(_uid: number, _password: string) {
  const admin = await getAdminToken();
  const result = (await mobileGet('/api/v1/get_categories', admin)) as {
    categories?: Array<{
      id: number;
      name: string;
      parent_category_id?: number;
      parent_category_name?: string;
      image_url?: string;
    }>;
  };
  const all = result?.categories || [];

  // Return ALL categories with parent info — frontend builds the drill-down tree
  return all.map(c => ({
    id: c.id,
    name: c.name,
    complete_name: c.name,
    parent_id: (c.parent_category_id && c.parent_category_id > 0)
      ? [c.parent_category_id, c.parent_category_name || ''] as [number, string]
      : false as false,
    image_url: c.image_url || null,
    // Mark top-level brand categories (parent = "Brand Categories")
    is_brand: c.parent_category_name === 'Brand Categories',
  }));
}

// ─── Product Tags (via JSON-RPC) ──────────────────────────────────────────────

export interface Tag {
  id: number;
  name: string;
  product_count: number;
}

export async function getTags(): Promise<Tag[]> {
  // Get all tags with product counts
  const tagsData = await jsonrpcCallKw('product.tag', 'search_read', [
    [], // domain
    ['id', 'name'], // fields as positional arg
  ], {
    context: {},
  }) as Array<{ id: number; name: string }>;

  if (!tagsData || tagsData.length === 0) return [];

  // For each tag, count products that have it
  const tagsWithCounts = await Promise.all(
    tagsData.map(async (tag) => {
      try {
        const count = await jsonrpcCallKw('product.template', 'search_count', [
          [['product_tag_ids', 'in', [tag.id]]],
        ]) as number;
        return { id: tag.id, name: tag.name, product_count: count };
      } catch {
        return { id: tag.id, name: tag.name, product_count: 0 };
      }
    })
  );

  return tagsWithCounts
    .filter(t => t.product_count > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProductsByTag(
  tagId: number,
  options: { offset?: number; limit?: number; search?: string; inStockOnly?: boolean; sort?: string } = {}
) {
  const { offset = 0, limit = 24, search, inStockOnly, sort = 'name asc' } = options;

  // Build domain
  const domain: unknown[] = [['product_tag_ids', 'in', [tagId]]];
  if (search) {
    domain.push(['name', 'ilike', search]);
  }
  if (inStockOnly) {
    domain.push(['qty_available', '>', 0]);
  }

  // Parse sort
  const sortMap: Record<string, [string, string]> = {
    'name asc': ['name', 'asc'],
    'name desc': ['name', 'desc'],
    'list_price asc': ['list_price', 'asc'],
    'list_price desc': ['list_price', 'desc'],
    'default_code asc': ['default_code', 'asc'],
  };
  const [sortField, sortDir] = sortMap[sort] || ['name', 'asc'];

  // Get total count
  const total = await jsonrpcCallKw('product.template', 'search_count', [domain]) as number;

  // Fetch products — include barcode for image lookup
  const rawProducts = await jsonrpcCallKw('product.template', 'search_read', [
    domain,
    TEMPLATE_CARD_FIELDS,
  ], {
    offset,
    limit,
    order: `${sortField} ${sortDir}`,
    context: {},
  }) as MobileProduct[];

  const products = rawProducts.map(toProductCard);

  return { products, total };
}

/**
 * Fetch specific product templates by id, in ProductCard shape. Used by the
 * Favourites view, which holds a set of template ids and needs the full cards
 * regardless of catalogue pagination. Result order matches the input `ids`.
 */
export async function getProductsByIds(ids: number[]): Promise<{ products: Record<string, unknown>[]; total: number }> {
  if (!ids.length) return { products: [], total: 0 };
  try {
    const rawProducts = await jsonrpcCallKw('product.template', 'search_read', [
      [['id', 'in', ids]],
      TEMPLATE_CARD_FIELDS,
    ], { context: {} }) as MobileProduct[];

    const byId = new Map<number, Record<string, unknown>>();
    for (const p of rawProducts) byId.set(p.id, toProductCard(p));

    // Preserve the caller's id order (search_read ignores it)
    const products = ids.map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
    return { products, total: products.length };
  } catch {
    return { products: [], total: 0 };
  }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

/**
 * Scoped to the COMMERCIAL partner (`child_of`), not the exact contact, so a
 * child-contact login sees the company's orders. This deliberately matches
 * getPreviouslyPurchasedProducts — before, Buy Again was built from orders the
 * Orders page refused to show.
 */
export async function getSaleOrders(_uid: number, _password: string, partnerId: number): Promise<Record<string, unknown>[]> {
  try {
    const commercialId = await getCommercialPartnerId(partnerId);
    // Include all states: draft=Quotation, sent=Quotation Sent, sale=Confirmed, done=Done, cancel=Cancelled
    return (await jsonrpcCallKw('sale.order', 'search_read', [
      [['partner_id', 'child_of', commercialId]],
      ['id', 'name', 'date_order', 'amount_total', 'state', 'order_line', 'note'],
    ], {
      order: 'date_order desc',
      limit: 100,
      context: {},
    })) as Record<string, unknown>[] ?? [];
  } catch { return []; }
}

export async function getSaleOrderLines(_uid: number, _password: string, orderId: number) {
  try {
    return await jsonrpcCallKw('sale.order.line', 'search_read', [
      [['order_id', '=', orderId]],
      ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'name'],
    ], { context: {} });
  } catch { return []; }
}

// ─── Buy Again (purchase history) ─────────────────────────────────────────────

// How far back Buy Again looks. Bounded by date rather than record count so a
// heavy account doesn't lose its older products halfway down the list.
const HISTORY_MONTHS = 24;
// Safety valve on the invoice/order queries — a busy trade account has hundreds.
const HISTORY_INVOICE_LIMIT = 400;
const HISTORY_ORDER_LIMIT = 400;
// Posted invoices are the richest source, but far from the only one: measured
// across all 65 portal logins, 27 have sale orders and NO posted invoice at all,
// and including orders takes 20 accounts from an empty Buy Again page to a
// populated one. Orders placed in this app also stay draft until staff invoice
// them, so invoice-only sourcing hid a customer's own order for days. Both
// sources are merged, newest wins.
const INCLUDE_SALE_ORDERS = true;
// Every state except a cancelled order counts as "they wanted this product":
// draft (Quotation — what this app creates at checkout), sent, sale, and the
// site's custom `future` ("To Be Delivered").
const NON_PURCHASE_ORDER_STATES = ['cancel'];
// account.move.line holds every journal item, not just what the customer bought.
// Anglo-saxon accounting adds `cogs` lines that carry a product_id and would
// double the payload (verified: 1280 rows → 674, with zero unique products lost).
const NON_PRODUCT_LINE_TYPES = ['cogs', 'tax', 'payment_term', 'rounding', 'line_section', 'line_note'];

/**
 * Trade accounts log in as a child contact ("Liam Rixon") while invoices are
 * raised against the parent company. Resolving to the commercial partner is
 * what lets that contact see the company's history instead of an empty page.
 * Falls back to the given partner id if the lookup fails.
 */
export async function getCommercialPartnerId(partnerId: number): Promise<number> {
  try {
    const rows = await jsonrpcCallKw('res.partner', 'read', [[partnerId]], {
      fields: ['commercial_partner_id'],
    }) as { commercial_partner_id?: [number, string] | false }[]
      | { commercial_partner_id?: [number, string] | false } | null;
    const row = Array.isArray(rows) ? rows[0] : rows;
    const cid = Array.isArray(row?.commercial_partner_id) ? row.commercial_partner_id[0] : null;
    return cid || partnerId;
  } catch { return partnerId; }
}

// ISO date HISTORY_MONTHS ago, e.g. '2024-07-29'
function historyCutoff(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - HISTORY_MONTHS);
  return d.toISOString().slice(0, 10);
}

/**
 * Products this customer has bought before, newest purchase first, in
 * ProductCard-ready shape with an extra `last_purchased` (ISO date) field.
 *
 * Sourced from POSTED CUSTOMER INVOICES *and* SALE ORDERS, merged. Counter
 * sales, phone and rep orders and migrated history exist as invoices; anything
 * bought through this app or quoted by a rep exists only as a sale order until
 * staff invoice it. Neither source alone covers the customer base. Archived
 * products drop out naturally (Odoo's default active_test), so a discontinued
 * line never appears as a dead card.
 */
export async function getPreviouslyPurchasedProducts(
  _uid: number, _password: string, partnerId: number
): Promise<{ products: Record<string, unknown>[] }> {
  try {
    if (!partnerId) return { products: [] };
    const since = historyCutoff();
    const commercialId = await getCommercialPartnerId(partnerId);

    // last purchase date per VARIANT, built from whichever sources are enabled
    const variantLastDate = new Map<number, string>();
    const noteVariant = (vid: number | null, date: string | null | undefined) => {
      if (!vid || !date) return;
      const prev = variantLastDate.get(vid);
      if (!prev || prev < date) variantLastDate.set(vid, date);
    };

    // 1. Posted customer invoices in the window, newest first
    const invoices = (await jsonrpcCallKw('account.move', 'search_read', [
      [
        ['commercial_partner_id', '=', commercialId],
        ['move_type', '=', 'out_invoice'],
        ['state', '=', 'posted'],
        ['invoice_date', '>=', since],
      ],
      ['id', 'invoice_date'],
    ], { order: 'invoice_date desc', limit: HISTORY_INVOICE_LIMIT, context: {} })) as
      { id: number; invoice_date: string | false }[] ?? [];

    if (invoices.length) {
      const invoiceDate = new Map<number, string>();
      for (const inv of invoices) if (inv.invoice_date) invoiceDate.set(inv.id, inv.invoice_date);

      // 2. Their product lines → variant ids, dated by the invoice they sit on
      const lines = (await jsonrpcCallKw('account.move.line', 'search_read', [
        [
          ['move_id', 'in', invoices.map(i => i.id)],
          ['product_id', '!=', false],
          ['display_type', 'not in', NON_PRODUCT_LINE_TYPES],
        ],
        ['move_id', 'product_id'],
      ], { context: {} })) as { move_id: [number, string] | false; product_id: [number, string] | false }[] ?? [];

      for (const l of lines) {
        const moveId = Array.isArray(l.move_id) ? l.move_id[0] : null;
        noteVariant(
          Array.isArray(l.product_id) ? l.product_id[0] : null,
          moveId ? invoiceDate.get(moveId) : null,
        );
      }
    }

    // 3. Optionally fold in sale orders (draft app checkouts not yet invoiced)
    if (INCLUDE_SALE_ORDERS) {
      // child_of, not '=': a company's orders can sit on the parent OR on any of
      // its contacts, so an exact match silently drops the ones a named buyer
      // placed under their own contact record.
      const orders = (await jsonrpcCallKw('sale.order', 'search_read', [
        [
          ['partner_id', 'child_of', commercialId],
          ['state', 'not in', NON_PURCHASE_ORDER_STATES],
          ['date_order', '>=', since],
        ],
        ['id', 'date_order'],
      ], { order: 'date_order desc', limit: HISTORY_ORDER_LIMIT, context: {} })) as
        { id: number; date_order: string | false }[] ?? [];
      if (orders.length) {
        const orderDate = new Map<number, string>();
        // date_order is a datetime; Buy Again only ever shows the day.
        for (const o of orders) if (o.date_order) orderDate.set(o.id, String(o.date_order).slice(0, 10));
        const orderLines = (await jsonrpcCallKw('sale.order.line', 'search_read', [
          [
            ['order_id', 'in', orders.map(o => o.id)],
            ['product_id', '!=', false],
            ['display_type', '=', false],
          ],
          ['order_id', 'product_id'],
        ], { context: {} })) as { order_id: [number, string] | false; product_id: [number, string] | false }[] ?? [];
        for (const l of orderLines) {
          const oid = Array.isArray(l.order_id) ? l.order_id[0] : null;
          noteVariant(
            Array.isArray(l.product_id) ? l.product_id[0] : null,
            oid ? orderDate.get(oid) : null,
          );
        }
      }
    }

    if (variantLastDate.size === 0) return { products: [] };

    // 4. Variants → templates, keeping the most recent date per template
    const variants = (await jsonrpcCallKw('product.product', 'read', [[...variantLastDate.keys()]], {
      fields: ['product_tmpl_id'],
    })) as { id: number; product_tmpl_id: [number, string] | false }[] | { id: number; product_tmpl_id: [number, string] | false } | null;
    const variantRows = Array.isArray(variants) ? variants : variants ? [variants] : [];
    const tmplLastDate = new Map<number, string>();
    for (const v of variantRows) {
      const tid = Array.isArray(v.product_tmpl_id) ? v.product_tmpl_id[0] : null;
      const date = variantLastDate.get(v.id);
      if (!tid || !date) continue;
      const prev = tmplLastDate.get(tid);
      if (!prev || prev < date) tmplLastDate.set(tid, date);
    }
    if (tmplLastDate.size === 0) return { products: [] };

    // 5. Newest purchase first, ties broken by id for a stable order
    const tmplIds = [...tmplLastDate.keys()].sort((a, b) => {
      const da = tmplLastDate.get(a)!, db = tmplLastDate.get(b)!;
      return da === db ? b - a : (da < db ? 1 : -1);
    });

    // 6. Read the templates as cards and re-apply our ordering (search_read
    //    returns them in its own order and silently omits archived products).
    //    type != service drops the delivery/discount/VAT lines that sit on every
    //    invoice (all 34 service products are charges, not goods), and sale_ok
    //    drops anything staff have marked as not sellable.
    const rawProducts = (await jsonrpcCallKw('product.template', 'search_read', [
      [['id', 'in', tmplIds], ['type', '!=', 'service'], ['sale_ok', '=', true]],
      TEMPLATE_CARD_FIELDS,
    ], { context: {} })) as MobileProduct[];
    const byId = new Map<number, Record<string, unknown>>();
    for (const p of rawProducts) {
      byId.set(p.id, { ...toProductCard(p), last_purchased: tmplLastDate.get(p.id) || null });
    }

    const products = tmplIds.map(id => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
    return { products };
  } catch { return { products: [] }; }
}

export interface OrderLineInput {
  productId: number;
  qty: number;
  price: number;
  name?: string;
  colours?: Array<{ name?: string; code?: string; make?: string; model?: string; year?: string }>;
  colourName?: string;
  colourCode?: string;
}

/** One basket line, resolved to a real Odoo variant and priced by the server. */
interface ResolvedLine {
  variantId: number;
  tmplId: number;
  listPrice: number;
  costPrice: number;
  categId: number;
  displayName: string;
}

export class OrderLineError extends Error {
  constructor(readonly items: string[]) {
    super(
      items.length === 1
        ? `${items[0]} can no longer be ordered as it is — please remove it and add it again from the product page.`
        : `${items.length} items can no longer be ordered as they are — please remove them and add them again from their product pages: ${items.join('; ')}`
    );
    this.name = 'OrderLineError';
  }
}

/**
 * Turn basket ids into real `product.product` ids, with the prices Odoo would use.
 *
 * Two things make this necessary. First, `sale.order.line.product_id` must be a
 * product.product, but ProductCard puts a product.TEMPLATE id in the basket while
 * the detail page puts a variant id — and the two id sequences overlap, so a
 * template id often resolves to a real but completely unrelated variant. Second,
 * the price arrives from the browser, where it may be stale (baskets live in
 * localStorage indefinitely) or simply edited.
 */
async function resolveOrderLines(lines: OrderLineInput[]): Promise<Map<number, ResolvedLine>> {
  const resolved = new Map<number, ResolvedLine>();
  const ids = [...new Set(lines.map(l => Number(l.productId)).filter(Boolean))];
  if (!ids.length) return resolved;

  type VariantRow = {
    id: number; display_name: string; lst_price: number;
    standard_price: number; product_tmpl_id: [number, string];
  };
  const readVariants = async (variantIds: number[]): Promise<VariantRow[]> => {
    if (!variantIds.length) return [];
    const raw = await jsonrpcCallKw('product.product', 'search_read', [
      [['id', 'in', variantIds]],
      ['id', 'display_name', 'lst_price', 'standard_price', 'product_tmpl_id'],
    ], { context: {} }) as VariantRow[] | null;
    return raw || [];
  };

  // An id can be BOTH a valid variant and a valid template — 45.6% of sellable
  // template ids also exist as a product.product, pointing at something
  // unrelated. So look up both readings and let the basket's product name break
  // the tie, rather than assuming one and silently ordering the wrong thing.
  type TmplRow = {
    id: number; name: string; categ_id: [number, string] | false;
    product_variant_id: [number, string] | false; product_variant_count: number;
  };
  const [asVariants, asTemplates] = await Promise.all([
    readVariants(ids),
    jsonrpcCallKw('product.template', 'search_read', [
      [['id', 'in', ids]], ['id', 'name', 'categ_id', 'product_variant_id', 'product_variant_count'],
    ], { context: {} }) as Promise<TmplRow[] | null>,
  ]);
  const variantById = new Map((asVariants || []).map(v => [v.id, v]));
  const tmplById = new Map((asTemplates || []).map(t => [t.id, t]));

  // A card puts a template id in the basket, so the template reading may need its
  // own variant fetched. Only single-variant templates can be resolved: with
  // several sizes there is no way to know which the customer meant.
  const tmplVariantIds = [...tmplById.values()]
    .filter(t => t.product_variant_count === 1 && Array.isArray(t.product_variant_id))
    .map(t => (t.product_variant_id as [number, string])[0])
    .filter(vid => !variantById.has(vid));
  for (const v of await readVariants(tmplVariantIds)) variantById.set(v.id, v);

  // Categories for the pricelist, across every template either reading touches.
  const allTmplIds = [...new Set([
    ...[...variantById.values()].map(v => v.product_tmpl_id[0]),
    ...tmplById.keys(),
  ])];
  const tmplMeta = await jsonrpcCallKw('product.template', 'search_read', [
    [['id', 'in', allTmplIds]], ['id', 'name', 'categ_id'],
  ], { context: {} }) as Array<{ id: number; name: string; categ_id: [number, string] | false }> | null;
  const metaByTmpl = new Map((tmplMeta || []).map(t => [t.id, t]));

  // Both the card and the detail page send the template's name (the detail page
  // appends the size), so the basket name should start with it.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const nameMatches = (basketName: string | undefined, tmplId: number) => {
    const tname = metaByTmpl.get(tmplId)?.name;
    if (!basketName || !tname) return null;   // nothing to judge on
    return norm(basketName).startsWith(norm(tname));
  };

  const ambiguous: string[] = [];
  const nameByInput = new Map(lines.map(l => [Number(l.productId), l.name]));

  for (const inputId of ids) {
    const asVariant = variantById.get(inputId) ?? null;
    const tmpl = tmplById.get(inputId) ?? null;
    const viaTmpl = tmpl && tmpl.product_variant_count === 1 && Array.isArray(tmpl.product_variant_id)
      ? variantById.get(tmpl.product_variant_id[0]) ?? null
      : null;

    const basketName = nameByInput.get(inputId);
    let v: VariantRow | null;

    if (asVariant && tmpl && asVariant.product_tmpl_id[0] !== tmpl.id) {
      // The id reads as two different products. Only the name the customer saw
      // can say which they meant — and note viaTmpl is null when the template has
      // several sizes, in which case "they meant the template" still isn't
      // orderable. Falling back to the variant reading here is exactly the bug
      // this guard exists to stop.
      const variantOk = nameMatches(basketName, asVariant.product_tmpl_id[0]) === true;
      const tmplOk = nameMatches(basketName, tmpl.id) === true;
      if (variantOk && !tmplOk) v = asVariant;
      else if (tmplOk && !variantOk) v = viaTmpl;
      else v = null;
      if (!v) {
        console.warn(
          `[order] id ${inputId} is both variant "${asVariant.display_name}" and template ` +
          `"${tmpl.name}"; basket says "${basketName ?? '(no name)'}" — refusing the line`
        );
        ambiguous.push(basketName || `product ${inputId}`);
        continue;
      }
    } else {
      v = asVariant ?? viaTmpl;
    }

    if (!v) {
      // A multi-variant template with no size chosen lands here too.
      ambiguous.push(basketName || tmpl?.name || `product ${inputId}`);
      continue;
    }

    const tmplId = v.product_tmpl_id[0];
    const categ = metaByTmpl.get(tmplId)?.categ_id;
    resolved.set(inputId, {
      variantId: v.id,
      tmplId,
      listPrice: v.lst_price || 0,
      costPrice: v.standard_price || 0,
      categId: Array.isArray(categ) ? categ[0] : 0,
      displayName: v.display_name || `product ${inputId}`,
    });
  }
  if (ambiguous.length) throw new OrderLineError(ambiguous);
  return resolved;
}

export interface CreatedOrder {
  id: number;
  name: string;
  /** Lines whose server price differed from the one the basket sent. */
  repriced: Array<{ productId: number; name: string; was: number; now: number }>;
}

export async function createSaleOrder(
  uid: number, password: string, partnerId: number,
  lines: OrderLineInput[],
  note?: string
): Promise<CreatedOrder> {
  // Render one colour spec ("Colour: X, Colour code: Y, Vehicle: MAKE MODEL YEAR")
  // from a customer-entered colour/vehicle pair.
  const colourSpec = (c: { name?: string; code?: string; make?: string; model?: string; year?: string }) => [
    c.name ? `Colour: ${c.name.toUpperCase()}` : '',
    c.code ? `Colour code: ${c.code.toUpperCase()}` : '',
    [c.make, c.model, c.year].some(Boolean) ? `Vehicle: ${[c.make, c.model, c.year].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean).join(', ');

  const resolved = await resolveOrderLines(lines);
  const pricelist = await getPartnerPricelistCached(uid, password);
  const ancestryByCat = await getCategoryAncestries([...resolved.values()].map(r => r.categId));
  const repriced: CreatedOrder['repriced'] = [];

  const orderLines = lines.map((l) => {
    const r = resolved.get(Number(l.productId))!;
    // The server price wins. `qty` matters here and nowhere else — min_quantity
    // rules are the one part of a pricelist that depends on how many you buy.
    let price = r.listPrice;
    if (pricelist?.items.length) {
      const out = applyPricelist(pricelist, {
        tmplId: r.tmplId,
        variantId: r.variantId,
        listPrice: r.listPrice,
        costPrice: r.costPrice,
        qty: l.qty,
        categAncestry: r.categId ? (ancestryByCat.get(r.categId) || [r.categId]) : [],
      });
      price = out.price;
    }
    price = round2(price);
    if (Math.abs(price - (Number(l.price) || 0)) >= 0.01) {
      repriced.push({ productId: l.productId, name: r.displayName, was: round2(Number(l.price) || 0), now: price });
    }

    const line: Record<string, unknown> = {
      product_id: r.variantId, product_uom_qty: l.qty, price_unit: price,
    };
    // For bespoke custom-mixed paints, fold the customer's colour spec into the
    // line description so it prints on the quotation the team mixes from. Newer
    // baskets carry one colour per unit (`colours`); enumerate them under the
    // product name. Older baskets carry a single `colourName`/`colourCode` pair.
    if (l.colours?.length) {
      const rows = l.colours
        .map(c => colourSpec(c))
        .filter(Boolean)
        .map((spec, i) => `  ${i + 1}) ${spec}`);
      line.name = [l.name, ...rows].filter(Boolean).join('\n');
    } else {
      const spec = colourSpec({ name: l.colourName, code: l.colourCode });
      if (spec) line.name = l.name ? `${l.name} — ${spec}` : spec;
    }
    return [0, 0, line];
  });
  const order: Record<string, unknown> = {
    partner_id: partnerId, order_line: orderLines, note: note || '',
  };
  // Name the pricelist on the order so the prices above are self-explanatory to
  // whoever opens the quotation in Odoo.
  if (pricelist) order.pricelist_id = pricelist.id;

  const id = await jsonrpcCallKw('sale.order', 'create', [order]) as number;
  // Read back the human-friendly order reference (e.g. "S00123") for the
  // customer to quote — e.g. as a bank-transfer payment reference.
  let name = '';
  try {
    const rec = await jsonrpcCallKw('sale.order', 'read', [[id]], { fields: ['name'] }) as
      | { id: number; name: string }[] | { id: number; name: string } | null;
    const row = Array.isArray(rec) ? rec[0] : rec;
    name = row?.name || '';
  } catch { /* name is best-effort; id is authoritative */ }
  if (repriced.length) {
    console.warn(`[order ${name || id}] repriced ${repriced.length} line(s) against the basket:`,
      repriced.map(r => `${r.name} ${r.was}→${r.now}`).join(', '));
  }
  return { id, name, repriced };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

/**
 * `opts.from`/`opts.to` are ISO dates (YYYY-MM-DD) filtering on invoice_date.
 * The default limit of 50 is fine for the invoice list but silently truncates a
 * statement, so the statement route passes a higher one.
 */
export async function getInvoices(
  _uid: number,
  _password: string,
  partnerId: number,
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  try {
    const domain: unknown[] = [
      ['partner_id', '=', partnerId],
      ['move_type', '=', 'out_invoice'],
      ['state', '=', 'posted'],
    ];
    if (opts.from) domain.push(['invoice_date', '>=', opts.from]);
    if (opts.to) domain.push(['invoice_date', '<=', opts.to]);
    return (await jsonrpcCallKw('account.move', 'search_read', [
      domain,
      ['id', 'name', 'invoice_date', 'invoice_date_due', 'amount_total',
       'amount_residual', 'payment_state', 'state'],
    ], {
      order: 'invoice_date desc',
      limit: opts.limit ?? 50,
      context: {},
    })) as Record<string, unknown>[] ?? [];
  } catch { return []; }
}

/**
 * Posted inbound payments, i.e. money the customer has actually sent us.
 * Pairing these with getInvoices is what turns the Statement page into a real
 * ledger rather than a second copy of the invoice list.
 */
export async function getCustomerPayments(
  commercialId: number,
  opts: { from?: string; to?: string; limit?: number } = {}
): Promise<Record<string, unknown>[]> {
  try {
    const domain: unknown[] = [
      ['partner_id', 'child_of', commercialId],
      ['payment_type', '=', 'inbound'],
      ['state', '=', 'posted'],
    ];
    if (opts.from) domain.push(['date', '>=', opts.from]);
    if (opts.to) domain.push(['date', '<=', opts.to]);
    return (await jsonrpcCallKw('account.payment', 'search_read', [
      domain,
      ['id', 'name', 'date', 'amount', 'ref'],
    ], {
      order: 'date desc',
      limit: opts.limit ?? 400,
      context: {},
    })) as Record<string, unknown>[] ?? [];
  } catch { return []; }
}

// ─── Invoice PDF ──────────────────────────────────────────────────────────────

export async function getInvoicePdf(_uid: number, _password: string, invoiceId: number): Promise<ArrayBuffer> {
  const cookies = await getWebSession();
  const pdfRes = await fetch(`${ODOO_URL}/report/pdf/account.report_invoice/${invoiceId}`, {
    headers: { Cookie: cookies },
  });
  if (!pdfRes.ok) throw new Error(`Odoo report returned ${pdfRes.status}`);
  return pdfRes.arrayBuffer();
}

// ─── Stripe Payment → Odoo Invoice Pipeline ──────────────────────────────────

export interface OdooInvoiceLine {
  product_id?: number;
  name: string;
  quantity: number;
  price_unit: number;
  tax_ids?: number[];
}

export interface OdooPaymentResult {
  invoice_id: number;
  payment_id: number;
  partner_id: number;
}

/**
 * Find or create a partner (customer) in Odoo by email.
 */
export async function findOrCreateOdooPartner(
  email: string,
  name?: string
): Promise<number> {
  // Search for existing partner by email — fields must be positional arg, not kwarg!
  const partners = (await jsonrpcCallKw('res.partner', 'search_read', [
    [['email', '=', email]],
    ['id', 'name'],
  ], {
    limit: 1,
    context: {},
  })) as Array<{ id: number; name: string }>;

  if (partners.length > 0) {
    console.log(`[ODOO] Found existing partner ${partners[0].id} for email: ${email}`);
    return partners[0].id;
  }

  // Create new partner
  const partnerId = await jsonrpcCallKw('res.partner', 'create', [{
    name: name || email,
    email,
    customer: true,
  }]) as number;

  console.log(`[ODOO] Created new partner ${partnerId} for email: ${email}`);
  return partnerId;
}

/**
 * Create and post a customer invoice in Odoo.
 */
export async function createOdooInvoice(
  partnerId: number,
  lines: OdooInvoiceLine[],
  reference?: string
): Promise<number> {
  // Build invoice line values — each line needs its own [0, 0, {...}] command tuple
  const lineVals = lines.map(line => {
    const vals: Record<string, unknown> = {
      name: line.name,
      quantity: line.quantity,
      price_unit: line.price_unit,
    };
    if (line.product_id) {
      vals.product_id = line.product_id;
    }
    if (line.tax_ids?.length) {
      // Odoo expects tax_ids as [[6, 0, [tax_ids]]]
      vals.tax_ids = [[6, false, line.tax_ids]];
    }
    return vals;
  });

  // Create invoice (move_type: out_invoice = customer invoice)
  // Each line needs its own create command: [0, 0, {vals}], [0, 1, {vals}], etc.
  const invoiceId = await jsonrpcCallKw('account.move', 'create', [{
    move_type: 'out_invoice',
    partner_id: partnerId,
    ref: reference || `Stripe Payment`,
    invoice_line_ids: lineVals.map((vals, i) => [0, i, vals]),
  }]) as number;

  // Post the invoice
  await jsonrpcCallKw('account.move', 'action_post', [[invoiceId]]);

  console.log(`[ODOO] Created & posted invoice ${invoiceId} for partner ${partnerId}`);
  return invoiceId;
}

/**
 * Create a DRAFT customer invoice in Odoo (does NOT post).
 * Used when checkout starts — invoice is posted + reconciled when payment succeeds.
 */
export async function createOdooDraftInvoice(
  partnerId: number,
  lines: OdooInvoiceLine[],
  reference?: string
): Promise<number> {
  const lineVals = lines.map(line => {
    const vals: Record<string, unknown> = {
      name: line.name,
      quantity: line.quantity,
      price_unit: line.price_unit,
    };
    if (line.product_id) {
      vals.product_id = line.product_id;
    }
    if (line.tax_ids?.length) {
      vals.tax_ids = [[6, false, line.tax_ids]];
    }
    return vals;
  });

  const invoiceId = await jsonrpcCallKw('account.move', 'create', [{
    move_type: 'out_invoice',
    partner_id: partnerId,
    ref: reference || `Stripe Payment`,
    invoice_line_ids: lineVals.map((vals, i) => [0, i, vals]),
  }]) as number;

  console.log(`[ODOO] Created DRAFT invoice ${invoiceId} for partner ${partnerId}`);
  return invoiceId;
}

// In-memory map: checkout session id → draft invoice id
// Used by webhook to find the right invoice to post + reconcile
const _checkoutInvoiceMap = new Map<string, number>();

export function registerDraftInvoice(sessionId: string, invoiceId: number) {
  _checkoutInvoiceMap.set(sessionId, invoiceId);
}

export function getDraftInvoice(sessionId: string): number | undefined {
  return _checkoutInvoiceMap.get(sessionId);
}

/**
 * Reconcile a Stripe payment with an Odoo invoice.
 * Handles the case where Odoo created the account.payment but didn't reconcile,
 * AND the case where Odoo didn't create account.payment at all (creates it first).
 */
export async function reconcileStripePaymentWithInvoice(
  invoiceId: number,
  partnerId: number,
  amount: number,
  stripePaymentReference: string,
  saleReference?: string,
  partnerName?: string
): Promise<{ payment_id: number; invoice_id: number }> {
  // Step 1: Try to find existing account.payment by memo (where Odoo stores Stripe PI)
  // memo format: "S{sale_ref} - {partner} - {stripe_pi}"
  let payments = (await jsonrpcCallKw('account.payment', 'search_read', [
    [['memo', 'ilike', stripePaymentReference]],
    ['id', 'state', 'amount', 'memo', 'is_reconciled'],
  ])) as Array<{ id: number; state: string; amount: number; memo: string; is_reconciled: boolean }>;

  // Also try searching by sale reference in memo
  if (!payments.length && saleReference) {
    payments = (await jsonrpcCallKw('account.payment', 'search_read', [
      [['memo', 'ilike', saleReference]],
      ['id', 'state', 'amount', 'memo', 'is_reconciled'],
    ])) as Array<{ id: number; state: string; amount: number; memo: string; is_reconciled: boolean }>;
  }

  let paymentId: number;

  if (payments.length > 0) {
    // Use the first matching payment
    paymentId = payments[0].id;
    console.log(`[ODOO] Found payment ${paymentId} (${payments[0].memo}) for ref ${stripePaymentReference}`);

    // If already reconciled, nothing to do
    if (payments[0].is_reconciled) {
      console.log(`[ODOO] Payment ${paymentId} already reconciled, skipping`);
      return { payment_id: paymentId, invoice_id: invoiceId };
    }
  } else {
    // Odoo didn't create account.payment — create it ourselves
    console.log(`[ODOO] No account.payment found for ${stripePaymentReference}, creating it`);

    // Build memo similar to Odoo's format: "S{sale_ref} - {partner} - {stripe_pi}"
    const memoParts = [saleReference || 'Stripe'];
    if (partnerName) memoParts.push(partnerName);
    memoParts.push(stripePaymentReference);
    const memo = memoParts.join(' - ');

    paymentId = (await jsonrpcCallKw('account.payment', 'create', [{
      payment_type: 'inbound',
      partner_type: 'customer',
      partner_id: partnerId,
      amount,
      currency_id: 143, // GBP
      journal_id: 34, // Stripe Online Payments
      memo,
    }])) as number;

    console.log(`[ODOO] Created account.payment ${paymentId} with memo: ${memo}`);

    // Post the payment
    await jsonrpcCallKw('account.payment', 'action_post', [[paymentId]]);
    console.log(`[ODOO] Posted payment ${paymentId}`);
  }

  // Step 2: Find the invoice's receivable line (amount_residual > 0, positive)
  const invoiceLines = (await jsonrpcCallKw('account.move.line', 'search_read', [
    [['move_id', '=', invoiceId], ['account_id', '=', 69]], // 69 = Debtors Control Account
    ['id', 'amount_residual', 'reconciled'],
  ])) as Array<{ id: number; amount_residual: number; reconciled: boolean }>;

  const invoiceReceivable = invoiceLines.find(l => !l.reconciled && l.amount_residual > 0);

  // Step 3: Find the payment's receivable line (amount_residual < 0, negative)
  const paymentLines = (await jsonrpcCallKw('account.move.line', 'search_read', [
    [['payment_id', '=', paymentId], ['account_id', '=', 69]],
    ['id', 'amount_residual', 'reconciled'],
  ])) as Array<{ id: number; amount_residual: number; reconciled: boolean }>;

  const paymentReceivable = paymentLines.find(l => !l.reconciled && l.amount_residual < 0);

  // Step 4: Reconcile the two lines
  // Handle case where Odoo created payment but reconciled it to wrong account
  // (is_reconciled=true but invoice's receivable line is NOT reconciled — need new payment)
  if (invoiceReceivable && paymentReceivable) {
    await jsonrpcCallKw('account.move.line', 'action_reconcile', [
      [invoiceReceivable.id, paymentReceivable.id],
    ]);
    console.log(`[ODOO] Reconciled invoice line ${invoiceReceivable.id} with payment line ${paymentReceivable.id}`);
  } else if (invoiceReceivable && !paymentReceivable) {
    // Payment exists but its debtors line is reconciled to wrong account (Odoo bug)
    // Create a new corrected payment and reconcile it
    console.log(`[ODOO] Existing payment ${paymentId} reconciled to wrong account — creating corrected payment`);
    const newPmtId = (await jsonrpcCallKw('account.payment', 'create', [{
      payment_type: 'inbound',
      partner_type: 'customer',
      partner_id: partnerId,
      amount,
      journal_id: 34, // Stripe Online Payments
      memo: `Corrected ${stripePaymentReference} for INV ${invoiceId}`,
    }])) as number;
    await jsonrpcCallKw('account.payment', 'action_post', [[newPmtId]]);

    const newPmtLines = (await jsonrpcCallKw('account.move.line', 'search_read', [
      [['payment_id', '=', newPmtId], ['account_id', '=', 69]],
      ['id'],
    ])) as Array<{ id: number }>;
    if (newPmtLines.length > 0) {
      await jsonrpcCallKw('account.move.line', 'action_reconcile', [[invoiceReceivable.id, newPmtLines[0].id]]);
      console.log(`[ODOO] Reconciled with corrected payment ${newPmtId}`);
      paymentId = newPmtId;
    }
  } else if (!invoiceReceivable) {
    console.log(`[ODOO] Invoice ${invoiceId} already reconciled`);
  } else {
    console.warn('[ODOO] Could not reconcile — lines not found', {
      invoiceLine: invoiceReceivable?.id,
      paymentLine: paymentReceivable?.id,
    });
  }

  // Step 5: Post Stripe payment confirmation message to invoice and sales order chatters
  const paymentMsg = `Stripe payment of ${amount.toFixed(2)} confirmed${saleReference ? ` (Ref: ${saleReference})` : ''}. Transaction: ${stripePaymentReference}`;
  const stripePaymentRef = stripePaymentReference.startsWith('pi_') ? stripePaymentReference : `pi_${stripePaymentReference}`;

  try {
    // Use mail.message.create to post to invoice chatter
    await jsonrpcCallKw('mail.message', 'create', [{
      body: paymentMsg,
      model: 'account.move',
      res_id: invoiceId,
      message_type: 'notification',
    }]);
    console.log(`[ODOO] Posted payment message to invoice ${invoiceId}`);
  } catch (e: unknown) {
    console.warn(`[ODOO] Could not post message to invoice chatter: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (saleReference) {
    try {
      const saleOrders = (await jsonrpcCallKw('sale.order', 'search_read', [
        [['name', '=', saleReference]],
        ['id'],
      ])) as Array<{ id: number }>;

      if (saleOrders.length > 0) {
        await jsonrpcCallKw('mail.message', 'create', [{
          body: `Payment confirmed via Stripe. Transaction reference ${stripePaymentRef} for ${amount.toFixed(2)}.`,
          model: 'sale.order',
          res_id: saleOrders[0].id,
          message_type: 'notification',
        }]);
        console.log(`[ODOO] Posted payment message to sales order ${saleReference}`);
      }
    } catch (e: unknown) {
      console.warn(`[ODOO] Could not post message to sales order chatter: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { payment_id: paymentId, invoice_id: invoiceId };
}

// ─── Pricelist ────────────────────────────────────────────────────────────────

// The rule types and the engine itself live in lib/pricelist.ts, which is pure
// so it can be unit-tested. Re-exported here because this module used to own
// them and callers import from it.
export type { PricelistItem, PricelistInfo };
export { applyPricelist };

export async function getPartnerPricelist(uid: number, _password: string): Promise<PricelistInfo | null> {
  try {
    if (!uid || uid <= 0) return null;
    // Get partner's assigned pricelist
    const users = await jsonrpcCallKw('res.users', 'read', [[uid]], {
      fields: ['partner_id'],
    }) as { partner_id: [number, string] } | null;
    if (!users) return null;

    const partnerId = users.partner_id?.[0];
    if (!partnerId) return null;

    const partners = await jsonrpcCallKw('res.partner', 'read', [[partnerId]], {
      fields: ['property_product_pricelist'],
    }) as { property_product_pricelist: [number, string] | false } | null;

    const plEntry = partners?.property_product_pricelist;
    if (!plEntry || !plEntry[0]) return null;

    const plId = plEntry[0];

    // The order is load-bearing: applyPricelist takes the first matching rule and
    // trusts this to be Odoo's own precedence. The limit has to clear the largest
    // list in the database — FT-Partners A.P.S has 747 rules, and the old 500
    // silently dropped 247 of them.
    const items = await jsonrpcCallKw('product.pricelist.item', 'search_read', [
      [['pricelist_id', '=', plId]],
      PRICELIST_ITEM_FIELDS,
    ], {
      limit: 2000,
      order: PRICELIST_ITEM_ORDER,
      context: {},
    }) as PricelistItem[];

    return {
      id: plId,
      name: plEntry[1],
      currency: 'GBP',
      items: items || [],
    };
  } catch {
    return null;
  }
}

/**
 * Resolve each category id to its ancestry chain, leaf-first: the category itself,
 * then parent, grandparent, … Uses product.category.parent_path (e.g. "1/7/23/").
 * Returns a map of categoryId → [leaf, …, root].
 */
export async function getCategoryAncestries(categIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  const ids = [...new Set(categIds.filter(id => id > 0))];
  if (!ids.length) return map;
  try {
    const cats = await jsonrpcCallKw('product.category', 'read', [ids], {
      fields: ['parent_path'],
    }) as { id: number; parent_path?: string }[] | { id: number; parent_path?: string } | null;
    const rows = Array.isArray(cats) ? cats : cats ? [cats] : [];
    for (const c of rows) {
      // parent_path "1/7/23/" → [23, 7, 1] (leaf-first)
      const chain = (c.parent_path || '').split('/').filter(Boolean).map(Number).reverse();
      map.set(c.id, chain.length ? chain : [c.id]);
    }
  } catch { /* no ancestry → category-level rules simply won't match */ }
  return map;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A copy of a cached product that applyPricelistToProducts can safely mutate.
 *
 * Product caches are keyed without the partner, so anything the pricelist writes
 * must land on a copy or the next partner inherits it. A plain spread is not
 * enough: `variant_ids` is an array of shared objects and per-variant prices are
 * written into them. Use this everywhere rather than hand-rolling the spread.
 */
export function copyForPricing<T extends Record<string, unknown>>(product: T): T {
  const copy = { ...product };
  if (Array.isArray(copy.variant_ids)) {
    (copy as Record<string, unknown>).variant_ids =
      copy.variant_ids.map(v => (v && typeof v === 'object' ? { ...(v as Record<string, unknown>) } : v));
  }
  return copy;
}

/** The partner's pricelist, cached per uid — it is stable for minutes. */
export async function getPartnerPricelistCached(uid: number, password = ''): Promise<PricelistInfo | null> {
  if (!uid || uid <= 0) return null;
  const plKey = `pricelist:${uid}`;
  const cached = cacheGet<PricelistInfo | null>(plKey);
  if (cached) return cached;
  const pricelist = await getPartnerPricelist(uid, password);
  cacheSet(plKey, pricelist, TTL.PRODUCTS);
  return pricelist;
}

/**
 * Overlay the logged-in partner's pricelist onto a batch of product cards, IN PLACE.
 * Sets each product's `list_price` to the partner's price and keeps the pre-pricelist
 * value in `original_price` so the UI can strike through a cheaper deal.
 *
 * Also prices `variant_ids[]` where present. Most of the paint range sells by size,
 * and a large share of the negotiated rules in Odoo are variant-level
 * ('0_product_variant') — pricing only the template left those customers on public
 * prices in the size selector and, through it, in the basket.
 *
 * CALLERS MUST PASS A COPY. Product objects come out of a partner-agnostic cache;
 * mutating a cached object — including anything inside `variant_ids` — leaks one
 * partner's negotiated prices to every other partner.
 */
export async function applyPricelistToProducts(
  uid: number,
  password: string,
  products: Record<string, unknown>[]
): Promise<void> {
  if (!uid || uid <= 0 || !products.length) return;

  const pricelist = await getPartnerPricelistCached(uid, password);
  if (!pricelist || !pricelist.items.length) return;

  // Category ancestry for every distinct leaf category in the batch.
  const leafCatIds: number[] = [];
  for (const p of products) {
    const c = p.categ_id;
    if (Array.isArray(c) && typeof c[0] === 'number') leafCatIds.push(c[0]);
  }
  const ancestryByCat = await getCategoryAncestries(leafCatIds);

  for (const p of products) {
    const tmplId = typeof p.id === 'number' ? p.id : Number(p.id);
    if (!tmplId) continue;
    const existing = typeof p.list_price === 'number' ? p.list_price : 0;
    // Base = the true list price (pre special/pricelist). Mobile keeps the regular
    // price in original_price; JSON-RPC paths only carry list_price.
    const base = typeof p.original_price === 'number' ? p.original_price : existing;
    const cost = typeof p.standard_price === 'number' ? p.standard_price : 0;
    const cat = Array.isArray(p.categ_id) && typeof p.categ_id[0] === 'number' ? p.categ_id[0] : 0;
    const ancestry = cat ? (ancestryByCat.get(cat) || [cat]) : [];

    const { price, rule } = applyPricelist(pricelist, {
      tmplId, variantId: null, listPrice: base, costPrice: cost, categAncestry: ancestry,
    });
    p.original_price = base;
    // Only override when the pricelist actually moved the price. A rule can match
    // and land straight back on the list price — every tier's winning global rule
    // is "0 % discount on sales price", which does exactly that — and overriding
    // then would wipe out a promotional special_price for no reason.
    p.list_price = rule && price !== base ? round2(price) : existing;

    if (!Array.isArray(p.variant_ids)) continue;
    for (const raw of p.variant_ids) {
      const v = raw as Record<string, unknown>;
      const variantId = typeof v.id === 'number' ? v.id : Number(v.id);
      if (!variantId) continue;
      const vExisting = typeof v.price === 'number' ? v.price : 0;
      const vBase = typeof v.original_price === 'number' ? v.original_price : vExisting;
      // Falls back to the template's cost: only cost-based formula rules need it,
      // and getProductById reads per-variant standard_price where it can.
      const vCost = typeof v.standard_price === 'number' ? v.standard_price : cost;

      const priced = applyPricelist(pricelist, {
        tmplId, variantId, listPrice: vBase, costPrice: vCost, categAncestry: ancestry,
      });
      v.original_price = vBase;
      v.price = priced.rule && priced.price !== vBase ? round2(priced.price) : vExisting;
    }
  }
}
