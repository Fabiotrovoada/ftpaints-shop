/**
 * Odoo sale.order state → the label/colour the portal shows.
 * Shared by the orders list and the order detail page — a page file cannot
 * export a helper of its own under the App Router.
 */
const STATE_META: Record<string, { label: string; className: string }> = {
  draft:  { label: '📋 Quotation', className: 'bg-yellow-100 text-yellow-700' },
  sent:   { label: '📤 Sent',      className: 'bg-orange-100 text-orange-700' },
  sale:   { label: '✅ Confirmed', className: 'bg-green-100 text-green-700' },
  done:   { label: '📦 Complete',  className: 'bg-blue-100 text-blue-700' },
  cancel: { label: '❌ Cancelled', className: 'bg-gray-100 text-gray-500' },
};

export function stateBadge(state: string): { label: string; className: string } {
  return STATE_META[state] ?? { label: state, className: 'bg-gray-100 text-gray-600' };
}

export const ORDER_FILTERS = [
  { key: 'all', label: 'All', states: [] as string[] },
  { key: 'quotes', label: 'Quotations', states: ['draft', 'sent'] },
  { key: 'confirmed', label: 'Confirmed', states: ['sale'] },
  { key: 'complete', label: 'Complete', states: ['done'] },
  { key: 'cancelled', label: 'Cancelled', states: ['cancel'] },
];
