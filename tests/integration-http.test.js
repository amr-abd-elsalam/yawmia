// tests/integration-http.test.js
// ═══════════════════════════════════════════════════════════════
// HTTP Integration Tests (~30 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, rm, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let baseUrl;
let server;
let tmpDir;
let closeServer;
let _resetRateLimit;
let _db;

before(async () => {
  // Create temp data directory
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-http-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
  process.env.ADMIN_TOKEN = 'test-admin-token-123';

  // Import modules after env is set
  const { corsMiddleware } = await import('../server/middleware/cors.js');
  const { requestIdMiddleware } = await import('../server/middleware/requestId.js');
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');
  const { rateLimitMiddleware, resetRateLimit } = await import('../server/middleware/rateLimit.js');
  const { createRouter } = await import('../server/router.js');

  _resetRateLimit = resetRateLimit;
  _db = await import('../server/services/database.js');

  const router = createRouter();

  server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
    req.pathname = url.pathname;
    req.query = Object.fromEntries(url.searchParams);

    corsMiddleware(req, res, () => {
      requestIdMiddleware(req, res, () => {
        rateLimitMiddleware(req, res, () => {
          bodyParserMiddleware(req, res, () => {
            router(req, res);
          });
        });
      });
    });
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  closeServer = () => new Promise((resolve) => {
    server.close(() => resolve());
  });
});

after(async () => {
  if (closeServer) await closeServer();
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

// ── Helper functions ──────────────────────────────────────────
async function api(method, path, body, headers = {}) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body && (method === 'POST' || method === 'PUT')) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + path, opts);
  const data = await res.json();
  return { status: res.status, data, headers: res.headers };
}

async function getOtpForPhone(phone) {
  // Read via the database module so we use the same BASE_PATH it resolved
  const otpPath = _db.getRecordPath('otp', phone);
  const data = await _db.readJSON(otpPath);
  if (!data) {
    throw new Error(`OTP file not found for ${phone} at ${otpPath}`);
  }
  // Phase 27+ uses otpHash instead of plain otp — brute-force 4-digit OTP for testing
  if (data.otp) return data.otp;  // legacy support
  // Since OTP is hashed, we brute-force the 4-digit code for test purposes
  const crypto = await import('node:crypto');
  for (let i = 1000; i <= 9999; i++) {
    const hash = crypto.createHash('sha256').update(String(i)).digest('hex');
    if (hash === data.otpHash) return String(i);
  }
  throw new Error(`Could not resolve OTP for ${phone}`);
}

async function registerAndLogin(phone, role) {
  await api('POST', '/api/auth/send-otp', { phone, role });
  const otp = await getOtpForPhone(phone);
  const res = await api('POST', '/api/auth/verify-otp', { phone, otp });
  return res.data;
}

