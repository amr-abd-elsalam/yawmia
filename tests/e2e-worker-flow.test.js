// tests/e2e-worker-flow.test.js
// ═══════════════════════════════════════════════════════════════
// E2E — Full Worker Journey via HTTP (~25 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

let baseUrl;
let server;
let tmpDir;
let _db;
let _resetRateLimit;

// Shared state across tests
let workerToken;
let employerToken;
let jobId;
let applicationId;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-e2e-worker-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
  process.env.ADMIN_TOKEN = 'e2e-admin-token';

  const { corsMiddleware } = await import('../server/middleware/cors.js');
  const { requestIdMiddleware } = await import('../server/middleware/requestId.js');
  const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');
  const { rateLimitMiddleware, resetRateLimit } = await import('../server/middleware/rateLimit.js');
  const { createRouter } = await import('../server/router.js');

  _resetRateLimit = resetRateLimit;
  _db = await import('../server/services/database.js');
  await _db.initDatabase();

  const router = createRouter();

  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
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

  await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise(resolve => server.close(resolve));
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

async function api(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(baseUrl + path, opts);
  const data = await res.json();
  return { status: res.status, data };
}

async function getOtp(phone) {
  const otpPath = _db.getRecordPath('otp', phone);
  const data = await _db.readJSON(otpPath);
  if (!data) return null;
  if (data.otp) return data.otp;
  const crypto = await import('node:crypto');
  for (let i = 1000; i <= 9999; i++) {
    const hash = crypto.createHash('sha256').update(String(i)).digest('hex');
    if (hash === data.otpHash) return String(i);
  }
  return null;
}

async function loginAs(phone, role) {
  if (_resetRateLimit) _resetRateLimit();
  await api('POST', '/api/auth/send-otp', { phone, role });
  const otp = await getOtp(phone);
  const res = await api('POST', '/api/auth/verify-otp', { phone, otp });
  return res.data.token;
}

// ══════════════════════════════════════════════════════════════

