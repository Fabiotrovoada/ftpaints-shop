/**
 * Shared shapes for the account area. These mirror what the `/api/account/*`
 * route handlers return, which is a trimmed-down view of the Odoo records —
 * not the raw Odoo fields.
 */

export interface Order {
  id: number;
  name: string;
  date_order: string;
  amount_total: number;
  state: string;
}

export interface OrderLine {
  id: number;
  /** [id, display_name] from Odoo, or false on a section/note line. */
  product_id: [number, string] | false;
  product_uom_qty: number;
  price_unit: number;
  price_subtotal: number;
  name: string;
}

export interface Invoice {
  id: number;
  name: string;
  invoice_date: string;
  invoice_date_due: string;
  amount_total: number;
  amount_residual: number;
  payment_state: string;
}

export interface Payment {
  id: number;
  name: string;
  date: string;
  amount: number;
  ref: string | false;
}

/** One line of the merged invoice/payment ledger, with a running balance. */
export interface StatementRow {
  kind: 'invoice' | 'payment';
  id: number;
  date: string;
  reference: string;
  /** Invoices debit the account, payments credit it. */
  debit: number;
  credit: number;
  balance: number;
  /** Invoices only — drives the overdue highlight and the aged-debt buckets. */
  dueDate?: string;
  outstanding?: number;
}

export interface StatementTotals {
  invoiced: number;
  paid: number;
  outstanding: number;
  /** Aged debt, bucketed by days past `invoice_date_due`. */
  aged: { current: number; d30: number; d60: number; d90: number };
}

export interface Profile {
  name: string;
  email: string;
  phone: string;
  mobile: string;
  company: string;
  address: string;
  vat: string;
  creditLimit: number;
  creditUsed: number;
  paymentTermName: string | null;
}

/** Editable subset of Profile — the only fields `PATCH /api/account/profile` accepts. */
export type ProfileUpdate = Partial<Pick<Profile, 'name' | 'phone' | 'mobile'>>;

export interface CreditInfo {
  limit: number;
  used: number;
  onStop: boolean;
  paymentTerms?: boolean;
  paymentTermName?: string | null;
}

/** A posted credit note (refund/return) — not to be confused with CreditInfo,
 *  which is the trade credit limit. */
export interface CreditNote {
  id: number;
  name: string;
  invoice_date: string;
  amount_total: number;
  amount_residual: number;
}

export interface StoreCreditInfo {
  available: number;
  creditNotes: CreditNote[];
}