describe('HTTP Integration Tests', () => {

  // ── Health & Config ──────────────────────────────────────
  describe('Health & Config', () => {
    it('H-01: GET /api/health returns ok', async () => {
      const res = await api('GET', '/api/health');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.status, 'ok');
      assert.ok(res.data.brand);
    });

    it('H-02: GET /api/config returns BRAND and CATEGORIES', async () => {
      const res = await api('GET', '/api/config');
      assert.strictEqual(res.status, 200);
      assert.ok(res.data.BRAND);
      assert.ok(res.data.LABOR_CATEGORIES);
      assert.ok(res.data.REGIONS);
    });

    it('H-03: X-Request-Id header present', async () => {
      const res = await api('GET', '/api/health');
      assert.ok(res.headers.get('x-request-id'));
    });

    it('H-04: 404 for unknown route', async () => {
      const res = await api('GET', '/api/unknown');
      assert.strictEqual(res.status, 404);
      assert.strictEqual(res.data.code, 'NOT_FOUND');
    });

    it('H-05: CORS headers present', async () => {
      const res = await api('GET', '/api/health');
      assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
    });
  });

  // ── Auth: Send OTP ──────────────────────────────────────
  describe('Auth: Send OTP', () => {
    it('H-06: sends OTP for valid phone', async () => {
      const res = await api('POST', '/api/auth/send-otp', {
        phone: '01012340001',
        role: 'worker',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
    });

    it('H-07: rejects invalid phone', async () => {
      const res = await api('POST', '/api/auth/send-otp', {
        phone: '123',
        role: 'worker',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'INVALID_PHONE');
    });

    it('H-08: rejects invalid role', async () => {
      const res = await api('POST', '/api/auth/send-otp', {
        phone: '01012340002',
        role: 'invalid',
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'INVALID_ROLE');
    });

    it('H-09: rejects admin role registration', async () => {
      const res = await api('POST', '/api/auth/send-otp', {
        phone: '01012340003',
        role: 'admin',
      });
      assert.strictEqual(res.status, 403);
    });
  });

  // ── Auth: Verify OTP ────────────────────────────────────
  describe('Auth: Verify OTP', () => {
    before(() => {
      if (_resetRateLimit) _resetRateLimit();
    });

    it('H-10: verifies OTP and returns token', async () => {
      await api('POST', '/api/auth/send-otp', { phone: '01012340010', role: 'worker' });
      const otp = await getOtpForPhone('01012340010');
      const res = await api('POST', '/api/auth/verify-otp', { phone: '01012340010', otp });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok(res.data.token);
      assert.ok(res.data.token.startsWith('ses_'));
      assert.ok(res.data.user);
    });

    it('H-11: rejects wrong OTP', async () => {
      await api('POST', '/api/auth/send-otp', { phone: '01012340011', role: 'worker' });
      const otp = await getOtpForPhone('01012340011');
      const wrongOtp = otp === '0000' ? '1111' : '0000';
      const res = await api('POST', '/api/auth/verify-otp', { phone: '01012340011', otp: wrongOtp });
      assert.strictEqual(res.status, 401);
    });

    it('H-12: rejects invalid OTP format', async () => {
      const res = await api('POST', '/api/auth/verify-otp', { phone: '01012340012', otp: 'ab' });
      assert.strictEqual(res.status, 400);
    });
  });

  // ── Auth: Protected Routes ──────────────────────────────
  describe('Auth: Protected Routes', () => {
    before(() => {
      if (_resetRateLimit) _resetRateLimit();
    });

    it('H-13: GET /api/auth/me returns 401 without token', async () => {
      const res = await api('GET', '/api/auth/me');
      assert.strictEqual(res.status, 401);
      assert.strictEqual(res.data.code, 'AUTH_REQUIRED');
    });

    it('H-14: GET /api/auth/me returns user with valid token', async () => {
      const login = await registerAndLogin('01012340014', 'worker');
      const res = await api('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.strictEqual(res.data.user.phone, '01012340014');
    });

    it('H-15: PUT /api/auth/profile updates user data', async () => {
      const login = await registerAndLogin('01012340015', 'worker');
      const res = await api('PUT', '/api/auth/profile', {
        name: 'أحمد تست',
        governorate: 'cairo',
        categories: ['farming'],
      }, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.strictEqual(res.data.user.name, 'أحمد تست');
    });

    it('H-16: POST /api/auth/logout destroys session', async () => {
      const login = await registerAndLogin('01012340016', 'worker');
      const res = await api('POST', '/api/auth/logout', {}, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);

      // Token should no longer work
      const res2 = await api('GET', '/api/auth/me', null, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res2.status, 401);
    });
  });

  // ── Jobs: CRUD ──────────────────────────────────────────
  describe('Jobs: CRUD', () => {
    before(() => {
      // Reset rate limit counter before Jobs suite
      if (_resetRateLimit) _resetRateLimit();
    });

    it('H-17: POST /api/jobs creates job (employer)', async () => {
      const login = await registerAndLogin('01012340017', 'employer');
      const res = await api('POST', '/api/jobs', {
        title: 'فرصة شغل تجريبية',
        category: 'farming',
        governorate: 'fayoum',
        workersNeeded: 10,
        dailyWage: 250,
        startDate: '2026-04-25',
        durationDays: 2,
      }, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.ok, true);
      assert.ok(res.data.job.id);
      assert.strictEqual(res.data.job.totalCost, 5000);
      assert.strictEqual(res.data.job.platformFee, 750);
    });

    it('H-18: POST /api/jobs rejects worker role', async () => {
      const login = await registerAndLogin('01012340018', 'worker');
      const res = await api('POST', '/api/jobs', {
        title: 'test job',
        category: 'farming',
        governorate: 'cairo',
        workersNeeded: 5,
        dailyWage: 200,
        startDate: '2026-04-25',
        durationDays: 1,
      }, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res.status, 403);
    });

    it('H-19: POST /api/jobs rejects invalid fields', async () => {
      const login = await registerAndLogin('01012340019', 'employer');
      const res = await api('POST', '/api/jobs', {
        title: '',
      }, {
        Authorization: `Bearer ${login.token}`,
      });
      assert.strictEqual(res.status, 400);
    });

    it('H-20: GET /api/jobs returns list', async () => {
      const res = await api('GET', '/api/jobs');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok(Array.isArray(res.data.jobs));
    });

    it('H-21: GET /api/jobs filters by governorate', async () => {
      const login = await registerAndLogin('01012340021', 'employer');
      await api('POST', '/api/jobs', {
        title: 'شغل في الفيوم للتصفية',
        category: 'farming',
        governorate: 'fayoum',
        workersNeeded: 5,
        dailyWage: 200,
        startDate: '2026-04-25',
        durationDays: 1,
      }, { Authorization: `Bearer ${login.token}` });

      const res = await api('GET', '/api/jobs?governorate=fayoum');
      assert.strictEqual(res.status, 200);
      for (const job of res.data.jobs) {
        assert.strictEqual(job.governorate, 'fayoum');
      }
    });

    it('H-22: GET /api/jobs/:id returns job detail', async () => {
      const login = await registerAndLogin('01012340022', 'employer');
      const createRes = await api('POST', '/api/jobs', {
        title: 'فرصة تفاصيل الفرصة',
        category: 'construction',
        governorate: 'cairo',
        workersNeeded: 3,
        dailyWage: 300,
        startDate: '2026-04-25',
        durationDays: 5,
      }, { Authorization: `Bearer ${login.token}` });

      const jobId = createRes.data.job.id;
      const res = await api('GET', `/api/jobs/${jobId}`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.strictEqual(res.data.job.id, jobId);
    });

    it('H-23: GET /api/jobs/:id returns 404 for non-existent', async () => {
      const res = await api('GET', '/api/jobs/job_nonexistent123');
      assert.strictEqual(res.status, 404);
    });
  });

  // ── Applications ────────────────────────────────────────
  describe('Applications', () => {
    beforeEach(() => {
      // Reset rate limit counter before each application test (OTP heavy)
      if (_resetRateLimit) _resetRateLimit();
    });

    it('H-24: POST /api/jobs/:id/apply creates application (worker)', async () => {
      const employer = await registerAndLogin('01012340024', 'employer');
      const jobRes = await api('POST', '/api/jobs', {
        title: 'فرصة للتقديم عليها',
        category: 'farming',
        governorate: 'cairo',
        workersNeeded: 5,
        dailyWage: 200,
        startDate: '2026-04-25',
        durationDays: 1,
      }, { Authorization: `Bearer ${employer.token}` });

      const worker = await registerAndLogin('01012340124', 'worker');
      const res = await api('POST', `/api/jobs/${jobRes.data.job.id}/apply`, {}, {
        Authorization: `Bearer ${worker.token}`,
      });
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.data.ok, true);
      assert.strictEqual(res.data.application.status, 'pending');
    });

    it('H-25: rejects duplicate application', async () => {
      const employer = await registerAndLogin('01012340025', 'employer');
      const jobRes = await api('POST', '/api/jobs', {
        title: 'فرصة للتكرار',
        category: 'farming',
        governorate: 'cairo',
        workersNeeded: 5,
        dailyWage: 200,
        startDate: '2026-04-25',
        durationDays: 1,
      }, { Authorization: `Bearer ${employer.token}` });

      const worker = await registerAndLogin('01012340125', 'worker');
      await api('POST', `/api/jobs/${jobRes.data.job.id}/apply`, {}, {
        Authorization: `Bearer ${worker.token}`,
      });
      const res = await api('POST', `/api/jobs/${jobRes.data.job.id}/apply`, {}, {
        Authorization: `Bearer ${worker.token}`,
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.data.code, 'ALREADY_APPLIED');
    });

    it('H-26: employer can accept application', async () => {
      const employer = await registerAndLogin('01012340026', 'employer');
      const jobRes = await api('POST', '/api/jobs', {
        title: 'فرصة للقبول',
        category: 'farming',
        governorate: 'cairo',
        workersNeeded: 5,
        dailyWage: 200,
        startDate: '2026-04-25',
        durationDays: 1,
      }, { Authorization: `Bearer ${employer.token}` });

      const worker = await registerAndLogin('01012340126', 'worker');
      const applyRes = await api('POST', `/api/jobs/${jobRes.data.job.id}/apply`, {}, {
        Authorization: `Bearer ${worker.token}`,
      });

      const res = await api('POST', `/api/jobs/${jobRes.data.job.id}/accept`, {
        applicationId: applyRes.data.application.id,
      }, { Authorization: `Bearer ${employer.token}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.strictEqual(res.data.application.status, 'accepted');
    });

    it('H-27: employer can reject application', async () => {
      const employer = await registerAndLogin('01012340027', 'employer');
      const jobRes = await api('POST', '/api/jobs', {
        title: 'فرصة للرفض',
        category: 'farming',
        governorate: 'cairo',
        workersNeeded: 5,
        dailyWage: 200,
        startDate: '2026-04-25',
        durationDays: 1,
      }, { Authorization: `Bearer ${employer.token}` });

      const worker = await registerAndLogin('01012340127', 'worker');
      const applyRes = await api('POST', `/api/jobs/${jobRes.data.job.id}/apply`, {}, {
        Authorization: `Bearer ${worker.token}`,
      });

      const res = await api('POST', `/api/jobs/${jobRes.data.job.id}/reject`, {
        applicationId: applyRes.data.application.id,
      }, { Authorization: `Bearer ${employer.token}` });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.strictEqual(res.data.application.status, 'rejected');
    });
  });

  // ── Admin ───────────────────────────────────────────────
  describe('Admin', () => {
    before(() => {
      // Reset rate limit counter before Admin suite
      if (_resetRateLimit) _resetRateLimit();
    });

    it('H-28: GET /api/admin/stats returns 401 without admin token', async () => {
      const res = await api('GET', '/api/admin/stats');
      assert.strictEqual(res.status, 401);
    });

    it('H-29: GET /api/admin/stats works with admin token', async () => {
      const res = await api('GET', '/api/admin/stats', null, {
        'X-Admin-Token': 'test-admin-token-123',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok(res.data.stats);
      assert.ok(res.data.stats.users);
      assert.ok(res.data.stats.jobs);
    });

    it('H-30: GET /api/admin/users returns user list', async () => {
      const res = await api('GET', '/api/admin/users', null, {
        'X-Admin-Token': 'test-admin-token-123',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok(Array.isArray(res.data.users));
    });

    it('H-31: GET /api/admin/jobs returns job list', async () => {
      const res = await api('GET', '/api/admin/jobs', null, {
        'X-Admin-Token': 'test-admin-token-123',
      });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.data.ok, true);
      assert.ok(Array.isArray(res.data.jobs));
    });
  });

  // ── Rate Limiting ──────────────────────────────────────
  describe('Rate Limiting', () => {
    it('H-32: rate limit headers present', async () => {
      if (_resetRateLimit) _resetRateLimit();
      const res = await api('GET', '/api/health');
      assert.ok(res.headers.get('x-ratelimit-limit'));
      assert.ok(res.headers.get('x-ratelimit-remaining'));
    });
  });
});
