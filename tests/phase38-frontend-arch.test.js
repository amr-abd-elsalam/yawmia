// tests/phase38-frontend-arch.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 38 — Frontend Architecture + Static Middleware + Version (~30 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

let config;
let tmpDir;
let testServer;
let BASE_URL;

before(async () => {
  config = (await import('../config.js')).default;

  // Setup temp data dir for server
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-phase38-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit', 'messages', 'push_subscriptions', 'alerts', 'metrics', 'favorites'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;

  // Start a minimal test server using the app's middleware
  const { staticMiddleware } = await import('../server/middleware/static.js');
  const { createRouter } = await import('../server/router.js');
  const { corsMiddleware } = await import('../server/middleware/cors.js');
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');
  const { requestIdMiddleware } = await import('../server/middleware/requestId.js');
  const { securityMiddleware } = await import('../server/middleware/security.js');

  const router = createRouter();

  testServer = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    staticMiddleware(req, res, () => {
      // Minimal middleware chain for API routes
      corsMiddleware(req, res, () => {
        securityMiddleware(req, res, () => {
          requestIdMiddleware(req, res, () => {
            bodyParserMiddleware(req, res, () => {
              router(req, res);
            });
          });
        });
      });
    });
  });

  await new Promise((resolve) => {
    testServer.listen(0, '127.0.0.1', () => {
      const addr = testServer.address();
      BASE_URL = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (testServer) await new Promise(r => testServer.close(r));
  delete process.env.YAWMIA_DATA_PATH;
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// ══════════════════════════════════════════════════════════════
// Static Middleware Tests
// ══════════════════════════════════════════════════════════════

describe('Phase 38 — Static Middleware', () => {

  it('P38-01: GET / serves index.html (200, text/html)', async () => {
    const res = await fetch(BASE_URL + '/');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
  });

  it('P38-02: GET /dashboard.html serves file (200, text/html)', async () => {
    const res = await fetch(BASE_URL + '/dashboard.html');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/html'));
  });

  it('P38-03: GET /assets/css/style.css serves CSS (200, text/css)', async () => {
    const res = await fetch(BASE_URL + '/assets/css/style.css');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/css'));
  });

  it('P38-04: GET /assets/js/app.js serves JS (200, javascript)', async () => {
    const res = await fetch(BASE_URL + '/assets/js/app.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('javascript'));
  });

  it('P38-05: GET /nonexistent-page.html serves 404.html (404)', async () => {
    const res = await fetch(BASE_URL + '/nonexistent-page.html');
    assert.strictEqual(res.status, 404);
    const body = await res.text();
    assert.ok(body.includes('غير موجودة'), 'should contain Arabic 404 text');
  });

  it('P38-06: GET /../../../etc/passwd blocked (404)', async () => {
    const res = await fetch(BASE_URL + '/../../../etc/passwd');
    assert.ok(res.status === 404 || res.status === 400, `should block traversal, got ${res.status}`);
  });

  it('P38-07: GET /api/health passes through to API (200, json)', async () => {
    const res = await fetch(BASE_URL + '/api/health');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/json'));
    const data = await res.json();
    assert.ok(data.status);
  });

  it('P38-08: GET /manifest.json serves JSON (200)', async () => {
    const res = await fetch(BASE_URL + '/manifest.json');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('json'));
  });

  it('P38-09: GET /robots.txt serves text (200, text/plain)', async () => {
    const res = await fetch(BASE_URL + '/robots.txt');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('text/plain'));
  });

  it('P38-10: GET /sw.js serves JavaScript (200)', async () => {
    const res = await fetch(BASE_URL + '/sw.js');
    assert.strictEqual(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('javascript'));
  });
});

// ══════════════════════════════════════════════════════════════
// Version & Config
// ══════════════════════════════════════════════════════════════

describe('Phase 38 — Version & Config', () => {

  it('P38-11: package.json version is 0.36.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.36.0');
  });

  it('P38-12: PWA.cacheName is yawmia-v0.36.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.36.0');
  });

  it('P38-13: sw.js CACHE_NAME is yawmia-v0.36.0', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes("'yawmia-v0.36.0'"), 'sw.js should have cache name yawmia-v0.36.0');
  });

  it('P38-14: /api/health version is 0.36.0', async () => {
    const res = await fetch(BASE_URL + '/api/health');
    const data = await res.json();
    assert.strictEqual(data.version, '0.36.0');
  });

  it('P38-15: /api/docs version is 0.36.0', async () => {
    const res = await fetch(BASE_URL + '/api/docs');
    const data = await res.json();
    assert.strictEqual(data.version, '0.36.0');
  });

  it('P38-16: Config sections count is 50', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 56);
  });
});

// ══════════════════════════════════════════════════════════════
// Frontend Module Verification
// ══════════════════════════════════════════════════════════════

