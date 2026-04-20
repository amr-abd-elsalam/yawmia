// tests/e2e-payment-flow.test.js
// ═══════════════════════════════════════════════════════════════
// E2E — Full Payment Lifecycle via HTTP (~15 tests)
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

let baseUrl, server, tmpDir, _db, _resetRateLimit;
let employerToken, workerToken, jobId, paymentId, workerId;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-e2e-payment-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit'];
  for (const d of dirs) await mkdir(join(tmpDir, d), { recursive: true });
  process.env.YAWMIA_DATA_PATH = tmpDir;
  process.env.ADMIN_TOKEN = 'e2e-payment-admin-token';

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
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
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

describe('E2E Payment Flow', () => {

  // Setup: Create job → apply → accept → fill → start → complete
  before(async () => {
    if (_resetRateLimit) _resetRateLimit();
    const empLogin = await loginAs('01077700001', 'employer');
    employerToken = empLogin.token;
    await api('PUT', '/api/auth/profile', { name: 'مقاول دفع', governorate: 'alex' }, { Authorization: `Bearer ${employerToken}` });

    const jobRes = await api('POST', '/api/jobs', {
      title: 'فرصة اختبار الدفع',
      category: 'loading', governorate: 'alex',
      workersNeeded: 1, dailyWage: 200, startDate: '2026-05-01', durationDays: 2,
    }, { Authorization: `Bearer ${employerToken}` });
    jobId = jobRes.data.job.id;

    if (_resetRateLimit) _resetRateLimit();
    const wrkLogin = await loginAs('01077700002', 'worker');
    workerToken = wrkLogin.token;
    workerId = wrkLogin.user.id;
    await api('PUT', '/api/auth/profile', { name: 'عامل دفع', governorate: 'alex', categories: ['loading'] }, { Authorization: `Bearer ${workerToken}` });

    const applyRes = await api('POST', `/api/jobs/${jobId}/apply`, {}, { Authorization: `Bearer ${workerToken}` });
    await api('POST', `/api/jobs/${jobId}/accept`, { applicationId: applyRes.data.application.id }, { Authorization: `Bearer ${employerToken}` });

    // Job should be filled now (1 needed, 1 accepted)
    await api('POST', `/api/jobs/${jobId}/start`, {}, { Authorization: `Bearer ${employerToken}` });
    await api('POST', `/api/jobs/${jobId}/complete`, {}, { Authorization: `Bearer ${employerToken}` });

    // Wait for auto-created payment
    await new Promise(r => setTimeout(r, 300));
  });

  it('PAY-01: Payment auto-created after job completion', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/payment`, null, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.payment);
    paymentId = res.data.payment.id;
    assert.ok(paymentId.startsWith('pay_'));
    assert.strictEqual(res.data.payment.status, 'pending');
  });

  it('PAY-02: Payment has correct amounts', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/payment`, null, { Authorization: `Bearer ${employerToken}` });
    const pay = res.data.payment;
    assert.strictEqual(pay.dailyWage, 200);
    assert.strictEqual(pay.durationDays, 2);
    assert.strictEqual(pay.workersAccepted, 1);
    // totalCost = 200 * 2 * 1 = 400 (or adjusted by attendance)
    assert.ok(pay.amount > 0);
    assert.ok(pay.platformFee > 0);
  });

  it('PAY-03: Worker can view payment too', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/payment`, null, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.payment);
  });

  it('PAY-04: Cannot create duplicate payment', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/payment`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.data.code, 'PAYMENT_EXISTS');
  });

  it('PAY-05: Employer confirms payment', async () => {
    const res = await api('POST', `/api/payments/${paymentId}/confirm`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.payment.status, 'employer_confirmed');
  });

  it('PAY-06: Cannot confirm already confirmed payment', async () => {
    const res = await api('POST', `/api/payments/${paymentId}/confirm`, {}, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.data.code, 'INVALID_PAYMENT_STATUS');
  });

  it('PAY-07: Admin completes payment', async () => {
    const res = await api('POST', `/api/admin/payments/${paymentId}/complete`, {}, { 'X-Admin-Token': 'e2e-payment-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.payment.status, 'completed');
  });

  it('PAY-08: Audit log records payment completion', async () => {
    // Wait for fire-and-forget audit log write
    await new Promise(r => setTimeout(r, 200));
    const res = await api('GET', '/api/admin/audit-log?action=payment_completed', null, { 'X-Admin-Token': 'e2e-payment-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.actions.some(a => a.targetId === paymentId));
  });

  it('PAY-09: Financial summary reflects completed payment', async () => {
    const res = await api('GET', '/api/admin/financial-summary', null, { 'X-Admin-Token': 'e2e-payment-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.data.summary.completedAmount > 0);
    assert.ok(res.data.summary.completedPlatformFee > 0);
  });

  // ── Dispute Flow (separate scenario) ──
  it('PAY-10: Create second job for dispute test', async () => {
    if (_resetRateLimit) _resetRateLimit();
    const jobRes = await api('POST', '/api/jobs', {
      title: 'فرصة نزاع', category: 'cleaning', governorate: 'alex',
      workersNeeded: 1, dailyWage: 150, startDate: '2026-06-01', durationDays: 1,
    }, { Authorization: `Bearer ${employerToken}` });
    const j2 = jobRes.data.job.id;

    const applyRes = await api('POST', `/api/jobs/${j2}/apply`, {}, { Authorization: `Bearer ${workerToken}` });
    await api('POST', `/api/jobs/${j2}/accept`, { applicationId: applyRes.data.application.id }, { Authorization: `Bearer ${employerToken}` });
    await api('POST', `/api/jobs/${j2}/start`, {}, { Authorization: `Bearer ${employerToken}` });
    await api('POST', `/api/jobs/${j2}/complete`, {}, { Authorization: `Bearer ${employerToken}` });
    await new Promise(r => setTimeout(r, 300));

    const payRes = await api('GET', `/api/jobs/${j2}/payment`, null, { Authorization: `Bearer ${employerToken}` });
    assert.ok(payRes.data.payment);

    // Store for dispute tests
    globalThis._disputePaymentId = payRes.data.payment.id;
    globalThis._disputeJobId = j2;
  });

  it('PAY-11: Worker can dispute pending payment', async () => {
    const res = await api('POST', `/api/payments/${globalThis._disputePaymentId}/dispute`, {
      reason: 'لم أستلم المبلغ المتفق عليه — اختبار النزاع',
    }, { Authorization: `Bearer ${workerToken}` });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.payment.status, 'disputed');
  });

  it('PAY-12: Cannot dispute already disputed payment', async () => {
    const res = await api('POST', `/api/payments/${globalThis._disputePaymentId}/dispute`, {
      reason: 'محاولة نزاع ثانية',
    }, { Authorization: `Bearer ${employerToken}` });
    assert.strictEqual(res.data.code, 'ALREADY_DISPUTED');
  });

  it('PAY-13: Admin can complete disputed payment (resolution)', async () => {
    const res = await api('POST', `/api/admin/payments/${globalThis._disputePaymentId}/complete`, {}, { 'X-Admin-Token': 'e2e-payment-admin-token' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.payment.status, 'completed');
  });

  it('PAY-14: Financial summary includes both payments', async () => {
    const res = await api('GET', '/api/admin/financial-summary', null, { 'X-Admin-Token': 'e2e-payment-admin-token' });
    assert.ok(res.data.summary.totalPayments >= 2);
  });
});
