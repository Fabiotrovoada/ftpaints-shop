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
      fields: ['name', 'email', 'phone', 'street', 'city', 'zip', 'country_id',
               'credit', 'credit_limit', 'property_payment_term_id'],
    })) as Record<string, unknown> | null;
  } catch { return null; }
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
      const variantStocksRaw = await jsonrpcCallKw('product.product', 'read', [variantIds], {
        fields: ['id', 'qty_available', 'virtual_available'],
      });
      // product.product read can return either an array or a dict keyed by id
      let stockMap: Map<number, { qty_available: number; virtual_available: number }>;
      if (Array.isArray(variantStocksRaw)) {
        stockMap = new Map((variantStocksRaw as Array<{ id: number; qty_available: number; virtual_available: number }>).map(s => [s.id, s]));
      } else {
        // Dict format: { "139022": { id, qty_available, ... }, ... }
        stockMap = new Map(Object.values(variantStocksRaw as Record<string, { id: number; qty_available: number; virtual_available: number }>).map(s => [s.id, s]));
      }
      console.log(`[DEBUG] Variant stocks for template ${id}:`, Array.from(stockMap.entries()).slice(0, 2));
      // Enrich each variant with its stock data
      normalized.variant_ids = normalized.variant_ids.map(v => {
        const stock = stockMap.get(v.id);
        if (stock) {
          return { ...v, qty_available: stock.qty_available, virtual_available: stock.virtual_available };
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

export async function getSaleOrders(_uid: number, _password: string, partnerId: number): Promise<Record<string, unknown>[]> {
  try {
    // Include all states: draft=Quotation, sent=Quotation Sent, sale=Confirmed, done=Done, cancel=Cancelled
    return (await jsonrpcCallKw('sale.order', 'search_read', [
      [['partner_id', '=', partnerId]],
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
async function getCommercialPartnerId(partnerId: number): Promise<number> {
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

export async function createSaleOrder(
  _uid: number, _password: string, partnerId: number,
  lines: Array<{ productId: number; qty: number; price: number; name?: string; colours?: Array<{ name?: string; code?: string; make?: string; model?: string; year?: string }>; colourName?: string; colourCode?: string }>,
  note?: string
): Promise<{ id: number; name: string }> {
  // Render one colour spec ("Colour: X, Colour code: Y, Vehicle: MAKE MODEL YEAR")
  // from a customer-entered colour/vehicle pair.
  const colourSpec = (c: { name?: string; code?: string; make?: string; model?: string; year?: string }) => [
    c.name ? `Colour: ${c.name.toUpperCase()}` : '',
    c.code ? `Colour code: ${c.code.toUpperCase()}` : '',
    [c.make, c.model, c.year].some(Boolean) ? `Vehicle: ${[c.make, c.model, c.year].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean).join(', ');
  const orderLines = lines.map((l) => {
    const line: Record<string, unknown> = {
      product_id: l.productId, product_uom_qty: l.qty, price_unit: l.price,
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
  const id = await jsonrpcCallKw('sale.order', 'create', [{
    partner_id: partnerId, order_line: orderLines, note: note || '',
  }]) as number;
  // Read back the human-friendly order reference (e.g. "S00123") for the
  // customer to quote — e.g. as a bank-transfer payment reference.
  let name = '';
  try {
    const rec = await jsonrpcCallKw('sale.order', 'read', [[id]], { fields: ['name'] }) as
      | { id: number; name: string }[] | { id: number; name: string } | null;
    const row = Array.isArray(rec) ? rec[0] : rec;
    name = row?.name || '';
  } catch { /* name is best-effort; id is authoritative */ }
  return { id, name };
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getInvoices(_uid: number, _password: string, partnerId: number): Promise<Record<string, unknown>[]> {
  try {
    return (await jsonrpcCallKw('account.move', 'search_read', [
      [['partner_id', '=', partnerId], ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
      ['id', 'name', 'invoice_date', 'invoice_date_due', 'amount_total',
       'amount_residual', 'payment_state', 'state'],
    ], {
      order: 'invoice_date desc',
      limit: 50,
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

export interface PricelistItem {
  id: number;
  compute_price: 'fixed' | 'percentage' | 'formula';
  price_discount: number;      // for formula/percentage
  percent_price: number;       // for percentage type (0-100 discount)
  applied_on: '0_product_variant' | '1_product' | '2_product_category' | '3_global';
  product_tmpl_id: [number, string] | false;
  product_id: [number, string] | false;
  categ_id: [number, string] | false;   // for '2_product_category' rules
  min_quantity: number;
  base: string;                // 'list_price', 'standard_price', 'pricelist'
  price: string;               // display string
}

export interface PricelistInfo {
  id: number;
  name: string;
  currency: string;
  items: PricelistItem[];
}

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

    // Fetch all pricelist items (usually <200 per pricelist)
    const items = await jsonrpcCallKw('product.pricelist.item', 'search_read', [
      [['pricelist_id', '=', plId]],
      ['compute_price', 'percent_price', 'price_discount', 'applied_on',
       'product_tmpl_id', 'product_id', 'categ_id', 'min_quantity', 'base', 'price',
       'date_start', 'date_end'],
    ], {
      limit: 500,
      order: 'applied_on asc, min_quantity desc',
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
 * Apply pricelist rules to a product's price.
 * Handles: fixed, percentage discount, formula (cost-based).
 *
 * Rule matching priority (Odoo order): product template > product category > global.
 * (Variant-level rules are skipped — we price at the template level.)
 *
 * `categAncestry` is the product's category chain, leaf-first (the product's own
 * category, then its parent, grandparent, …). A '2_product_category' rule applies
 * to a product whose category is the rule's category OR any descendant of it, so we
 * match when the rule's category id appears anywhere in this chain. When several
 * category rules match, the one nearest the leaf (smallest index) is the most
 * specific and wins.
 */
export function applyPricelist(
  pricelist: PricelistInfo,
  productTmplId: number,
  listPrice: number,
  costPrice: number,
  qty: number = 1,
  categAncestry: number[] = []
): number {
  const items = pricelist.items;

  // Depth of a category rule within the product's ancestry (leaf = 0 = most
  // specific). Non-category rules return 0; unmatched category rules are filtered out.
  const categDepth = (item: PricelistItem): number =>
    item.applied_on === '2_product_category' && item.categ_id
      ? categAncestry.indexOf(item.categ_id[0])
      : 0;

  // Priority: template > category > global. Find best matching rule.
  const candidates = items.filter(item => {
    if (item.min_quantity > qty) return false;
    if (item.applied_on === '0_product_variant') return false; // skip variant-level (no variant id)
    if (item.applied_on === '1_product') return item.product_tmpl_id && item.product_tmpl_id[0] === productTmplId;
    if (item.applied_on === '2_product_category') return !!item.categ_id && categAncestry.includes(item.categ_id[0]);
    if (item.applied_on === '3_global') return true;
    return false;
  });

  // Sort: more specific applied_on first, then (for category rules) nearest the
  // leaf category, then higher min-qty first.
  candidates.sort((a, b) => {
    const priority = { '1_product': 0, '2_product_category': 1, '3_global': 2 };
    const pa = priority[a.applied_on as keyof typeof priority] ?? 3;
    const pb = priority[b.applied_on as keyof typeof priority] ?? 3;
    if (pa !== pb) return pa - pb;
    const da = categDepth(a), db = categDepth(b);
    if (da !== db) return da - db;
    return b.min_quantity - a.min_quantity;
  });

  const rule = candidates[0];
  if (!rule) return listPrice;

  switch (rule.compute_price) {
    case 'fixed':
      // Fixed price from the price string e.g. "£ 33.50" — extract number
      return parseFloat(rule.price.replace(/[^0-9.]/g, '')) || listPrice;
    case 'percentage':
      // percent_price is the discount %
      return listPrice * (1 - (rule.percent_price || 0) / 100);
    case 'formula': {
      // price_discount is stored as negative markup (e.g. -25 means +25% on cost)
      const base = rule.base === 'standard_price' ? costPrice : listPrice;
      // price_discount: negative = markup (e.g. -25 = cost * 1.25)
      const discount = rule.price_discount || 0;
      if (discount < 0) {
        // It's a markup on cost: cost * (1 + abs(discount)/100)
        return base * (1 + Math.abs(discount) / 100);
      } else {
        // It's a discount on list: list * (1 - discount/100)
        return base * (1 - discount / 100);
      }
    }
    default:
      return listPrice;
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

/**
 * Overlay the logged-in partner's pricelist onto a batch of product cards, in place.
 * Sets each product's `list_price` to the partner's price when a rule matches, and
 * keeps the pre-pricelist value in `original_price` so the UI can strike-through a
 * cheaper deal. Leaves prices untouched when the partner has no pricelist or no rule
 * matches, so existing special prices are never clobbered.
 *
 * This includes category-level rules ('2_product_category'): a product inherits the
 * price of its own category or any ancestor category (most-specific wins).
 */
export async function applyPricelistToProducts(
  uid: number,
  password: string,
  products: Record<string, unknown>[]
): Promise<void> {
  if (!uid || uid <= 0 || !products.length) return;

  // Pricelist is per-partner and stable for minutes — cache it.
  const plKey = `pricelist:${uid}`;
  let pricelist = cacheGet<PricelistInfo | null>(plKey);
  if (!pricelist) {
    pricelist = await getPartnerPricelist(uid, password);
    cacheSet(plKey, pricelist, TTL.PRODUCTS);
  }
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

    const priced = applyPricelist(pricelist, tmplId, base, cost, 1, ancestry);
    p.original_price = base;
    // Only override when the pricelist actually produced a different price, so a
    // no-match (priced === base) preserves any existing special price.
    p.list_price = priced !== base ? Math.round(priced * 100) / 100 : existing;
  }
}
