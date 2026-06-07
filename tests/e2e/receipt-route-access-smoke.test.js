// ═══════════════════════════════════════════════════════════════
// tests/e2e/receipt-route-access-smoke.test.js
// Patch 35 — Receipt Route Access Smoke
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for receipt route authorization.
//
// Covers:
//   - employer owner can access receipt for owned completed job
//   - accepted worker can access receipt for completed job
//   - non-involved user cannot access receipt
//   - non-completed job is rejected
//   - completed job without payment is rejected
//   - receipt route returns stable receipt shape
//   - receipt financial fields mirror payment record fields
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no ./data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
//   - no OTP weakening
//   - no --confirm
//   - no external services
//   - no dependencies
//   - no backend runtime change
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

async function setupTempDataPath(t) {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-receipt-route-access-smoke-'));

  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = dir;

  t.after(async () => {
    // Safe: removes only this test-created temp directory under os.tmpdir().
    // Never touches ./data.
    await rm(dir, { recursive: true, force: true });
  });

  return dir;
}

async function importFresh(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  url.searchParams.set('t', `${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return await import(url.href);
}

async function loadCoreModules() {
  const [
    database,
    users,
    jobs,
    applications,
    payments,
    analyticsHandler,
  ] = await Promise.all([
    importFresh('../../server/services/database.js'),
    importFresh('../../server/services/users.js'),
    importFresh('../../server/services/jobs.js'),
    importFresh('../../server/services/applications.js'),
    importFresh('../../server/services/payments.js'),
    importFresh('../../server/handlers/analyticsHandler.js'),
  ]);

  await database.initDatabase();

  return {
    database,
    users,
    jobs,
    applications,
    payments,
    analyticsHandler,
  };
}

async function createProfiledUser(users, phone, role, fields = {}) {
  const user = await users.create(phone, role);

  const updated = await users.update(user.id, {
    name: fields.name || (role === 'employer' ? 'صاحب عمل إيصال Route' : 'عامل إيصال Route'),
    governorate: fields.governorate || 'cairo',
    categories: role === 'worker' ? (fields.categories || ['construction']) : [],
    lat: typeof fields.lat === 'number' ? fields.lat : 30.0444,
    lng: typeof fields.lng === 'number' ? fields.lng : 31.2357,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: fields.verificationStatus || 'verified',
  });

  return updated || user;
}

async function waitForPaymentOrCreate(payments, jobId, employerId) {
  for (let i = 0; i < 30; i++) {
    const existing = await payments.listByJob(jobId);
    if (existing.length > 0) return existing[0];
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  const created = await payments.createPayment(jobId, employerId);
  if (created.ok) return created.payment;

  if (created.code === 'PAYMENT_EXISTS') {
    const existing = await payments.listByJob(jobId);
    if (existing.length > 0) return existing[0];
  }

  assert.fail(`payment was not created: ${created.code || created.error || 'unknown'}`);
}

async function createCompletedJobWithPayment(mods, suffix = '001', overrides = {}) {
  const { users, jobs, applications, payments } = mods;

  const employer = await createProfiledUser(users, `01093500${suffix}`, 'employer', {
    name: `صاحب عمل Receipt Route ${suffix}`,
    governorate: 'cairo',
  });

  const worker = await createProfiledUser(users, `01193500${suffix}`, 'worker', {
    name: `عامل Receipt Route ${suffix}`,
    governorate: 'cairo',
    categories: ['construction'],
  });

  const job = await jobs.create(employer.id, {
    title: overrides.title || `فرصة إيصال Route ${suffix}`,
    category: 'construction',
    governorate: 'cairo',
    location: 'وسط البلد',
    area: 'وسط البلد',
    address: 'شارع اختبار receipt route',
    landmark: 'بجوار محطة المترو',
    locationNotes: 'اسأل على بوابة الأمن',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded: 1,
    dailyWage: overrides.dailyWage || 300,
    startDate: '2030-01-01',
    durationDays: overrides.durationDays || 1,
    description: 'فرصة اختبار لمسار إيصال الدفع',
  });

  const applied = await applications.apply(job.id, worker.id);
  assert.equal(applied.ok, true);

  const accepted = await applications.accept(applied.application.id, employer.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.application.status, 'accepted');

  const filledJob = await jobs.findById(job.id);
  assert.equal(filledJob.status, 'filled');

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);
  assert.equal(started.job.status, 'in_progress');

  const completed = await jobs.completeJob(job.id, employer.id);
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, 'completed');

  const payment = await waitForPaymentOrCreate(payments, job.id, employer.id);
  const completedJob = await jobs.findById(job.id);

  return {
    employer,
    worker,
    job: completedJob,
    application: accepted.application,
    payment,
  };
}

function createMockRes() {
  const res = {
    statusCode: null,
    headers: {},
    rawBody: '',
    body: null,
    writableEnded: false,

    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },

    end(payload = '') {
      this.rawBody = typeof payload === 'string' ? payload : String(payload);
      this.writableEnded = true;

      try {
        this.body = this.rawBody ? JSON.parse(this.rawBody) : null;
      } catch (_) {
        this.body = null;
      }
    },
  };

  return res;
}

async function callReceiptHandler(handleGetReceipt, jobId, user) {
  const req = {
    params: { id: jobId },
    query: {},
    user,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };

  const res = createMockRes();

  await handleGetReceipt(req, res);

  assert.equal(res.writableEnded, true, 'handler should end response');
  assert.ok(res.statusCode, 'handler should set statusCode');

  return res;
}

function assertReceiptShape(receipt) {
  assert.ok(receipt, 'receipt should exist');

  assert.equal(typeof receipt.receiptNumber, 'string');
  assert.match(receipt.receiptNumber, /^RCT-\d{8}-\d{3}$/);
  assert.equal(typeof receipt.date, 'string');

  assert.ok(receipt.employer, 'receipt.employer should exist');
  assert.equal(typeof receipt.employer.name, 'string');
  assert.equal(typeof receipt.employer.phone, 'string');

  assert.ok(receipt.job, 'receipt.job should exist');
  assert.equal(typeof receipt.job.title, 'string');
  assert.equal(typeof receipt.job.category, 'string');
  assert.equal(typeof receipt.job.governorate, 'string');
  assert.equal(typeof receipt.job.startDate, 'string');
  assert.equal(typeof receipt.job.durationDays, 'number');

  assert.ok(Array.isArray(receipt.workers), 'receipt.workers should be array');

  assert.equal(typeof receipt.subtotal, 'number');
  assert.equal(typeof receipt.platformFee, 'number');
  assert.equal(typeof receipt.feePercent, 'number');
  assert.equal(typeof receipt.grandTotal, 'number');
  assert.equal(typeof receipt.workerPayout, 'number');
  assert.equal(typeof receipt.paymentMethod, 'string');
  assert.equal(typeof receipt.paymentStatus, 'string');

  assert.ok(receipt.attendance, 'receipt.attendance should exist');
  assert.equal(typeof receipt.attendance.totalDays, 'number');
  assert.equal(typeof receipt.attendance.attendedDays, 'number');
  assert.equal(typeof receipt.attendance.noShows, 'number');
  assert.equal(typeof receipt.attendance.attendanceRate, 'number');
}

function assertReceiptMirrorsPayment(receipt, payment) {
  assert.equal(receipt.subtotal, payment.amount);
  assert.equal(receipt.platformFee, payment.platformFee);
  assert.equal(receipt.workerPayout, payment.workerPayout);
  assert.equal(receipt.grandTotal, payment.amount);
  assert.equal(receipt.paymentMethod, payment.method || 'cash');
  assert.equal(receipt.paymentStatus, payment.status || 'pending');
  assert.deepEqual(receipt.attendanceBreakdown, payment.attendanceBreakdown || null);
}

test('Patch 35: employer owner can access receipt route for owned completed job', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const { employer, job, payment } = await createCompletedJobWithPayment(mods, '001');

  const res = await callReceiptHandler(
    mods.analyticsHandler.handleGetReceipt,
    job.id,
    employer
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.receipt);

  const receipt = res.body.receipt;

  assertReceiptShape(receipt);
  assertReceiptMirrorsPayment(receipt, payment);

  assert.equal(receipt.employer.name, employer.name);
  assert.equal(receipt.employer.phone, employer.phone);
  assert.equal(receipt.job.title, job.title);
  assert.equal(receipt.job.category, job.category);
  assert.equal(receipt.job.governorate, job.governorate);
});

test('Patch 35: accepted worker can access receipt route for completed job', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const { worker, job, payment } = await createCompletedJobWithPayment(mods, '002');

  const res = await callReceiptHandler(
    mods.analyticsHandler.handleGetReceipt,
    job.id,
    worker
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.ok(res.body.receipt);

  const receipt = res.body.receipt;

  assertReceiptShape(receipt);
  assertReceiptMirrorsPayment(receipt, payment);

  assert.equal(receipt.job.title, job.title);
  assert.equal(receipt.workers.length, 1);
  assert.equal(receipt.workers[0].name, worker.name);
});

test('Patch 35: non-involved user cannot access receipt route', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const { job } = await createCompletedJobWithPayment(mods, '003');

  const outsider = await createProfiledUser(mods.users, '01293500003', 'worker', {
    name: 'عامل غير مشارك في الإيصال',
    governorate: 'giza',
    categories: ['cleaning'],
  });

  const res = await callReceiptHandler(
    mods.analyticsHandler.handleGetReceipt,
    job.id,
    outsider
  );

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'NOT_AUTHORIZED');
  assert.equal(typeof res.body.error, 'string');
});

test('Patch 35: non-completed job is rejected by receipt route', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const employer = await createProfiledUser(mods.users, '01093500004', 'employer', {
    name: 'صاحب عمل Job Not Completed',
    governorate: 'cairo',
  });

  const job = await mods.jobs.create(employer.id, {
    title: 'فرصة غير مكتملة للإيصال',
    category: 'construction',
    governorate: 'cairo',
    location: 'وسط البلد',
    area: 'وسط البلد',
    address: 'شارع اختبار رفض الإيصال',
    landmark: 'بجوار محطة المترو',
    locationNotes: 'بوابة رقم 1',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded: 1,
    dailyWage: 300,
    startDate: '2030-01-01',
    durationDays: 1,
    description: 'فرصة غير مكتملة يجب رفض إيصالها',
  });

  assert.equal(job.status, 'open');

  const res = await callReceiptHandler(
    mods.analyticsHandler.handleGetReceipt,
    job.id,
    employer
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, 'JOB_NOT_COMPLETED');
  assert.equal(typeof res.body.error, 'string');
});

test('Patch 35: completed job without payment is rejected by receipt route', async (t) => {
  await setupTempDataPath(t);
  const mods = await loadCoreModules();

  const employer = await createProfiledUser(mods.users, '01093500005', 'employer', {
    name: 'صاحب عمل Completed Without Payment',
    governorate: 'cairo',
  });

  const job = await mods.jobs.create(employer.id, {
    title: 'فرصة مكتملة بدون سجل دفع',
    category: 'construction',
    governorate: 'cairo',
    location: 'وسط البلد',
    area: 'وسط البلد',
    address: 'شارع اختبار إيصال بدون دفع',
    landmark: 'بجوار محطة المترو',
    locationNotes: 'بوابة رقم 2',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded: 1,
    dailyWage: 300,
    startDate: '2030-01-01',
    durationDays: 1,
    description: 'Fixture test only: mark completed without creating payment',
  });

  const updated = await mods.jobs.updateStatus(job.id, 'completed');
  assert.equal(updated.status, 'completed');

  const paymentsForJob = await mods.payments.listByJob(job.id);
  assert.equal(paymentsForJob.length, 0);

  const res = await callReceiptHandler(
    mods.analyticsHandler.handleGetReceipt,
    job.id,
    employer
  );

  assert.equal(res.statusCode, 404);
  assert.equal(res.body.code, 'PAYMENT_NOT_FOUND');
  assert.equal(typeof res.body.error, 'string');
});
