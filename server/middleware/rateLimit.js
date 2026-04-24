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
    recordViolation(ip);
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
      recordViolation(ip);
      return;
    }
  }

  // Admin write-specific rate limiting (POST/PUT/PATCH/DELETE on /api/admin/*)
  if (req.pathname.startsWith('/api/admin/') && req.method !== 'GET') {
    const adminKey = `admin:${ip}`;
    const adminWindowMs = 60000;    // 1 minute
    const adminMaxRequests = 10;    // 10 write requests/min

    let adminEntry = store.get(adminKey);
    if (!adminEntry || now > adminEntry.resetAt) {
      adminEntry = { count: 0, resetAt: now + adminWindowMs };
      store.set(adminKey, adminEntry);
    }

    adminEntry.count++;

    if (adminEntry.count > adminMaxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'تم تجاوز الحد المسموح من عمليات الأدمن. حاول بعد قليل.',
        code: 'ADMIN_RATE_LIMITED',
      }));
      recordViolation(ip);
      return;
    }
  }

  // ── Per-user rate limiting (authenticated endpoints only) ──
  if (config.RATE_LIMIT.perUserEnabled && req.user && req.user.id) {
    const userId = req.user.id;
    const userKey = `user:${userId}`;
    const userWindowMs = config.RATE_LIMIT.perUserWindowMs;
    const userMaxRequests = config.RATE_LIMIT.perUserMaxRequests;

    let userEntry = store.get(userKey);
    if (!userEntry || now > userEntry.resetAt) {
      userEntry = { count: 0, resetAt: now + userWindowMs };
      store.set(userKey, userEntry);
    }

    userEntry.count++;

    // Set per-user rate limit header
    res.setHeader('X-RateLimit-User-Remaining', String(Math.max(0, userMaxRequests - userEntry.count)));

    if (userEntry.count > userMaxRequests) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: config.RATE_LIMIT.message,
        code: 'USER_RATE_LIMITED',
      }));
      recordViolation(ip);
      return;
    }
  }

  // ── Penalty check (IP-based — prevents account-switching evasion) ──
  const penaltyKey = `penalty:${ip}`;
  const penaltyEntry = store.get(penaltyKey);
  if (penaltyEntry && now < penaltyEntry.cooldownUntil) {
    const retryAfter = Math.ceil((penaltyEntry.cooldownUntil - now) / 1000);
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    });
    res.end(JSON.stringify({
      error: 'تم حظرك مؤقتاً بسبب تجاوز الحد المسموح بشكل متكرر. حاول بعد ' + retryAfter + ' ثانية.',
      code: 'PENALTY_COOLDOWN',
    }));
    return;
  }

  next();
}

/**
 * Record a rate limit violation for penalty tracking.
 * @param {string} ip
 */
function recordViolation(ip) {
  const now = Date.now();
  const violationKey = `violations:${ip}`;
  const penaltyWindowMs = config.RATE_LIMIT.penaltyWindowMs;
  const penaltyThreshold = config.RATE_LIMIT.penaltyThreshold;
  const penaltyCooldownMs = config.RATE_LIMIT.penaltyCooldownMs;

  let violations = store.get(violationKey);
  if (!violations || now > violations.resetAt) {
    violations = { timestamps: [], resetAt: now + penaltyWindowMs };
    store.set(violationKey, violations);
  }

  violations.timestamps.push(now);

  // Clean old timestamps within window
  violations.timestamps = violations.timestamps.filter(ts => now - ts < penaltyWindowMs);

  // Check if threshold reached
  if (violations.timestamps.length >= penaltyThreshold) {
    const penaltyKey = `penalty:${ip}`;
    store.set(penaltyKey, {
      cooldownUntil: now + penaltyCooldownMs,
      resetAt: now + penaltyCooldownMs + 60000, // cleanup margin
    });
    // Reset violation counter
    store.delete(violationKey);
  }
}

/**
 * Reset store — useful for testing
 */
export function resetRateLimit() {
  store.clear();
}