describe('E2E Worker Flow', () => {

  // ── Setup: Create employer + job first ──────────────────
  before(async () => {
    if (_resetRateLimit) _resetRateLimit();
    employerToken = await loginAs('01055500001', 'employer');
    await api('PUT', '/api/auth/profile', {
      name: 'صاحب عمل تست',
      governorate: 'cairo',
    }, { Authorization: `Bearer ${employerToken}` });

    const jobRes = await api('POST', '/api/jobs', {
      title: 'فرصة شغل E2E تست',
      category: 'farming',
      governorate: 'cairo',
      workersNeeded: 5,
      dailyWage: 250,
      startDate: '2026-05-01',
      durationDays: 3,
    }, { Authorization: `Bearer ${employerToken}` });
    jobId = jobRes.data.job.id;
  });

  it('W-01: Worker sends OTP', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const res = await api('POST', '/api/auth/send-otp', { phone: '01055500002', role: 'worker' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  });

  it('W-02: Worker verifies OTP and gets token', async () => {
    const otp = await getOtp('01055500002');
    const res = await api('POST', '/api/auth/verify-otp', { phone: '01055500002', otp });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.token);
    workerToken = res.data.token;
  });

  it('W-03: Worker updates profile', async () => {
    const res = await api('PUT', '/api/auth/profile', {
      name: 'عامل تست E2E',
      governorate: 'cairo',
      categories: ['farming', 'construction'],
    }, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.name, 'عامل تست E2E');
  });

  it('W-04: Worker gets profile', async () => {
    const res = await api('GET', '/api/auth/me', null, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.role, 'worker');
    assert.strictEqual(res.data.user.governorate, 'cairo');
  });

  it('W-05: Worker lists jobs', async () => {
    const res = await api('GET', '/api/jobs');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.jobs.length > 0);
  });

  it('W-06: Worker views job detail', async () => {
    const res = await api('GET', `/api/jobs/${jobId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.job.id, jobId);
  });

  it('W-07: Worker applies to job', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const res = await api('POST', `/api/jobs/${jobId}/apply`, {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.ok, true);
    applicationId = res.data.application.id;
  });

  it('W-08: Worker lists their applications', async () => {
    const res = await api('GET', '/api/applications/mine', null, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.applications.length > 0);
  });

  it('W-09: Worker cannot apply to same job again', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/apply`, {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.data.code, 'ALREADY_APPLIED');
  });

  it('W-10: Worker withdraws application', async () => {
    const res = await api('POST', `/api/applications/${applicationId}/withdraw`, {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.application.status, 'withdrawn');
  });

  it('W-11: Worker re-applies after withdraw', async () => {
    if (_resetRateLimit) _resetRateLimit();
    // Need a new job since the old application exists (even if withdrawn)
    const jobRes = await api('POST', '/api/jobs', {
      title: 'فرصة تانية E2E',
      category: 'construction',
      governorate: 'cairo',
      workersNeeded: 3,
      dailyWage: 300,
      startDate: '2026-05-02',
      durationDays: 2,
    }, { Authorization: `Bearer ${employerToken}` });
    const newJobId = jobRes.data.job.id;

    const res = await api('POST', `/api/jobs/${newJobId}/apply`, {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 201);

    // Accept + start for later attendance tests
    const appsRes = await api('GET', `/api/jobs/${newJobId}/applications`, null, { Authorization: `Bearer ${employerToken}` });
    const appId = appsRes.data.applications[0].id;
    await api('POST', `/api/jobs/${newJobId}/accept`, { applicationId: appId }, { Authorization: `Bearer ${employerToken}` });
  });

  it('W-12: Worker lists notifications', async () => {
    const res = await api('GET', '/api/notifications?limit=10&offset=0', null, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.items));
  });

  it('W-13: Worker marks all notifications as read', async () => {
    const res = await api('POST', '/api/notifications/read-all', {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  });

  it('W-14: Worker views employer public profile', async () => {
    // Get employer user ID from job detail
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    const employerId = jobRes.data.job.employerId;
    const res = await api('GET', `/api/users/${employerId}/public-profile`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.profile);
  });

  it('W-15: Worker views employer rating summary', async () => {
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    const employerId = jobRes.data.job.employerId;
    const res = await api('GET', `/api/users/${employerId}/rating-summary`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.data.avg, 'number');
  });

  it('W-16: Worker submits report', async () => {
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    const employerId = jobRes.data.job.employerId;
    const res = await api('POST', '/api/reports', {
      targetId: employerId,
      type: 'fraud',
      reason: 'تقرير تجريبي لاختبار النظام — E2E test',
      jobId,
    }, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.ok, true);
  });

  it('W-17: Worker accepts terms', async () => {
    const res = await api('POST', '/api/auth/accept-terms', {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.ok, true);
  });

  it('W-18: Worker views trust score of employer', async () => {
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    const employerId = jobRes.data.job.employerId;
    const res = await api('GET', `/api/users/${employerId}/trust-score`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.data.score, 'number');
  });

  it('W-19: Worker cannot create jobs', async () => {
    const res = await api('POST', '/api/jobs', {
      title: 'test', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-05-01', durationDays: 1,
    }, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 403);
  });

  it('W-20: Worker views verification status', async () => {
    const res = await api('GET', '/api/auth/verification-status', null, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.verificationStatus);
  });

  it('W-21: Worker can logout', async () => {
    // Login fresh for this test
    if (_resetRateLimit) _resetRateLimit();
    const tempToken = await loginAs('01055500099', 'worker');
    const res = await api('POST', '/api/auth/logout', {}, { Authorization: `Bearer ${tempToken}` });
    assert.strictEqual(res.status, 200);
    // Token should be invalid now
    const res2 = await api('GET', '/api/auth/me', null, { Authorization: `Bearer ${tempToken}` });
    assert.strictEqual(res2.status, 401);
  });

  it('W-22: Health endpoint works', async () => {
    const res = await api('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.status, 'ok');
    assert.strictEqual(res.data.version, '0.34.0');
    assert.ok(res.data.environment);
  });

  it('W-23: API docs endpoint works', async () => {
    const res = await api('GET', '/api/docs');
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.routes);
    assert.strictEqual(res.data.total, 92);
  });
});
