// ═══════════════════════════════════════════════════════════════
// server/middleware/security.js — Security Headers Middleware
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Apply configured security headers to a response.
 * Phase 50: exported so staticMiddleware can set headers even though static
 * files are served before the global middleware chain.
 */
export function applySecurityHeaders(res) {
  const headers = config.SECURITY.headers;

  if (headers.xContentTypeOptions) {
    res.setHeader('X-Content-Type-Options', headers.xContentTypeOptions);
  }
  if (headers.xFrameOptions) {
    res.setHeader('X-Frame-Options', headers.xFrameOptions);
  }
  if (headers.referrerPolicy) {
    res.setHeader('Referrer-Policy', headers.referrerPolicy);
  }
  if (headers.contentSecurityPolicy) {
    res.setHeader('Content-Security-Policy', headers.contentSecurityPolicy);
  }
}

/**
 * Adds security headers to every response
 */
export function securityMiddleware(req, res, next) {
  applySecurityHeaders(res);
  next();
}
