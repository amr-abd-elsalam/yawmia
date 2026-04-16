// ═══════════════════════════════════════════════════════════════
// server/middleware/cors.js — CORS Headers (Config-Driven)
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

export function corsMiddleware(req, res, next) {
  const allowedOrigins = config.SECURITY.allowedOrigins;
  const origin = req.headers.origin;

  if (allowedOrigins.includes('*')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  next();
}
