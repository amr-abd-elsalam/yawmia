// tests/security.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 5 — Security Headers + CORS Tests (HTTP Integration)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let server;
let BASE;

describe('Security Headers & CORS', () => {

  before(async () => {
    // Create temp data directory
    const tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-sec-'));
    process.env.YAWMIA_DATA_PATH = tmpDir;
    process.env.PORT = '0';  // random port

    // Import server fresh
    const mod = await import('../server.js');
    server = mod.server;

    // Wait for server to be listening
    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.on('listening', resolve);
    });

    const addr = server.address();
    BASE = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (process.env.YAWMIA_DATA_PATH) {
      await rm(process.env.YAWMIA_DATA_PATH, { recursive: true, force: true });
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
    // First register an employer
    const otpRes = await fetch(`${BASE}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678', role: 'employer' }),
    });
    const otpData = await otpRes.json();

    const verifyRes = await fetch(`${BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '01012345678', otp: otpData.otp }),
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