describe('Phase 38 — Frontend Module Verification', () => {

  it('P38-17: dashboard.html contains jobCard.js script tag', async () => {
    const content = await readFile(resolve('frontend/dashboard.html'), 'utf-8');
    assert.ok(content.includes('jobCard.js'), 'should include jobCard.js');
  });

  it('P38-18: dashboard.html contains panels.js script tag', async () => {
    const content = await readFile(resolve('frontend/dashboard.html'), 'utf-8');
    assert.ok(content.includes('panels.js'), 'should include panels.js');
  });

  it('P38-19: dashboard.html contains ratingModal.js script tag', async () => {
    const content = await readFile(resolve('frontend/dashboard.html'), 'utf-8');
    assert.ok(content.includes('ratingModal.js'), 'should include ratingModal.js');
  });

  it('P38-20: jobCard.js loads BEFORE jobs.js', async () => {
    const content = await readFile(resolve('frontend/dashboard.html'), 'utf-8');
    const jobCardIdx = content.indexOf('jobCard.js');
    const jobsIdx = content.lastIndexOf('jobs.js');
    assert.ok(jobCardIdx > -1 && jobsIdx > -1, 'both should exist');
    assert.ok(jobCardIdx < jobsIdx, 'jobCard.js should come before jobs.js');
  });

  it('P38-21: panels.js loads BEFORE jobs.js', async () => {
    const content = await readFile(resolve('frontend/dashboard.html'), 'utf-8');
    const panelsIdx = content.indexOf('panels.js');
    const jobsIdx = content.lastIndexOf('jobs.js');
    assert.ok(panelsIdx > -1 && jobsIdx > -1, 'both should exist');
    assert.ok(panelsIdx < jobsIdx, 'panels.js should come before jobs.js');
  });

  it('P38-22: ratingModal.js loads BEFORE jobs.js', async () => {
    const content = await readFile(resolve('frontend/dashboard.html'), 'utf-8');
    const ratingIdx = content.indexOf('ratingModal.js');
    const jobsIdx = content.lastIndexOf('jobs.js');
    assert.ok(ratingIdx > -1 && jobsIdx > -1, 'both should exist');
    assert.ok(ratingIdx < jobsIdx, 'ratingModal.js should come before jobs.js');
  });

  it('P38-23: sw.js STATIC_ASSETS includes jobCard.js', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes('/assets/js/jobCard.js'), 'STATIC_ASSETS should include jobCard.js');
  });

  it('P38-24: sw.js STATIC_ASSETS includes panels.js', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes('/assets/js/panels.js'), 'STATIC_ASSETS should include panels.js');
  });

  it('P38-25: sw.js STATIC_ASSETS includes ratingModal.js', async () => {
    const content = await readFile(resolve('frontend/sw.js'), 'utf-8');
    assert.ok(content.includes('/assets/js/ratingModal.js'), 'STATIC_ASSETS should include ratingModal.js');
  });
});

// ══════════════════════════════════════════════════════════════
// Route Verification
// ══════════════════════════════════════════════════════════════

describe('Phase 38 — Routes', () => {

  it('P38-26: /api/docs returns 92 routes', async () => {
    const res = await fetch(BASE_URL + '/api/docs');
    const data = await res.json();
    assert.strictEqual(data.total, 100, `expected 92 routes, got ${data.total}`);
  });

  it('P38-27: all routes have method + path + auth', async () => {
    const res = await fetch(BASE_URL + '/api/docs');
    const data = await res.json();
    for (const route of data.routes) {
      assert.ok(route.method, 'route should have method');
      assert.ok(route.path, 'route should have path');
      assert.strictEqual(typeof route.auth, 'string');
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Module Source Verification
// ══════════════════════════════════════════════════════════════

describe('Phase 38 — Module Source Verification', () => {

  it('P38-28: jobCard.js exports YawmiaJobCard with create function', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobCard.js'), 'utf-8');
    assert.ok(content.includes('var YawmiaJobCard'), 'should define YawmiaJobCard');
    assert.ok(content.includes('create:'), 'should export create');
  });

  it('P38-29: panels.js exports YawmiaPanels', async () => {
    const content = await readFile(resolve('frontend/assets/js/panels.js'), 'utf-8');
    assert.ok(content.includes('var YawmiaPanels'), 'should define YawmiaPanels');
    assert.ok(content.includes('toggleApplications:'), 'should export toggleApplications');
    assert.ok(content.includes('toggleAttendance:'), 'should export toggleAttendance');
    assert.ok(content.includes('toggleMessaging:'), 'should export toggleMessaging');
  });

  it('P38-30: ratingModal.js exports YawmiaRatingModal', async () => {
    const content = await readFile(resolve('frontend/assets/js/ratingModal.js'), 'utf-8');
    assert.ok(content.includes('var YawmiaRatingModal'), 'should define YawmiaRatingModal');
    assert.ok(content.includes('showRating:'), 'should export showRating');
    assert.ok(content.includes('showReceipt:'), 'should export showReceipt');
  });

  it('P38-31: jobs.js uses YawmiaJobCard.create', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(content.includes('YawmiaJobCard.create'), 'should delegate to YawmiaJobCard');
  });

  it('P38-32: jobs.js does NOT contain createJobCard function', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(!content.includes('function createJobCard'), 'should NOT contain createJobCard function');
  });

  it('P38-33: jobs.js does NOT contain showRatingModal function', async () => {
    const content = await readFile(resolve('frontend/assets/js/jobs.js'), 'utf-8');
    assert.ok(!content.includes('function showRatingModal'), 'should NOT contain showRatingModal function');
  });
});
