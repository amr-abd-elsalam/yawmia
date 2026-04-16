// ═══════════════════════════════════════════════════════════════
// server/middleware/rateLimit.js — In-memory Rate Limiter
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/** @type {Map<string, { count: number, resetAt: number }>} */
const store = new Map();

// Cleanup interval — every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Don't prevent process exit
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function rateLimitMiddleware(req, res, next) {
  if (!config.RATE_LIMIT.enabled) return next();

  startCleanup();

  // Use IP as key (or forwarded IP)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();
  const windowMs = config.RATE_LIMIT.windowMs;
  const maxRequests = config.RATE_LIMIT.maxRequests;

  const key = `global:${ip}`;
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', String(maxRequests));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

  if (entry.count > maxRequests) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: config.RATE_LIMIT.message,
      code: 'RATE_LIMITED',
    }));
    return;
  }

  // OTP-specific rate limiting
  if (req.pathname === '/api/auth/send-otp' && req.method === 'POST') {
    const otpKey = `otp:${ip}`;
    const otpWindowMs = config.RATE_LIMIT.otpWindowMs;
    const otpMaxRequests = config.RATE_LIMIT.otpMaxRequests;

    let otpEntry = store.get(otpKey);
    if (!otpEntry || now > otpEntry.resetAt) {
      otpEntry = { count: 0, resetAt: now + otpWindowMs };
      store.set(otpKey, otpEntry);
    }

    otpEntry.count++;

    if (otpEntry.count > otpMaxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'تم تجاوز الحد المسموح من طلبات OTP. حاول بعد قليل.',
        code: 'OTP_RATE_LIMITED',
      }));
      return;
    }
  }

  next();
}

/**
 * Reset store — useful for testing
 */
export function resetRateLimit() {
  store.clear();
}
