// ═══════════════════════════════════════════════════════════════
// tests/e2e/receipt-generation-smoke.test.js
// Patch 34 — Receipt Generation + Attendance-adjusted Payment Smoke
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for finance-sensitive receipt workflows.
//
// Covers:
//   - completed job with payment can generate receipt
//   - receipt shape remains stable
//   - receipt financial fields mirror payment record fields
//   - receipt includes employer/job/workers/payment/attendance sections
//   - attendance-adjusted payment totals are reflected in receipt
//   - payment.attendanceBreakdown remains stable if tested
//   - Attendance → Payment Adjustment → Payment Dispute → Receipt chain
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
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-receipt-generation-smoke-'));

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

async function loadCoreServices() {
  const [
    database,
    users,
    jobs,
    applications,
    attendance,
    payments,
    financialExport,
  ] = await Promise.all([
    importFresh('../../server/services/database.js'),
    importFresh('../../server/services/users.js'),
    importFresh('../../server/services/jobs.js'),
    importFresh('../../server/services/applications.js'),
    importFresh('../../server/services/attendance.js'),
    importFresh('../../server/services/payments.js'),
    importFresh('../../server/services/financialExport.js'),
  ]);

  await database.initDatabase();

  return {
    database,
    users,
    jobs,
    applications,
    attendance,
    payments,
    financialExport,
  };
}

