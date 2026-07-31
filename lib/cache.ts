/**
 * Simple in-memory cache with TTL
 * Prevents hammering Odoo on every request
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlSeconds: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export function cacheDelete(pattern: string): void {
  for (const key of store.keys()) {
    if (key.includes(pattern)) store.delete(key);
  }
}

// TTL constants
export const TTL = {
  PRODUCTS: 300,      // 5 min — product list
  PRODUCT: 600,       // 10 min — single product
  CATEGORIES: 3600,   // 1 hour — categories/brands rarely change
  ALWAYS_IN_STOCK: 3600, // 1 hour — which products sit in the made-in-house category
  ORDERS: 60,         // 1 min — orders
  INVOICES: 120,      // 2 min — invoices
  BUY_AGAIN: 300,     // 5 min — purchase history (several Odoo round-trips)
  SESSION: 30,        // 30 sec — session/auth
  PARTNER: 300,       // 5 min — uid → partner/commercial id (rarely changes)
};
