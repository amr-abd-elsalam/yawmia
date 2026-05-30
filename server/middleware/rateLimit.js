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

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
}

function sendRateLimit(res, statusCode, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function consumeBucket(key, maxRequests, windowMs, now = Date.now()) {
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= maxRequests,
    count: entry.count,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

function setRateLimitHeaders(res, prefix, limit, result) {
  if (!res || res.headersSent) return;
  res.setHeader(`${prefix}-Limit`, String(limit));
  res.setHeader(`${prefix}-Remaining`, String(result.remaining));
  res.setHeader(`${prefix}-Reset`, String(Math.ceil(result.resetAt / 1000)));
}

function isWriteMethod(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isAlwaysAllowedRequest(req) {
  if (!req || !req.pathname) return false;
  if (req.method === 'OPTIONS') return true;
  return req.pathname === '/api/health' ||
    req.pathname === '/api/config' ||
    req.pathname === '/api/docs';
}

function isSseEndpoint(req) {
  if (!req || req.method !== 'GET') return false;
  return req.pathname === '/api/notifications/stream' ||
    req.pathname === '/api/jobs/live-feed' ||
    req.pathname === '/api/admin/events';
}

function isPresenceHeartbeat(req) {
  return !!(
    req &&
    req.method === 'POST' &&
    req.pathname === '/api/presence/heartbeat'
  );
}

function isOtpSendEndpoint(req) {
  return !!(
    req &&
    req.method === 'POST' &&
    req.pathname === '/api/auth/send-otp'
  );
}

function isOtpVerifyEndpoint(req) {
  return !!(
    req &&
    req.method === 'POST' &&
    req.pathname === '/api/auth/verify-otp'
  );
}

function isAdminWriteRequest(req) {
  return !!(
    req &&
    req.pathname &&
    req.pathname.startsWith('/api/admin/') &&
    req.method !== 'GET'
  );
}

function isAdminReadRequest(req) {
  return !!(
    req &&
    req.method === 'GET' &&
    req.pathname &&
    req.pathname.startsWith('/api/admin/')
  );
}

function isBackgroundReadRequest(req) {
  if (!req || req.method !== 'GET' || !req.pathname) return false;

  const path = req.pathname;

  if (
    path === '/api/auth/me' ||
    path === '/api/notifications' ||
    path === '/api/messages/unread-count' ||
    path === '/api/profile/tasks' ||
    path === '/api/jobs' ||
    path === '/api/jobs/mine' ||
    path === '/api/jobs/nearby' ||
    path === '/api/applications/mine' ||
    path === '/api/direct-offers/mine' ||
    path === '/api/direct-offers/stats/employer' ||
    path === '/api/direct-offers/stats/worker' ||
    path === '/api/alerts' ||
    path === '/api/availability/windows' ||
    path === '/api/availability-ads/mine' ||
    path === '/api/workers/online-count' ||
    path === '/api/workers/discover' ||
    path === '/api/favorites' ||
    path === '/api/ratings/pending' ||
    path === '/api/analytics/employer' ||
    path === '/api/analytics/worker'
  ) {
    return true;
  }

  if (path.startsWith('/api/workrooms')) return true;
  if (path.startsWith('/api/jobs/') && (
    path.endsWith('/messages') ||
    path.endsWith('/applications') ||
    path.endsWith('/attendance') ||
    path.endsWith('/attendance/summary') ||
    path.endsWith('/payment') ||
    path.endsWith('/receipt') ||
    path.endsWith('/ratings')
  )) return true;

  if (path.startsWith('/api/users/') && (
    path.endsWith('/ratings') ||
    path.endsWith('/rating-summary') ||
    path.endsWith('/trust-score') ||
    path.endsWith('/trust-v2') ||
    path.endsWith('/public-profile')
  )) return true;

  return false;
}

function isLowRiskWriteRequest(req) {
  if (!req || !isWriteMethod(req.method) || !req.pathname) return false;

  const path = req.pathname;

  if (
    path === '/api/notifications/read-all' ||
    path === '/api/push/subscribe'
  ) {
    return true;
  }

  if (path.startsWith('/api/notifications/') && (
    path.endsWith('/read') ||
    path.endsWith('/action-click')
  )) return true;

  if (path.startsWith('/api/profile/tasks/') && path.endsWith('/click')) return true;
  if (path.startsWith('/api/jobs/') && path.endsWith('/messages/read-all')) return true;
  if (path.startsWith('/api/workrooms/') && path.endsWith('/messages/read-all')) return true;
  if (path.startsWith('/api/workrooms/') && path.includes('/messages/') && path.endsWith('/read')) return true;

  return false;
}

function isHighRiskWriteRequest(req) {
  if (!req || !isWriteMethod(req.method) || !req.pathname) return false;

  const path = req.pathname;

  if (
    path === '/api/jobs' ||
    path === '/api/direct-offers' ||
    path === '/api/reports'
  ) {
    return true;
  }

  if (path.startsWith('/api/jobs/') && (
    path.endsWith('/apply') ||
    path.endsWith('/accept') ||
    path.endsWith('/reject') ||
    path.endsWith('/start') ||
    path.endsWith('/complete') ||
    path.endsWith('/cancel') ||
    path.endsWith('/renew') ||
    path.endsWith('/duplicate') ||
    path.endsWith('/payment') ||
    path.endsWith('/rate')
  )) return true;

  if (path.startsWith('/api/direct-offers/') && (
    path.endsWith('/accept') ||
    path.endsWith('/decline') ||
    req.method === 'DELETE'
  )) return true;

  if (path.startsWith('/api/payments/') && (
    path.endsWith('/confirm') ||
    path.endsWith('/dispute')
  )) return true;

  if (path.startsWith('/api/applications/') && (
    path.endsWith('/withdraw') ||
    path.endsWith('/confirm') ||
    path.endsWith('/decline')
  )) return true;

  return false;
}

function isPenaltyEligibleRequest(req) {
  return isOtpSendEndpoint(req) ||
    isOtpVerifyEndpoint(req) ||
    isAdminWriteRequest(req) ||
    isHighRiskWriteRequest(req);
}

function softThrottleMessage() {
  return 'الاتصال سريع جدًا حاليًا. استنى ثواني وجرب تاني.';
}

function penaltyMessage() {
  return 'تم إيقاف الطلبات مؤقتًا بسبب محاولات كثيرة جدًا. حاول بعد دقائق.';
}

export function rateLimitMiddleware(req, res, next) {
  if (!config.RATE_LIMIT.enabled) return next();

  startCleanup();

  // Use IP as key (or forwarded IP)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';

  const now = Date.now();

  if (isAlwaysAllowedRequest(req)) {
    return next();
  }

  // Penalty check must run BEFORE incrementing normal counters.
  const penaltyKey = `penalty:${ip}`;
  const penaltyEntry = store.get(penaltyKey);
  if (penaltyEntry && now < penaltyEntry.cooldownUntil) {
    const retryAfter = Math.ceil((penaltyEntry.cooldownUntil - now) / 1000);
    return sendRateLimit(res, 429, {
      error: penaltyMessage(),
      code: 'PENALTY_COOLDOWN',
      retryAfter,
    }, {
      'Retry-After': String(retryAfter),
    });
  }

  // SSE endpoints are long-lived connections. Do not count them like normal API requests.
  if (isSseEndpoint(req)) {
    const sseWindowMs = 5 * 60 * 1000;
    const sseMaxAttempts = config.RATE_LIMIT.sseMaxAttempts || 20;
    const result = consumeBucket(`sse:${ip}`, sseMaxAttempts, sseWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-SSE', sseMaxAttempts, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'SSE_RATE_LIMITED',
      });
    }

    return next();
  }

  // Presence heartbeat already has its own service-level throttle.
  // Keep it out of global penalty to avoid punishing normal online status updates.
  if (isPresenceHeartbeat(req)) {
    const presenceWindowMs = 60000;
    const presenceMaxRequests = config.RATE_LIMIT.presenceMaxRequests || 120;
    const result = consumeBucket(`presence:${ip}`, presenceMaxRequests, presenceWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Presence', presenceMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'PRESENCE_RATE_LIMITED',
      });
    }

    return next();
  }

  // OTP-specific rate limiting remains strict and penalty-eligible.
  if (isOtpSendEndpoint(req)) {
    const otpWindowMs = config.RATE_LIMIT.otpWindowMs;
    const otpMaxRequests = config.RATE_LIMIT.otpMaxRequests;
    const result = consumeBucket(`otp:${ip}`, otpMaxRequests, otpWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-OTP', otpMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: 'تم تجاوز الحد المسموح من طلبات كود التحقق. حاول بعد قليل.',
        code: 'OTP_RATE_LIMITED',
      });
    }

    return next();
  }

  // OTP verify is auth-sensitive. Keep stricter than background traffic.
  if (isOtpVerifyEndpoint(req)) {
    const verifyWindowMs = config.RATE_LIMIT.otpWindowMs;
    const verifyMaxRequests = config.RATE_LIMIT.otpVerifyMaxRequests || 20;
    const result = consumeBucket(`otp_verify:${ip}`, verifyMaxRequests, verifyWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-OTP-Verify', verifyMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: 'محاولات التحقق كثيرة جدًا. حاول بعد قليل.',
        code: 'OTP_VERIFY_RATE_LIMITED',
      });
    }

    return next();
  }

  // Admin write-specific rate limiting remains strict and penalty-eligible.
  if (isAdminWriteRequest(req)) {
    const adminWindowMs = 60000;
    const adminMaxRequests = config.RATE_LIMIT.adminWriteMaxRequests || 10;
    const result = consumeBucket(`admin:${ip}`, adminMaxRequests, adminWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Admin', adminMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: 'تم تجاوز الحد المسموح من عمليات الأدمن. حاول بعد قليل.',
        code: 'ADMIN_RATE_LIMITED',
      });
    }

    return next();
  }

  // Admin dashboards are read-heavy. Relax reads but do not make them penalty-eligible.
  if (isAdminReadRequest(req)) {
    const adminReadWindowMs = 60000;
    const adminReadMaxRequests = config.RATE_LIMIT.adminReadMaxRequests || 240;
    const result = consumeBucket(`admin_read:${ip}`, adminReadMaxRequests, adminReadWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Admin-Read', adminReadMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'ADMIN_READ_RATE_LIMITED',
      });
    }

    return next();
  }

  // High-risk marketplace writes stay protected and penalty-eligible.
  if (isHighRiskWriteRequest(req)) {
    const highRiskWindowMs = 60000;
    const highRiskMaxRequests = config.RATE_LIMIT.highRiskMaxRequests || 30;
    const result = consumeBucket(`high_risk:${ip}`, highRiskMaxRequests, highRiskWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-High-Risk', highRiskMaxRequests, result);

    if (!result.allowed) {
      recordViolation(ip);
      return sendRateLimit(res, 429, {
        error: config.RATE_LIMIT.message,
        code: 'HIGH_RISK_RATE_LIMITED',
      });
    }

    return next();
  }

  // Background reads are common in dashboard/workroom UX. Relax and do not penalize.
  if (isBackgroundReadRequest(req)) {
    const bgWindowMs = 60000;
    const bgMaxRequests = config.RATE_LIMIT.backgroundMaxRequests || 240;
    const result = consumeBucket(`background:${ip}`, bgMaxRequests, bgWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Background', bgMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'BACKGROUND_RATE_LIMITED',
      });
    }

    return next();
  }

  // Low-risk writes such as read receipts and analytics clicks should not cause penalties.
  if (isLowRiskWriteRequest(req)) {
    const lowRiskWindowMs = 60000;
    const lowRiskMaxRequests = config.RATE_LIMIT.lowRiskWriteMaxRequests || 120;
    const result = consumeBucket(`low_risk_write:${ip}`, lowRiskMaxRequests, lowRiskWindowMs, now);
    setRateLimitHeaders(res, 'X-RateLimit-Low-Risk-Write', lowRiskMaxRequests, result);

    if (!result.allowed) {
      return sendRateLimit(res, 429, {
        error: softThrottleMessage(),
        code: 'LOW_RISK_WRITE_RATE_LIMITED',
      });
    }

    return next();
  }

  // Fallback global limiter for unclassified routes.
  const windowMs = config.RATE_LIMIT.windowMs;
  const maxRequests = Math.max(config.RATE_LIMIT.maxRequests || 60, config.RATE_LIMIT.normalMaxRequests || 120);
  const result = consumeBucket(`global:${ip}`, maxRequests, windowMs, now);

  setRateLimitHeaders(res, 'X-RateLimit', maxRequests, result);

  if (!result.allowed) {
    if (isPenaltyEligibleRequest(req)) {
      recordViolation(ip);
    }

    return sendRateLimit(res, 429, {
      error: config.RATE_LIMIT.message,
      code: 'RATE_LIMITED',
    });
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
 * Check authenticated per-user rate limit.
 * Phase 50: global rateLimitMiddleware runs before route auth, so req.user is
 * usually unavailable there. requireAuth calls this after loading the user.
 *
 * @param {object} req
 * @param {object} res
 * @returns {boolean} true if allowed, false if response was sent
 */
export function checkUserRateLimit(req, res) {
  if (!config.RATE_LIMIT.enabled || !config.RATE_LIMIT.perUserEnabled) return true;
  if (!req.user || !req.user.id) return true;

  // Authenticated background UX routes should not consume the strict per-user bucket.
  // They are already handled by relaxed IP buckets in rateLimitMiddleware.
  if (
    isAlwaysAllowedRequest(req) ||
    isSseEndpoint(req) ||
    isPresenceHeartbeat(req) ||
    isBackgroundReadRequest(req) ||
    isLowRiskWriteRequest(req)
  ) {
    return true;
  }

  const now = Date.now();
  const userId = req.user.id;

  const isHighRisk = isHighRiskWriteRequest(req);
  const userKey = isHighRisk ? `user_high_risk:${userId}` : `user:${userId}`;
  const userWindowMs = config.RATE_LIMIT.perUserWindowMs;
  const userMaxRequests = isHighRisk
    ? (config.RATE_LIMIT.perUserHighRiskMaxRequests || 30)
    : config.RATE_LIMIT.perUserMaxRequests;

  const result = consumeBucket(userKey, userMaxRequests, userWindowMs, now);

  setRateLimitHeaders(res, 'X-RateLimit-User', userMaxRequests, result);

  if (!result.allowed) {
    sendRateLimit(res, 429, {
      error: isHighRisk ? config.RATE_LIMIT.message : softThrottleMessage(),
      code: isHighRisk ? 'USER_HIGH_RISK_RATE_LIMITED' : 'USER_RATE_LIMITED',
    });
    return false;
  }

  return true;
}

/**
 * Reset store — useful for testing
 */
export function resetRateLimit() {
  store.clear();
}
