// Demo data for testing the portal without live Odoo calls

export const DEMO_PRODUCTS = [
  { id: 1001, name: 'Novol GRAVIT 630 300ml', default_code: '300000012', list_price: 11.68, standard_price: 5.31, qty_available: 48, virtual_available: 48, categ_id: [1, 'Body Fillers & Sealants'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1002, name: 'Evercoat Rage Ultra 3LT', default_code: '101341', list_price: 47.44, standard_price: 35.41, qty_available: 12, virtual_available: 12, categ_id: [1, 'Body Fillers & Sealants'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1003, name: '3M FFA1P2 Reusable Half Mask', default_code: 'MMM.06941', list_price: 15.27, standard_price: 9.80, qty_available: 34, virtual_available: 34, categ_id: [2, 'PPE & Safety'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1004, name: 'PPG Deltron GRS UHS Hardener 2.5L', default_code: 'PPG.D8305/E2.5', list_price: 119.62, standard_price: 93.23, qty_available: 8, virtual_available: 8, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1005, name: 'Sikkens Autowave MM Tinter', default_code: 'SIK.525615', list_price: 96.39, standard_price: 72.30, qty_available: 0, virtual_available: 5, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1006, name: 'Fast Mover HVLP Spray Gun 1.3mm', default_code: 'HVLP01', list_price: 102.95, standard_price: 61.77, qty_available: 6, virtual_available: 6, categ_id: [4, 'Spray Guns & Equipment'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1007, name: 'Norton Multi-Air Pro A275 125mm P180', default_code: '63642563535', list_price: 49.70, standard_price: 31.64, qty_available: 156, virtual_available: 156, categ_id: [5, 'Abrasives'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1008, name: 'Jtape Fine Line Tape Orange', default_code: 'JTFLO', list_price: 4.62, standard_price: 2.80, qty_available: 200, virtual_available: 200, categ_id: [6, 'Masking & Tapes'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1009, name: 'U-Pol Raptor Epoxy Primer 1L', default_code: 'RAPTOR/EP', list_price: 28.50, standard_price: 18.20, qty_available: 22, virtual_available: 22, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1010, name: 'Mirka Abranet Ace 150mm P180 (50pk)', default_code: 'MIR.5424105018', list_price: 32.80, standard_price: 21.50, qty_available: 45, virtual_available: 45, categ_id: [5, 'Abrasives'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1011, name: 'Caslek 2K Primer Hardener 1L', default_code: 'PR2004-1L', list_price: 22.50, standard_price: 13.50, qty_available: 18, virtual_available: 18, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1012, name: 'Starchem 36" Masking Paper Roll', default_code: 'MP-36', list_price: 22.36, standard_price: 12.00, qty_available: 3, virtual_available: 3, categ_id: [6, 'Masking & Tapes'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1013, name: 'SATA Air Hose Blue 9mm 6m', default_code: 'SAT.50252', list_price: 66.31, standard_price: 44.50, qty_available: 9, virtual_available: 9, categ_id: [4, 'Spray Guns & Equipment'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1014, name: 'Devilbiss DV1-B HVLP Spray Gun', default_code: 'DV.703560', list_price: 485.00, standard_price: 320.00, qty_available: 2, virtual_available: 2, categ_id: [4, 'Spray Guns & Equipment'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1015, name: 'Anest Iwata W-400 Bellaria Spray Gun', default_code: '13328512P', list_price: 611.72, standard_price: 446.51, qty_available: 1, virtual_available: 1, categ_id: [4, 'Spray Guns & Equipment'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1016, name: 'Nexa HS Plus Hardener 2.5L', default_code: 'NEX.P210-8817/E2.5', list_price: 145.00, standard_price: 110.00, qty_available: 7, virtual_available: 7, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1017, name: '3M Scotch Masking Tape 18mm 50m', default_code: 'MMM.06304N', list_price: 24.61, standard_price: 15.80, qty_available: 80, virtual_available: 80, categ_id: [6, 'Masking & Tapes'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1018, name: 'Novol PROTECT 320 0.8L', default_code: '310003091', list_price: 15.16, standard_price: 8.86, qty_available: 35, virtual_available: 35, categ_id: [1, 'Body Fillers & Sealants'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1019, name: 'Luminous Yellow RAL 1026 1L', default_code: 'SFXB2001/1', list_price: 52.07, standard_price: 33.81, qty_available: 4, virtual_available: 4, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1020, name: 'Fast Mover Paper Paint Strainer 125µ', default_code: 'FMT5125', list_price: 17.69, standard_price: 9.83, qty_available: 120, virtual_available: 120, categ_id: [6, 'Masking & Tapes'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1021, name: 'Mipa 2K EP 950-10 Fast Hardener 5KG', default_code: '17550000', list_price: 80.14, standard_price: 56.04, qty_available: 6, virtual_available: 6, categ_id: [3, 'Paints & Clearcoats'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1022, name: 'Worksafe Safety Spectacles Clear', default_code: 'SSP66', list_price: 7.45, standard_price: 3.73, qty_available: 200, virtual_available: 200, categ_id: [2, 'PPE & Safety'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1023, name: 'Measuring Jug with Flexible Spout 5L', default_code: 'J5F', list_price: 24.95, standard_price: 12.48, qty_available: 14, virtual_available: 14, categ_id: [7, 'Workshop Accessories'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
  { id: 1024, name: 'CarTec Glass Cleaner Plus 1L', default_code: '1210/1', list_price: 8.50, standard_price: 4.20, qty_available: 28, virtual_available: 28, categ_id: [7, 'Workshop Accessories'] as [number,string], uom_id: [1, 'Units'] as [number,string], image_128: null, product_tag_ids: [] },
];

export const DEMO_ORDERS = [
  { id: 2001, name: 'S00001', date_order: '2026-03-15 10:30:00', amount_total: 284.50, state: 'sale' },
  { id: 2002, name: 'S00002', date_order: '2026-03-20 14:15:00', amount_total: 156.80, state: 'sale' },
  { id: 2003, name: 'S00003', date_order: '2026-03-25 09:00:00', amount_total: 522.30, state: 'done' },
  { id: 2004, name: 'S00004', date_order: '2026-02-28 11:45:00', amount_total: 98.40, state: 'done' },
  { id: 2005, name: 'S00005', date_order: '2026-02-10 16:20:00', amount_total: 1245.00, state: 'done' },
];

export const DEMO_INVOICES = [
  { id: 3001, name: 'INV/2026/00089', invoice_date: '2026-03-01', invoice_date_due: '2026-03-31', amount_total: 284.50, amount_residual: 284.50, payment_state: 'not_paid' },
  { id: 3002, name: 'INV/2026/00102', invoice_date: '2026-03-10', invoice_date_due: '2026-04-09', amount_total: 156.80, amount_residual: 156.80, payment_state: 'not_paid' },
  { id: 3003, name: 'INV/2026/00078', invoice_date: '2026-02-15', invoice_date_due: '2026-03-16', amount_total: 522.30, amount_residual: 100.00, payment_state: 'partial' },
  { id: 3004, name: 'INV/2026/00045', invoice_date: '2026-01-20', invoice_date_due: '2026-02-19', amount_total: 98.40, amount_residual: 0, payment_state: 'paid' },
  { id: 3005, name: 'INV/2026/00031', invoice_date: '2026-01-05', invoice_date_due: '2026-02-04', amount_total: 1245.00, amount_residual: 0, payment_state: 'paid' },
];

export const DEMO_CATEGORIES = [
  { id: 1, name: 'Body Fillers & Sealants', parent_id: false, complete_name: 'Body Fillers & Sealants' },
  { id: 2, name: 'PPE & Safety', parent_id: false, complete_name: 'PPE & Safety' },
  { id: 3, name: 'Paints & Clearcoats', parent_id: false, complete_name: 'Paints & Clearcoats' },
  { id: 4, name: 'Spray Guns & Equipment', parent_id: false, complete_name: 'Spray Guns & Equipment' },
  { id: 5, name: 'Abrasives', parent_id: false, complete_name: 'Abrasives' },
  { id: 6, name: 'Masking & Tapes', parent_id: false, complete_name: 'Masking & Tapes' },
  { id: 7, name: 'Workshop Accessories', parent_id: false, complete_name: 'Workshop Accessories' },
];

// Credit limit demo
export const DEMO_CREDIT = {
  limit: 2000,
  used: 541.30,
  onStop: false,
  paymentTerms: true,
  paymentTermName: '30 Days End of Month',
};

// Store credit (credit notes from refunds/returns) demo
export const DEMO_CREDIT_NOTES = [
  { id: 6001, name: 'RINV/2026/00007', invoice_date: '2026-03-18', amount_total: 45.00, amount_residual: 45.00 },
];
export const DEMO_STORE_CREDIT = {
  available: DEMO_CREDIT_NOTES.reduce((s, c) => s + c.amount_residual, 0),
  creditNotes: DEMO_CREDIT_NOTES,
};

export const DEMO_PROFILE = {
  name: 'Liam Rixon',
  email: 'demo@ftpaints.co.uk',
  phone: '024 7509 7860',
  mobile: '07700 900123',
  company: 'Rixon Accident Repair Ltd',
  address: 'Unit 12 Bishopgate Business Park, Coventry, CV1 4NA',
  vat: 'GB345267705',
  creditLimit: DEMO_CREDIT.limit,
  creditUsed: DEMO_CREDIT.used,
  paymentTermName: DEMO_CREDIT.paymentTermName,
};

export const DEMO_PAYMENTS = [
  { id: 4001, name: 'BNK1/2026/0031', date: '2026-02-20', amount: 98.40, ref: 'INV/2026/00045' },
  { id: 4002, name: 'BNK1/2026/0018', date: '2026-02-06', amount: 1245.00, ref: 'INV/2026/00031' },
  { id: 4003, name: 'BNK1/2026/0044', date: '2026-03-05', amount: 422.30, ref: 'Part payment INV/2026/00078' },
];

// Keyed by order id — mirrors what getSaleOrderLines returns for a real order.
export const DEMO_ORDER_LINES: Record<number, Array<{
  id: number; product_id: [number, string]; product_uom_qty: number;
  price_unit: number; price_subtotal: number; name: string;
}>> = {
  2001: [
    { id: 5001, product_id: [1001, 'Novol GRAVIT 630 300ml'], product_uom_qty: 12, price_unit: 11.68, price_subtotal: 140.16, name: 'Novol GRAVIT 630 300ml' },
    { id: 5002, product_id: [1003, '3M FFA1P2 Reusable Half Mask'], product_uom_qty: 4, price_unit: 15.27, price_subtotal: 61.08, name: '3M FFA1P2 Reusable Half Mask' },
    { id: 5003, product_id: [1008, 'Jtape Fine Line Tape Orange'], product_uom_qty: 18, price_unit: 4.62, price_subtotal: 83.16, name: 'Jtape Fine Line Tape Orange' },
  ],
  2002: [
    { id: 5004, product_id: [1007, 'Norton Multi-Air Pro A275 125mm P180'], product_uom_qty: 2, price_unit: 49.70, price_subtotal: 99.40, name: 'Norton Multi-Air Pro A275 125mm P180' },
    { id: 5005, product_id: [1020, 'Fast Mover Paper Paint Strainer 125µ'], product_uom_qty: 3, price_unit: 17.69, price_subtotal: 53.07, name: 'Fast Mover Paper Paint Strainer 125µ' },
  ],
  2003: [
    { id: 5006, product_id: [1004, 'PPG Deltron GRS UHS Hardener 2.5L'], product_uom_qty: 4, price_unit: 119.62, price_subtotal: 478.48, name: 'PPG Deltron GRS UHS Hardener 2.5L' },
    { id: 5007, product_id: [1022, 'Worksafe Safety Spectacles Clear'], product_uom_qty: 6, price_unit: 7.45, price_subtotal: 44.70, name: 'Worksafe Safety Spectacles Clear' },
  ],
  2004: [
    { id: 5008, product_id: [1024, 'CarTec Glass Cleaner Plus 1L'], product_uom_qty: 4, price_unit: 8.50, price_subtotal: 34.00, name: 'CarTec Glass Cleaner Plus 1L' },
    { id: 5009, product_id: [1023, 'Measuring Jug with Flexible Spout 5L'], product_uom_qty: 2, price_unit: 24.95, price_subtotal: 49.90, name: 'Measuring Jug with Flexible Spout 5L' },
  ],
  2005: [
    { id: 5010, product_id: [1015, 'Anest Iwata W-400 Bellaria Spray Gun'], product_uom_qty: 2, price_unit: 611.72, price_subtotal: 1223.44, name: 'Anest Iwata W-400 Bellaria Spray Gun' },
  ],
};
