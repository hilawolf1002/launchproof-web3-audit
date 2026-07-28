'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { auditUrl } = require('./lib/audit');
const { fulfillOrder } = require('./lib/report');
const { isValidTxHash, verifyUsdtPayment, WALLET } = require('./lib/tron-verify');

const PORT = process.env.PORT || 8899;
const PUBLIC = path.join(__dirname, 'public');
const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');

const PRICING = {
  report: { usdt: 29, label: 'Full Trust Report' },
  priority: { usdt: 99, label: 'Priority Human Review' },
};

const rateMap = new Map();
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60000;

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

function clientIp(req) {
  return (req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function rateLimit(req) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 8192) {
        reject(new Error('Body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readOrders() {
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function serveStatic(req, res) {
  let filePath = req.url.split('?')[0];
  if (filePath === '/') filePath = '/index.html';
  const full = path.join(PUBLIC, filePath);
  if (!full.startsWith(PUBLIC)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
    };
    res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (!rateLimit(req)) {
    json(res, 429, { error: 'Too many requests' });
    return;
  }

  const url = req.url.split('?')[0];

  if (url === '/api/health' && req.method === 'GET') {
    json(res, 200, { ok: true, service: 'LaunchProof', wallet: WALLET });
    return;
  }

  if (url === '/api/pricing' && req.method === 'GET') {
    json(res, 200, { pricing: PRICING, wallet: WALLET, network: 'TRC20 USDT' });
    return;
  }

  if (url === '/api/scan' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.url) {
        json(res, 400, { error: 'URL required' });
        return;
      }
      const result = await auditUrl(body.url);
      json(res, 200, {
        preview: {
          url: result.url,
          score: result.score,
          maxScore: result.maxScore,
          percentage: result.percentage,
          grade: result.grade,
          scannedAt: result.scannedAt,
          passed: result.checks.filter((c) => c.pass).length,
          total: result.checks.length,
          topIssues: result.checks
            .filter((c) => !c.pass && c.weight >= 7)
            .slice(0, 5)
            .map((c) => ({ label: c.label, detail: c.detail })),
        },
        fullAvailable: true,
      });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  if (url === '/api/order' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const { plan, url: siteUrl, contact, txHash } = body;
      if (!plan || !PRICING[plan]) {
        json(res, 400, { error: 'Invalid plan' });
        return;
      }
      if (!siteUrl || !contact) {
        json(res, 400, { error: 'URL and contact required' });
        return;
      }

      const order = {
        id: 'LP-' + Date.now().toString(36).toUpperCase(),
        plan,
        price: PRICING[plan].usdt,
        url: siteUrl,
        contact,
        txHash: null,
        status: 'awaiting_payment',
        createdAt: new Date().toISOString(),
      };

      if (txHash) {
        if (!isValidTxHash(txHash)) {
          json(res, 400, { error: 'Invalid transaction hash format (64 hex chars required)' });
          return;
        }
        const verification = await verifyUsdtPayment(txHash, PRICING[plan].usdt);
        if (!verification.valid) {
          json(res, 402, { error: verification.reason, orderId: order.id });
          return;
        }
        order.txHash = txHash;
        order.status = 'paid';
        order.paidAt = new Date().toISOString();
        order.payment = verification;
      }

      const orders = readOrders();
      orders.push(order);
      writeOrders(orders);

      let reportUrl = null;
      if (order.status === 'paid') {
        await fulfillOrder(order.id);
        reportUrl = `/api/report/${order.id}`;
      }

      json(res, 201, {
        order,
        payment: { wallet: WALLET, network: 'TRC20', amount: PRICING[plan].usdt, currency: 'USDT' },
        message: order.status === 'paid'
          ? 'Payment verified — full report ready'
          : 'Send USDT then submit your transaction hash',
        reportUrl,
      });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
    return;
  }

  if (url.startsWith('/api/report/') && req.method === 'GET') {
    const orderId = url.slice('/api/report/'.length).replace(/[^A-Z0-9-]/gi, '');
    const orders = readOrders();
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status !== 'fulfilled') {
      json(res, 404, { error: 'Report not found' });
      return;
    }
    const reportPath = path.join(__dirname, 'data', 'reports', orderId + '.html');
    if (!fs.existsSync(reportPath)) {
      json(res, 404, { error: 'Report file missing' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(reportPath));
    return;
  }

  if (url.startsWith('/api/')) {
    json(res, 404, { error: 'Not found' });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LaunchProof hardened server on http://127.0.0.1:${PORT}`);
});
