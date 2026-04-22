// tests/security.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 5 — Security Headers + CORS Tests (HTTP Integration)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let server;
let BASE;
let tmpDir;
let _db;

describe('Security Headers & CORS', () => {

  before(async () => {
    // Create temp data directory
    tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-sec-'));
    const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings'];
    for (const d of dirs) {
      await mkdir(join(tmpDir, d), { recursive: true });
    }
    process.env.YAWMIA_DATA_PATH = tmpDir;

    // Import middleware and router (build our own server like integration-http)
    const { corsMiddleware } = await import('../server/middleware/cors.js');
    const { securityMiddleware } = await import('../server/middleware/security.js');
    const { requestIdMiddleware } = await import('../server/middleware/requestId.js');
    const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');
    const { rateLimitMiddleware } = await import('../server/middleware/rateLimit.js');
    const { createRouter } = await import('../server/router.js');

    _db = await import('../server/services/database.js');
    const router = createRouter();

    server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      req.pathname = url.pathname;
      req.query = Object.fromEntries(url.searchParams);

      corsMiddleware(req, res, () => {
        securityMiddleware(req, res, () => {
          requestIdMiddleware(req, res, () => {
            rateLimitMiddleware(req, res, () => {
              bodyParserMiddleware(req, res, () => {
                router(req, res);
              });
            });
          });
        });
      });
    });

    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        BASE = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('SEC-01: GET /api/health has X-Content-Type-Options: nosniff', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('SEC-02: GET /api/health has X-Frame-Options: DENY', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.strictEqual(res.headers.get('x-frame-options'), 'DENY');
  });

  it('SEC-03: GET /api/health has Referrer-Policy header', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.strictEqual(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  it('SEC-04: GET /api/health has Content-Security-Policy header', async () => {
    const res = await fetch(`${BASE}/api/health`);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'CSP header should be present');
    assert.ok(csp.includes("default-src 'self'"), 'CSP should include default-src');
  });

  it('SEC-05: GET /api/health has X-Request-Id header (still present)', async () => {
    const res = await fetch(`${BASE}/api/health`);
    const reqId = res.headers.get('x-request-id');
    assert.ok(reqId, 'X-Request-Id should be present');
  });

  it('SEC-06: GET /api/health has CORS Access-Control-Allow-Origin header', async () => {
    const res = await fetch(`${BASE}/api/health`);
    const origin = res.headers.get('access-control-allow-origin');
    assert.ok(origin, 'CORS origin header should be present');
  });

  it('SEC-07: OPTIONS request returns 204 with CORS headers', async () => {
    const res = await fetch(`${BASE}/api/health`, { method: 'OPTIONS' });
    assert.strictEqual(res.status, 204);
    const methods = res.headers.get('access-control-allow-methods');
    assert.ok(methods, 'Allow-Methods should be present');
    const headers = res.headers.get('access-control-allow-headers');
    assert.ok(headers.includes('X-Admin-Token'), 'Allow-Headers should include X-Admin-Token');
  });

  it('SEC-08: POST /api/jobs with XSS in title — sanitized before storage', async () => {
    // Register an employer — send OTP then read it from file
    await fetch(`${BASE}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678', role: 'employer' }),
    });

    // Read OTP from file — brute-force from hash (Phase 27+ stores otpHash)
    const otpPath = _db.getRecordPath('otp', '01012345678');
    const otpFile = await _db.readJSON(otpPath);
    let otp = otpFile.otp;
    if (!otp && otpFile.otpHash) {
      const crypto = await import('node:crypto');
      for (let i = 1000; i <= 9999; i++) {
        const hash = crypto.createHash('sha256').update(String(i)).digest('hex');
        if (hash === otpFile.otpHash) { otp = String(i); break; }
      }
    }

    const verifyRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678', otp }),
    });
    const verifyData = await verifyRes.json();
    const token = verifyData.token;

    // Create job with XSS payload
    const jobRes = await fetch(`${BASE}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        title: '<script>alert(1)</script>فرصة بناء',
        category: 'construction',
        governorate: 'cairo',
        workersNeeded: 5,
        dailyWage: 250,
        startDate: '2026-05-01',
        durationDays: 3,
        description: '<img onerror=alert(1)>وصف الفرصة',
      }),
    });
    const jobData = await jobRes.json();
    assert.strictEqual(jobData.ok, true, 'Job should be created');
    assert.ok(!jobData.job.title.includes('<script>'), 'Title should not contain <script> tag');
    assert.ok(!jobData.job.description.includes('<img'), 'Description should not contain <img> tag');
    assert.ok(jobData.job.title.includes('فرصة بناء'), 'Title should preserve Arabic text');
  });

});
