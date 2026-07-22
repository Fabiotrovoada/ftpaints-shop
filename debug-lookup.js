// Debug lookup for S02560 in Odoo
const https = require('https');

const ODOO_URL = 'https://www.ftpaints.co.uk';
const ODOO_DB = 'techultra-ftpaint-techultra-production-16252997';
const ODOO_ADMIN_EMAIL = 'fabio@ftpaints.co.uk';
const ODOO_ADMIN_PASSWORD = 'Viegas1995!';

function jsonrpcCallKw(model, method, args, kwargs = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      id: Math.floor(Math.random() * 1000000),
      params: {
        service: 'object',
        method: 'execute',
        args: [ODOO_DB, 2, ODOO_ADMIN_PASSWORD, model, method, ...args]
      }
    });

    const parsed = new URL(ODOO_URL + '/jsonrpc');
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: '/jsonrpc',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function lookup() {
  // Get S02560 sale order
  const orders = await jsonrpcCallKw('sale.order', 'search_read', [
    [['name', '=', 'S02560']],
    ['id', 'name', 'state', 'partner_id', 'invoice_status', 'amount_total']
  ]);
  console.log('Sale Order S02560:', JSON.stringify(orders.result, null, 2));

  // Get invoices for this order
  const invoices = await jsonrpcCallKw('account.move', 'search_read', [
    [['invoice_origin', '=', 'S02560']],
    ['id', 'name', 'state', 'move_type', 'payment_state', 'amount_total', 'amount_residual', 'ref']
  ]);
  console.log('\nInvoices for S02560:', JSON.stringify(invoices.result, null, 2));

  // Check payment transactions
  const stripeTxs = await jsonrpcCallKw('payment.transaction', 'search_read', [
    [],
    ['id', 'reference', 'amount', 'state', 'provider_reference', 'partner_id']
  ], { order: 'id desc', limit: 10 });
  console.log('\nRecent payment transactions:', JSON.stringify(stripeTxs.result, null, 2));

  // Check account moves with references containing S02560 or INV/2026/01424
  const moves = await jsonrpcCallKw('account.move', 'search_read', [
    [['ref', 'like', '%S02560%']],
    ['id', 'name', 'ref', 'state', 'payment_state']
  ]);
  console.log('\nAccount moves with S02560 ref:', JSON.stringify(moves.result, null, 2));
}

lookup().catch(e => console.error('Error:', e.message));