async function createProfiledUser(users, phone, role, fields = {}) {
  const user = await users.create(phone, role);

  const updated = await users.update(user.id, {
    name: fields.name || (role === 'employer' ? 'صاحب عمل إيصال' : 'عامل إيصال'),
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

test('Patch 34: completed job payment can generate a stable receipt', async (t) => {
  await setupTempDataPath(t);
  const {
    users,
    jobs,
    applications,
    attendance,
    payments,
    financialExport,
  } = await loadCoreServices();

  const employer = await createProfiledUser(users, '01091000001', 'employer', {
    name: 'شركة إيصال اختبار',
    governorate: 'cairo',
  });

  const worker = await createProfiledUser(users, '01091000002', 'worker', {
    name: 'عامل إيصال حضر',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const job = await jobs.create(employer.id, {
    title: 'فرصة إيصال مستقرة',
    category: 'construction',
    governorate: 'cairo',
    location: 'وسط البلد',
    area: 'وسط البلد',
    address: 'شارع اختبار الإيصال',
    landmark: 'بجوار محطة المترو',
    locationNotes: 'اسأل على بوابة الأمن',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded: 1,
    dailyWage: 300,
    startDate: '2030-01-01',
    durationDays: 1,
    description: 'فرصة اختبار لتوليد الإيصال',
  });

  const applied = await applications.apply(job.id, worker.id);
  assert.equal(applied.ok, true);

  const accepted = await applications.accept(applied.application.id, employer.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.application.status, 'accepted');

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);
  assert.equal(started.job.status, 'in_progress');

  const checkIn = await attendance.checkIn(job.id, worker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkIn.ok, true);
  assert.equal(checkIn.attendance.status, 'checked_in');

  const checkOut = await attendance.checkOut(job.id, worker.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkOut.ok, true);
  assert.equal(checkOut.attendance.status, 'checked_out');

  const confirmed = await attendance.confirmAttendance(checkOut.attendance.id, employer.id);
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.attendance.status, 'confirmed');

  const completed = await jobs.completeJob(job.id, employer.id);
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, 'completed');

  const payment = await waitForPaymentOrCreate(payments, job.id, employer.id);

  assert.equal(payment.jobId, job.id);
  assert.equal(payment.employerId, employer.id);
  assert.equal(payment.amount, 300);
  assert.equal(payment.platformFee, 45);
  assert.equal(payment.workerPayout, 255);
  assert.equal(payment.status, 'pending');

  const receipt = await financialExport.generateReceipt(payment.id);

  assertReceiptShape(receipt);
  assertReceiptMirrorsPayment(receipt, payment);

  assert.equal(receipt.employer.name, employer.name);
  assert.equal(receipt.employer.phone, employer.phone);

  assert.equal(receipt.job.title, job.title);
  assert.equal(receipt.job.category, job.category);
  assert.equal(receipt.job.governorate, job.governorate);
  assert.equal(receipt.job.startDate, job.startDate);
  assert.equal(receipt.job.durationDays, job.durationDays);

  assert.equal(receipt.workers.length, 1);
  assert.equal(receipt.workers[0].name, worker.name);
  assert.equal(receipt.workers[0].dailyWage, 300);
  assert.equal(receipt.workers[0].daysWorked, 1);
  assert.equal(receipt.workers[0].total, 300);

  assert.equal(receipt.attendance.totalDays, 1);
  assert.equal(receipt.attendance.attendedDays, 1);
  assert.equal(receipt.attendance.noShows, 0);
  assert.equal(receipt.attendance.attendanceRate, 100);

  assert.deepEqual(receipt.attendanceBreakdown, {
    expectedWorkerDays: 1,
    actualWorkerDays: 1,
    noShowDays: 0,
    attendanceRate: 1,
  });
});

test('Patch 34: attendance-adjusted disputed payment totals are reflected in receipt', async (t) => {
  await setupTempDataPath(t);
  const {
    users,
    jobs,
    applications,
    attendance,
    payments,
    financialExport,
  } = await loadCoreServices();

  const employer = await createProfiledUser(users, '01092000001', 'employer', {
    name: 'صاحب عمل سلسلة مالية',
    governorate: 'cairo',
  });

  const workerA = await createProfiledUser(users, '01092000002', 'worker', {
    name: 'عامل حضر للإيصال',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const workerB = await createProfiledUser(users, '01092000003', 'worker', {
    name: 'عامل غاب عن الإيصال',
    governorate: 'cairo',
    categories: ['construction'],
  });

  const job = await jobs.create(employer.id, {
    title: 'فرصة إيصال محسوبة بالحضور',
    category: 'construction',
    governorate: 'cairo',
    location: 'وسط البلد',
    area: 'وسط البلد',
    address: 'شارع اختبار الحضور والدفع',
    landmark: 'بجوار محطة المترو',
    locationNotes: 'بوابة رقم 2',
    lat: 30.0444,
    lng: 31.2357,
    workersNeeded: 2,
    dailyWage: 200,
    startDate: '2030-01-01',
    durationDays: 1,
    description: 'فرصة اختبار لسلسلة Attendance → Payment → Dispute → Receipt',
  });

  const appA = await applications.apply(job.id, workerA.id);
  assert.equal(appA.ok, true);
  const acceptedA = await applications.accept(appA.application.id, employer.id);
  assert.equal(acceptedA.ok, true);

  const appB = await applications.apply(job.id, workerB.id);
  assert.equal(appB.ok, true);
  const acceptedB = await applications.accept(appB.application.id, employer.id);
  assert.equal(acceptedB.ok, true);

  const filledJob = await jobs.findById(job.id);
  assert.equal(filledJob.status, 'filled');
  assert.equal(filledJob.workersAccepted, 2);

  const started = await jobs.startJob(job.id, employer.id);
  assert.equal(started.ok, true);
  assert.equal(started.job.status, 'in_progress');

  const checkInA = await attendance.checkIn(job.id, workerA.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkInA.ok, true);

  const checkOutA = await attendance.checkOut(job.id, workerA.id, {
    lat: 30.0444,
    lng: 31.2357,
  });
  assert.equal(checkOutA.ok, true);

  const confirmA = await attendance.confirmAttendance(checkOutA.attendance.id, employer.id);
  assert.equal(confirmA.ok, true);
  assert.equal(confirmA.attendance.status, 'confirmed');

  const noShowB = await attendance.reportNoShow(job.id, workerB.id, employer.id);
  assert.equal(noShowB.ok, true);
  assert.equal(noShowB.attendance.status, 'no_show');

  const summary = await attendance.getJobSummary(job.id);
  assert.equal(summary.totalRecords, 2);
  assert.equal(summary.checkedInCount, 1);
  assert.equal(summary.noShowCount, 1);
  assert.equal(summary.confirmedCount, 1);

  const completed = await jobs.completeJob(job.id, employer.id);
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, 'completed');

  const payment = await waitForPaymentOrCreate(payments, job.id, employer.id);

  assert.equal(payment.amount, 200);
  assert.equal(payment.platformFee, 30);
  assert.equal(payment.workerPayout, 170);

  assert.deepEqual(payment.attendanceBreakdown, {
    expectedWorkerDays: 2,
    actualWorkerDays: 1,
    noShowDays: 1,
    attendanceRate: 0.5,
  });

  const confirmedPayment = await payments.confirmPayment(payment.id, employer.id);
  assert.equal(confirmedPayment.ok, true);
  assert.equal(confirmedPayment.payment.status, 'employer_confirmed');

  const disputedPayment = await payments.disputePayment(
    payment.id,
    workerA.id,
    'نزاع اختبار بعد تعديل الدفع حسب الحضور'
  );

  assert.equal(disputedPayment.ok, true);
  assert.equal(disputedPayment.payment.status, 'disputed');
  assert.equal(disputedPayment.payment.disputedBy, workerA.id);

  const persistedPayment = await payments.findById(payment.id);

  assert.equal(persistedPayment.status, 'disputed');
  assert.equal(persistedPayment.amount, 200);
  assert.equal(persistedPayment.platformFee, 30);
  assert.equal(persistedPayment.workerPayout, 170);

  const receipt = await financialExport.generateReceipt(payment.id);

  assertReceiptShape(receipt);
  assertReceiptMirrorsPayment(receipt, persistedPayment);

  assert.equal(receipt.paymentStatus, 'disputed');
  assert.equal(receipt.subtotal, 200);
  assert.equal(receipt.platformFee, 30);
  assert.equal(receipt.workerPayout, 170);
  assert.equal(receipt.grandTotal, 200);

  assert.equal(receipt.workers.length, 2);
  assert.deepEqual(
    receipt.workers.map(w => w.name).sort(),
    [workerA.name, workerB.name].sort()
  );

  assert.equal(receipt.attendance.totalDays, 1);
  assert.equal(receipt.attendance.attendedDays, 1);
  assert.equal(receipt.attendance.noShows, 1);
  assert.equal(receipt.attendance.attendanceRate, 50);

  assert.deepEqual(receipt.attendanceBreakdown, {
    expectedWorkerDays: 2,
    actualWorkerDays: 1,
    noShowDays: 1,
    attendanceRate: 0.5,
  });

  const counts = await payments.countByStatus();
  assert.equal(counts.total, 1);
  assert.equal(counts.disputed, 1);

  const financialSummary = await payments.getFinancialSummary();
  assert.equal(financialSummary.totalPayments, 1);
  assert.equal(financialSummary.byStatus.disputed, 1);
  assert.equal(financialSummary.totalAmount, 200);
  assert.equal(financialSummary.totalPlatformFee, 30);
  assert.equal(financialSummary.totalWorkerPayout, 170);
});
