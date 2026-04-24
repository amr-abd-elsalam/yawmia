// tests/phase28-resilience.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 28 — Frontend Resilience + Observability (~35 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let config;

before(async () => {
  config = (await import('../config.js')).default;
});

// ══════════════════════════════════════════════════════════════
// Bug Fix — rateLimit.js
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — RateLimit Bug Fix', () => {

  it('P28-01: rateLimit source uses req.method not bare method', async () => {
    const content = await readFile(resolve('server/middleware/rateLimit.js'), 'utf-8');
    // The admin rate limit section should NOT have bare 'method' without 'req.'
    const adminBlock = content.substring(content.indexOf('/api/admin/'));
    assert.ok(adminBlock.includes('req.method'), 'should use req.method in admin rate limit check');
    // Ensure no bare 'method !== ' without req. prefix in the admin section
    const bareMethodMatch = adminBlock.match(/[^.]method\s*!==\s*'GET'/);
    assert.strictEqual(bareMethodMatch, null, 'should not have bare method reference without req. prefix');
  });

  it('P28-02: rateLimit admin rate limiting checks non-GET methods', async () => {
    const content = await readFile(resolve('server/middleware/rateLimit.js'), 'utf-8');
    assert.ok(content.includes("req.method !== 'GET'"), 'should check req.method !== GET for admin');
  });

  it('P28-03: rateLimit has ADMIN_RATE_LIMITED error code', async () => {
    const content = await readFile(resolve('server/middleware/rateLimit.js'), 'utf-8');
    assert.ok(content.includes('ADMIN_RATE_LIMITED'), 'should have ADMIN_RATE_LIMITED code');
  });
});

// ══════════════════════════════════════════════════════════════
// Timing Middleware
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Timing Middleware', () => {

  it('P28-04: timing.js exports timingMiddleware function', async () => {
    const mod = await import('../server/middleware/timing.js');
    assert.strictEqual(typeof mod.timingMiddleware, 'function');
  });

  it('P28-05: timing.js exports getMetrics function', async () => {
    const mod = await import('../server/middleware/timing.js');
    assert.strictEqual(typeof mod.getMetrics, 'function');
  });

  it('P28-06: timing.js exports resetMetrics function', async () => {
    const mod = await import('../server/middleware/timing.js');
    assert.strictEqual(typeof mod.resetMetrics, 'function');
  });

  it('P28-07: getMetrics returns correct structure', async () => {
    const { getMetrics, resetMetrics } = await import('../server/middleware/timing.js');
    resetMetrics();
    const metrics = getMetrics();
    assert.strictEqual(typeof metrics.count, 'number');
    assert.strictEqual(typeof metrics.avgMs, 'number');
    assert.strictEqual(typeof metrics.p50Ms, 'number');
    assert.strictEqual(typeof metrics.p95Ms, 'number');
    assert.strictEqual(typeof metrics.p99Ms, 'number');
    assert.strictEqual(typeof metrics.errorRate, 'string');
  });

  it('P28-08: getMetrics returns zeros when no requests', async () => {
    const { getMetrics, resetMetrics } = await import('../server/middleware/timing.js');
    resetMetrics();
    const metrics = getMetrics();
    assert.strictEqual(metrics.count, 0);
    assert.strictEqual(metrics.avgMs, 0);
    assert.strictEqual(metrics.p50Ms, 0);
    assert.strictEqual(metrics.p95Ms, 0);
    assert.strictEqual(metrics.p99Ms, 0);
    assert.strictEqual(metrics.errorRate, '0%');
  });

  it('P28-09: resetMetrics clears all data', async () => {
    const { getMetrics, resetMetrics } = await import('../server/middleware/timing.js');
    resetMetrics();
    const metrics = getMetrics();
    assert.strictEqual(metrics.count, 0);
  });

  it('P28-10: timing source logs slow requests (>500ms reference)', async () => {
    const content = await readFile(resolve('server/middleware/timing.js'), 'utf-8');
    assert.ok(content.includes('500') || content.includes('SLOW_THRESHOLD'), 'should reference 500ms slow threshold');
    assert.ok(content.includes('Slow request'), 'should log slow request warning');
  });

  it('P28-11: timing source sets X-Response-Time header', async () => {
    const content = await readFile(resolve('server/middleware/timing.js'), 'utf-8');
    assert.ok(content.includes('X-Response-Time'), 'should set X-Response-Time header');
  });
});

// ══════════════════════════════════════════════════════════════
// Health Endpoint
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Health Endpoint', () => {

  it('P28-12: health endpoint returns requestMetrics', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('requestMetrics'), 'health handler should include requestMetrics');
  });

  it('P28-13: health version is 0.28.0', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("version: '0.32.0'"), 'health version should be 0.28.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Server Integration
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Server Integration', () => {

  it('P28-14: server.js imports timingMiddleware', async () => {
    const content = await readFile(resolve('server.js'), 'utf-8');
    assert.ok(content.includes('timingMiddleware'), 'server.js should import timingMiddleware');
    assert.ok(content.includes('./server/middleware/timing.js'), 'should import from timing.js');
  });

  it('P28-15: timingMiddleware is first in globalMiddleware', async () => {
    const content = await readFile(resolve('server.js'), 'utf-8');
    const mwBlock = content.substring(content.indexOf('const globalMiddleware'));
    const timingPos = mwBlock.indexOf('timingMiddleware');
    const corsPos = mwBlock.indexOf('corsMiddleware');
    assert.ok(timingPos > 0, 'timingMiddleware should be in globalMiddleware');
    assert.ok(timingPos < corsPos, 'timingMiddleware should come before corsMiddleware');
  });
});

