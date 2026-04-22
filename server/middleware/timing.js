// ═══════════════════════════════════════════════════════════════
// server/middleware/timing.js — Request Timing + Metrics
// ═══════════════════════════════════════════════════════════════
// Measures response time, sets X-Response-Time header,
// logs slow requests (>500ms), tracks rolling metrics (p50/p95/p99).
// ═══════════════════════════════════════════════════════════════

import { logger } from '../services/logger.js';

const SLOW_THRESHOLD_MS = 500;
const MAX_ROLLING_WINDOW = 1000;

// ── In-memory state ──────────────────────────────────────────
let count = 0;
let totalMs = 0;
let errors = 0;
const times = [];

/**
 * Request timing middleware.
 * Hooks into res.end to measure total request duration.
 * Sets X-Response-Time header on every response.
 * Logs warning for slow requests (>500ms).
 * Updates in-memory metrics for /api/health consumption.
 *
 * Must be FIRST in the middleware chain to capture full lifecycle.
 * Non-blocking — calls next() immediately.
 */
export function timingMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  // Monkey-patch res.end to capture timing
  const originalEnd = res.end;
  res.end = function (...args) {
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // nanoseconds → milliseconds
    const ms = Math.round(elapsed * 100) / 100;

    // Set header (only if headers not yet sent)
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', ms + 'ms');
    }

    // Update metrics
    count++;
    totalMs += ms;
    if (res.statusCode >= 500) errors++;

    // Rolling window for percentile calculation
    times.push(ms);
    if (times.length > MAX_ROLLING_WINDOW) {
      times.shift();
    }

    // Log slow requests
    if (ms > SLOW_THRESHOLD_MS) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.pathname || req.url,
        statusCode: res.statusCode,
        duration: ms + 'ms',
      });
    }

    // Call original res.end
    return originalEnd.apply(this, args);
  };

  next();
}

/**
 * Get aggregated request metrics.
 * Percentiles calculated on-demand from rolling window.
 * @returns {{ count: number, avgMs: number, p50Ms: number, p95Ms: number, p99Ms: number, errorRate: string }}
 */
export function getMetrics() {
  if (count === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: '0%' };
  }

  const avgMs = Math.round((totalMs / count) * 100) / 100;
  const errorRate = Math.round((errors / count) * 10000) / 100 + '%';

  // Sort a copy for percentile calculation
  const sorted = times.slice().sort((a, b) => a - b);
  const len = sorted.length;

  const p50Ms = len > 0 ? sorted[Math.floor(len * 0.5)] : 0;
  const p95Ms = len > 0 ? sorted[Math.floor(len * 0.95)] : 0;
  const p99Ms = len > 0 ? sorted[Math.min(Math.floor(len * 0.99), len - 1)] : 0;

  return {
    count,
    avgMs,
    p50Ms: Math.round(p50Ms * 100) / 100,
    p95Ms: Math.round(p95Ms * 100) / 100,
    p99Ms: Math.round(p99Ms * 100) / 100,
    errorRate,
  };
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics() {
  count = 0;
  totalMs = 0;
  errors = 0;
  times.length = 0;
}
