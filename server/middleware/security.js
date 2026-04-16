// ═══════════════════════════════════════════════════════════════
// server/middleware/security.js — Security Headers Middleware
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Adds security headers to every response
 */
export function securityMiddleware(req, res, next) {
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

  next();
}
