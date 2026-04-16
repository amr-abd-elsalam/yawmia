// ═══════════════════════════════════════════════════════════════
// server/middleware/requestId.js — X-Request-Id
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';

export function requestIdMiddleware(req, res, next) {
  const id = crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}
