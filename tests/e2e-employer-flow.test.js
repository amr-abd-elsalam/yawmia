// tests/e2e-employer-flow.test.js
// ═══════════════════════════════════════════════════════════════
// E2E — Full Employer Journey via HTTP (~25 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

let baseUrl, server, tmpDir, _db, _resetRateLimit;
let employerToken, workerToken, jobId, applicationId, workerId;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-e2e-employer-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit'];
  for (const d of dirs) await mkdir(join(tmpDir, d), { recursive: true });
  process.env.YAWMIA_DATA_PATH = tmpDir;
  process.env.ADMIN_TOKEN = 'e2e-employer-admin-token';

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
          bodyParserMiddleware(req, res, () => { router(req, res); });
        });
      });
    });
  });

  await new Promise(r => server.listen(0, '127.0.0.1', () => { baseUrl = `http://127.0.0.1:${server.address().port}`; r(); }));
});

after(async () => {
  await new Promise(r => server.close(r));
  if (tmpDir) { try { await rm(tmpDir, { recursive: true, force: true }); } catch(_) {} }
});

async function api(method, path, body, headers = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body && (method === 'POST' || method === 'PUT' || method === 'DELETE')) opts.body = JSON.stringify(body);
  const res = await fetch(baseUrl + path, opts);
  return { status: res.status, data: await res.json() };
}

async function getOtp(phone) {
  const data = await _db.readJSON(_db.getRecordPath('otp', phone));
  return data ? data.otp : null;
}

async function loginAs(phone, role) {
  if (_resetRateLimit) _resetRateLimit();
  await api('POST', '/api/auth/send-otp', { phone, role });
  const otp = await getOtp(phone);
  const res = await api('POST', '/api/auth/verify-otp', { phone, otp });
  return res.data;
}

