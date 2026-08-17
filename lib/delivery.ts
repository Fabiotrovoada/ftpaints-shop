// Single source of truth for delivery pricing, shared by the checkout UI and
// the server-side charge calculation — a client-only copy is what let card
// checkout charge £0 delivery regardless of the method picked.
export const DELIVERY_PRICING: Record<string, { price: number; freeOver: number | null }> = {
  van: { price: 0, freeOver: null },
  standard: { price: 0, freeOver: 50 },
  next_day: { price: 9.95, freeOver: null },
  express: { price: 14.95, freeOver: null },
  collection: { price: 0, freeOver: null },
};

export function deliveryCost(methodId: string, subtotal: number): number {
  const m = DELIVERY_PRICING[methodId];
  if (!m) return 0;
  if (m.freeOver !== null && subtotal >= m.freeOver) return 0;
  return m.price;
}
