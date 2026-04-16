// ═══════════════════════════════════════════════════════════════
// server.js — يوميّة: Entry Point
// ═══════════════════════════════════════════════════════════════

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// Load env
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {
  // dotenv not installed yet — use process.env directly
}

import config from './config.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// ── Simple Router ─────────────────────────────────────────────
const routes = {
  'GET /api/health': (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      brand: config.BRAND.name,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }));
  },

  'GET /api/config': (_req, res) => {
    // Public config — no sensitive data
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      BRAND: config.BRAND,
      META: config.META,
      LABOR_CATEGORIES: config.LABOR_CATEGORIES,
      REGIONS: config.REGIONS,
      RATINGS: config.RATINGS,
      FINANCIALS: {
        platformFeePercent: config.FINANCIALS.platformFeePercent,
        minDailyWage: config.FINANCIALS.minDailyWage,
        maxDailyWage: config.FINANCIALS.maxDailyWage,
        compensationEnabled: config.FINANCIALS.compensationEnabled,
        paymentMethods: config.FINANCIALS.paymentMethods,
      },
    }));
  },
};

// ── HTTP Server ───────────────────────────────────────────────
const server = createServer((req, res) => {
  const method = req.method;
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Route matching
  const routeKey = `${method} ${pathname}`;
  const handler = routes[routeKey];

  if (handler) {
    handler(req, res);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', code: 'NOT_FOUND' }));
});

// ── Start ─────────────────────────────────────────────────────
server.listen(PORT, HOST, () => {
  console.log(`\n🟢 يوميّة — ${config.BRAND.tagline}`);
  console.log(`   Server: http://${HOST}:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Config: http://localhost:${PORT}/api/config\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🔴 Shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