describe('E2E Employer Flow', () => {

  it('E-01: Employer registers and gets token', async () => {
    const login = await loginAs('01066600001', 'employer');
    assert.ok(login.token);
    employerToken = login.token;
  });

  it('E-02: Employer updates profile', async () => {
    const res = await api('PUT', '/api/auth/profile', { name: 'مقاول E2E', governorate: 'giza' }, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.user.name, 'مقاول E2E');
  });

  it('E-03: Employer creates job', async () => {
    const res = await api('POST', '/api/jobs', {
      title: 'بناء فيلا E2E تست',
      category: 'construction', governorate: 'giza',
      workersNeeded: 2, dailyWage: 300, startDate: '2026-05-01', durationDays: 5,
    }, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 201);
    jobId = res.data.job.id;
  });

  it('E-04: Employer lists own jobs', async () => {
    const res = await api('GET', '/api/jobs/mine', null, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.jobs.some(j => j.id === jobId));
  });

  it('E-05: Worker applies to job', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const login = await loginAs('01066600002', 'worker');
    workerToken = login.token;
    workerId = login.user.id;
    await api('PUT', '/api/auth/profile', { name: 'عامل E2E', governorate: 'giza', categories: ['construction'] }, { Authorization: `Bearer ${workerToken}` });
    const res = await api('POST', `/api/jobs/${jobId}/apply`, {}, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 201);
    applicationId = res.data.application.id;
  });

  it('E-06: Employer lists job applications', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/applications`, null, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.applications.length > 0);
  });

  it('E-07: Employer accepts worker', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/accept`, { applicationId }, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.application.status, 'accepted');
  });

  it('E-08: Add second worker and fill job', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const login2 = await loginAs('01066600003', 'worker');
    await api('PUT', '/api/auth/profile', { name: 'عامل٢', governorate: 'giza', categories: ['construction'] }, { Authorization: `Bearer ${login2.token}` });
    const applyRes = await api('POST', `/api/jobs/${jobId}/apply`, {}, { Authorization: `Bearer ${login2.token}` });
    await api('POST', `/api/jobs/${jobId}/accept`, { applicationId: applyRes.data.application.id }, { Authorization: `Bearer ${employerToken}` });
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    assert.strictEqual(jobRes.data.job.status, 'filled');
  });

  it('E-09: Employer starts job', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/start`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.job.status, 'in_progress');
  });

  it('E-10: Employer manual check-in for worker', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/manual-checkin`, { workerId }, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 201);
    assert.ok(res.data.attendance);
  });

  it('E-11: Employer views attendance', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/attendance`, null, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.records.length > 0);
  });

  it('E-12: Employer views attendance summary', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/attendance/summary`, null, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.summary);
  });

  it('E-13: Employer completes job', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/complete`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.job.status, 'completed');
  });

  it('E-14: Payment auto-created on completion', async () => {
    // Wait briefly for fire-and-forget payment creation
    await new Promise(r => setTimeout(r, 200));
    const res = await api('GET', `/api/jobs/${jobId}/payment`, null, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.payment);
    assert.strictEqual(res.data.payment.status, 'pending');
  });

  it('E-15: Employer confirms payment', async () => {
    const payRes = await api('GET', `/api/jobs/${jobId}/payment`, null, { Authorization: `Bearer ${employerToken}` });
    const payId = payRes.data.payment.id;
    const res = await api('POST', `/api/payments/${payId}/confirm`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.payment.status, 'employer_confirmed');
  });

  it('E-16: Employer rates worker', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/rate`, {
      toUserId: workerId, stars: 5, comment: 'شغل ممتاز',
    }, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 201);
  });

  it('E-17: Employer creates and cancels a job', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const jobRes = await api('POST', '/api/jobs', {
      title: 'فرصة هتتلغي', category: 'farming', governorate: 'cairo',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-06-01', durationDays: 1,
    }, { Authorization: `Bearer ${employerToken}` });
    const cancelRes = await api('POST', `/api/jobs/${jobRes.data.job.id}/cancel`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.job.status, 'cancelled');
  });

  it('E-18: Employer renews cancelled job', async () => {
    // Find the cancelled job
    const myJobs = await api('GET', '/api/jobs/mine?limit=50', null, { Authorization: `Bearer ${employerToken}` });
    const cancelled = myJobs.data.jobs.find(j => j.status === 'cancelled');
    assert.ok(cancelled, 'should have a cancelled job');
    const res = await api('POST', `/api/jobs/${cancelled.id}/renew`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.job.status, 'open');
  });

  it('E-19: Admin stats accessible with admin token', async () => {
    const res = await api('GET', '/api/admin/stats', null, { 'X-Admin-Token': 'e2e-employer-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.stats);
  });

  it('E-20: Admin users list accessible', async () => {
    const res = await api('GET', '/api/admin/users', null, { 'X-Admin-Token': 'e2e-employer-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.users.length > 0);
  });

  it('E-21: Admin jobs list accessible', async () => {
    const res = await api('GET', '/api/admin/jobs', null, { 'X-Admin-Token': 'e2e-employer-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.jobs.length > 0);
  });

  it('E-22: Admin financial summary accessible', async () => {
    const res = await api('GET', '/api/admin/financial-summary', null, { 'X-Admin-Token': 'e2e-employer-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.summary);
  });

  it('E-23: Admin audit log accessible', async () => {
    const res = await api('GET', '/api/admin/audit-log', null, { 'X-Admin-Token': 'e2e-employer-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.data.actions));
  });

  it('E-24: Worker can rate employer after completion', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const jobRes = await api('GET', `/api/jobs/${jobId}`);
    const employerId = jobRes.data.job.employerId;
    const res = await api('POST', `/api/jobs/${jobId}/rate`, {
      toUserId: employerId, stars: 4, comment: 'صاحب عمل محترم',
    }, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 201);
  });

  it('E-25: Job ratings list works', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/ratings`);
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.ratings.length >= 2);
  });
});
