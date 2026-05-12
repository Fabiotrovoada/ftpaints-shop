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
  return data.result !== undefined ? data.result : data;
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
  if (method === 'read' && Array.isArray(data.result)) return data.result[0] || null;
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
  variant_ids?: Array<{ id: number; name: string; price?: number }>;
  type?: string;
  barcode?: string;
  offer?: string;
  shipping?: string;
  overall_rating?: number;
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

// ─── Products (Mobile API) ────────────────────────────────────────────────────

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
  const page = Math.floor((options.offset || 0) / limit) + 1;

  let rawProducts: MobileProduct[] = [];
  let total = 0;

  if (options.search) {
    const result = (await mobileGet(`/api/v1/search/${page}`, admin, {
      search_term: options.search,
      ...(options.inStockOnly ? { show_in_stock_only: true } : {}),
    })) as { products?: MobileProduct[]; itemCount?: number };
    rawProducts = result?.products || [];
    total = result?.itemCount ?? rawProducts.length;
  } else {
    const filterBy: Record<string, unknown> = {};
    if (options.categoryId) filterBy.categ_id = options.categoryId;

    const result = (await mobileGet(`/api/v1/all_product_template/${page}`, admin, {
      filter_by: filterBy,
      ...(options.inStockOnly ? { available_in_stock: true } : {}),
    })) as { product_templates?: MobileProduct[]; itemCount?: number };

    rawProducts = result?.product_templates || [];
    total = result?.itemCount ?? rawProducts.length;
  }

  let products = rawProducts.map(normalizeMobileProduct);

  // Trust the Mobile API's available_in_stock / show_in_stock_only filter.
  // If a product appears in the results, it has qty_available > 0.
  // (We no longer override itemCount with a client-side filter.)

  return { products, total };
}

export async function getProductById(_uid: number, _password: string, id: number) {
  const admin = await getAdminToken();
  const result = (await mobileGet(`/api/v1/product_template/${id}`, admin)) as {
    product_template?: MobileProduct;
    success?: boolean;
  } | null;
  const product = result?.product_template;
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

// ─── Orders ───────────────────────────────────────────────────────────────────

export async function getSaleOrders(_uid: number, _password: string, partnerId: number): Promise<Record<string, unknown>[]> {
  try {
    // Include all states: draft=Quotation, sent=Quotation Sent, sale=Confirmed, done=Done, cancel=Cancelled
    return (await jsonrpcCallKw('sale.order', 'search_read', [
      [['partner_id', '=', partnerId]],
    ], {
      fields: ['id', 'name', 'date_order', 'amount_total', 'state', 'order_line', 'note'],
      order: 'date_order desc', limit: 100,
    })) as Record<string, unknown>[] ?? [];
  } catch { return []; }
}

export async function getSaleOrderLines(_uid: number, _password: string, orderId: number) {
  try {
    return await jsonrpcCallKw('sale.order.line', 'search_read', [
      [['order_id', '=', orderId]],
    ], { fields: ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'name'] });
  } catch { return []; }
}

export async function createSaleOrder(
  _uid: number, _password: string, partnerId: number,
  lines: Array<{ productId: number; qty: number; price: number }>, note?: string
) {
  const orderLines = lines.map((l) => [0, 0, {
    product_id: l.productId, product_uom_qty: l.qty, price_unit: l.price,
  }]);
  return await jsonrpcCallKw('sale.order', 'create', [{
    partner_id: partnerId, order_line: orderLines, note: note || '',
  }]) as number;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

export async function getInvoices(_uid: number, _password: string, partnerId: number): Promise<Record<string, unknown>[]> {
  try {
    return (await jsonrpcCallKw('account.move', 'search_read', [
      [['partner_id', '=', partnerId], ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
    ], {
      fields: ['id', 'name', 'invoice_date', 'invoice_date_due', 'amount_total',
               'amount_residual', 'payment_state', 'state'],
      order: 'invoice_date desc', limit: 50,
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

// ─── Pricelist ────────────────────────────────────────────────────────────────

export interface PricelistItem {
  id: number;
  compute_price: 'fixed' | 'percentage' | 'formula';
  price_discount: number;      // for formula/percentage
  percent_price: number;       // for percentage type (0-100 discount)
  applied_on: '0_product_variant' | '1_product' | '2_product_category' | '3_global';
  product_tmpl_id: [number, string] | false;
  product_id: [number, string] | false;
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
    ], {
      fields: ['compute_price', 'percent_price', 'price_discount', 'applied_on',
               'product_tmpl_id', 'product_id', 'min_quantity', 'base', 'price',
               'date_start', 'date_end'],
      limit: 500,
      order: 'applied_on asc, min_quantity desc',
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
 */
export function applyPricelist(
  pricelist: PricelistInfo,
  productTmplId: number,
  listPrice: number,
  costPrice: number,
  qty: number = 1
): number {
  const items = pricelist.items;

  // Priority: variant > template > global
  // Find best matching rule
  const candidates = items.filter(item => {
    if (item.min_quantity > qty) return false;
    if (item.applied_on === '0_product_variant') return false; // skip variant-level for now (no variant id)
    if (item.applied_on === '1_product') return item.product_tmpl_id && item.product_tmpl_id[0] === productTmplId;
    if (item.applied_on === '3_global') return true;
    return false;
  });

  // Sort: more specific first (template > global), then higher qty first
  candidates.sort((a, b) => {
    const priority = { '1_product': 0, '3_global': 1 };
    const pa = priority[a.applied_on as '1_product'|'3_global'] ?? 2;
    const pb = priority[b.applied_on as '1_product'|'3_global'] ?? 2;
    if (pa !== pb) return pa - pb;
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