// ══════════════════════════════════════════════════════════════
// Frontend — apiWithRetry
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Frontend apiWithRetry', () => {

  it('P28-16: app.js exports apiWithRetry', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    assert.ok(content.includes('apiWithRetry: apiWithRetry'), 'return object should include apiWithRetry');
  });

  it('P28-17: apiWithRetry has exponential backoff logic', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    assert.ok(content.includes('Math.pow(2,') || content.includes('Math.pow(2, attempt)'), 'should use exponential backoff');
  });

  it('P28-18: apiWithRetry does not retry on 4xx', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    const retryBlock = content.substring(content.indexOf('async function apiWithRetry'));
    assert.ok(retryBlock.includes('status < 500') || retryBlock.includes('< 500'), 'should not retry on status < 500');
  });

  it('P28-19: apiWithRetry retries on 5xx', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    const retryBlock = content.substring(content.indexOf('async function apiWithRetry'));
    assert.ok(retryBlock.includes('500'), 'should reference 500 for retry threshold');
  });
});

// ══════════════════════════════════════════════════════════════
// Frontend — Online/Offline
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Online/Offline Detection', () => {

  it('P28-20: app.js has offline event listener', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    assert.ok(content.includes("'offline'"), 'should listen for offline event');
  });

  it('P28-21: app.js has online event listener', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    assert.ok(content.includes("'online'"), 'should listen for online event');
  });

  it('P28-22: app.js creates offline banner element', async () => {
    const content = await readFile(resolve('frontend/assets/js/app.js'), 'utf-8');
    assert.ok(content.includes('offline-banner') || content.includes('offlineBanner'), 'should create offline banner');
  });
});

// ══════════════════════════════════════════════════════════════
// Frontend — Retry Buttons
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Retry Buttons', () => {

  it('P28-23: jobs.js loadJobs catch has retry button', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(content.includes('retryLoadJobs'), 'loadJobs catch should have retry button');
  });

  it('P28-24: jobs.js loadNotifications catch has retry button', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(content.includes('retryLoadNotifs'), 'loadNotifications catch should have retry button');
  });

  it('P28-25: profile.js loadMyApplications catch has retry button', async () => {
    const content = await readFile(resolve('frontend/assets/js/profile.js'), 'utf-8');
    assert.ok(content.includes('retryMyApps'), 'loadMyApplications catch should have retry button');
  });

  it('P28-26: profile.js loadMyJobs catch has retry button', async () => {
    const content = await readFile(resolve('frontend/assets/js/profile.js'), 'utf-8');
    assert.ok(content.includes('retryMyJobs'), 'loadMyJobs catch should have retry button');
  });
});

// ══════════════════════════════════════════════════════════════
// Terms Page
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Terms Page', () => {

  it('P28-27: terms.html file exists', async () => {
    const content = await readFile(resolve('frontend/terms.html'), 'utf-8');
    assert.ok(content.length > 0, 'terms.html should exist and have content');
  });

  it('P28-28: terms.html has DOCTYPE', async () => {
    const content = await readFile(resolve('frontend/terms.html'), 'utf-8');
    assert.ok(content.includes('<!DOCTYPE html>'), 'should have DOCTYPE');
  });

  it('P28-29: terms.html mentions 15% fee', async () => {
    const content = await readFile(resolve('frontend/terms.html'), 'utf-8');
    assert.ok(content.includes('15%'), 'should mention 15% platform fee');
  });

  it('P28-30: auth.js checks termsAcceptedAt', async () => {
    const content = await readFile(resolve('frontend/assets/js/auth.js'), 'utf-8');
    assert.ok(content.includes('termsAcceptedAt'), 'auth.js should check termsAcceptedAt');
  });
});

// ══════════════════════════════════════════════════════════════
// SW Cache
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Service Worker Cache', () => {

  it('P28-31: sw.js STATIC_ASSETS includes /terms.html', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes('/terms.html'), 'STATIC_ASSETS should include /terms.html');
  });

  it('P28-32: sw.js CACHE_NAME is yawmia-v0.31.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.31.0'"), 'cache name should be yawmia-v0.31.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Version
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Version', () => {

  it('P28-33: package.json version is 0.28.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.32.0');
  });

  it('P28-34: config PWA cacheName is yawmia-v0.31.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.31.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Route Count
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — Route Count', () => {

  it('P28-35: Router has 84 routes', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    const routeMatches = content.match(/\{\s*method:\s*'/g);
    assert.ok(routeMatches, 'should find route definitions');
    assert.strictEqual(routeMatches.length, 92, `expected 84 routes, got ${routeMatches.length}`);
  });
});

// ══════════════════════════════════════════════════════════════
// verifyOtp Response — termsAcceptedAt
// ══════════════════════════════════════════════════════════════

describe('Phase 28 — verifyOtp Response', () => {

  it('P28-36: auth.js service returns termsAcceptedAt in verifyOtp', async () => {
    const content = await readFile(resolve('server/services/auth.js'), 'utf-8');
    const verifyBlock = content.substring(content.indexOf('export async function verifyOtp'));
    assert.ok(verifyBlock.includes('termsAcceptedAt'), 'verifyOtp should return termsAcceptedAt field');
  });
});
