// ═══════════════════════════════════════════════════════════════
// tests/e2e/payment-dispute-smoke.test.js
// Patch 32 — Payment Dispute Flow Smoke
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for finance-sensitive payment/dispute workflows.
//
// Covers:
//   - completed job creates payment
//   - payment is readable by job
//   - employer payment confirmation smoke when valid
//   - involved worker can dispute payment when status allows
//   - non-involved user cannot dispute payment
//   - duplicate/invalid dispute path remains protected
//   - disputed payment fields persist
//   - financial summary remains shape-stable
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

async function setupTempDataPath() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-payment-dispute-smoke-'));
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = dir;
  return dir;
}

async function importFresh(path) {
  return await import(`${path}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

async function loadServices() {
  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const payments = await importFresh('../../server/services/payments.js');

  return {
    database,
    users,
    jobs,
    applications,
    payments,
  };
}

async function createEmployer(services, suffix = '001') {
  const user = await services.users.create(`01042000${suffix}`, 'employer');

  const updated = await services.users.update(user.id, {
    name: `صاحب عمل Payment Smoke ${suffix}`,
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

async function createWorker(services, suffix = '101') {
  const user = await services.users.create(`01142000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Payment Smoke ${suffix}`,
    governorate: 'cairo',
    categories: ['cleaning', 'construction'],
    lat: 30.0500,
    lng: 31.2400,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

async function createUnrelatedWorker(services, suffix = '201') {
  const user = await services.users.create(`01242000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل غير مشارك Payment Smoke ${suffix}`,
    governorate: 'giza',
    categories: ['cleaning'],
    lat: 30.0131,
    lng: 31.2089,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
  });

  return updated || user;
}

async function createBasicJob(services, employerId, overrides = {}) {
  return await services.jobs.create(employerId, {
    title: overrides.title || 'فرصة دفع ونزاع لاختبار E2E',
    category: overrides.category || 'cleaning',
    governorate: overrides.governorate || 'cairo',
    location: overrides.location || 'القاهرة',
    area: overrides.area || 'وسط البلد',
    address: overrides.address || 'شارع رئيسي بجوار محطة المترو',
    landmark: overrides.landmark || 'بجوار محطة المترو',
    locationNotes: overrides.locationNotes || 'اسأل على بوابة الأمن',
    lat: overrides.lat ?? 30.0444,
    lng: overrides.lng ?? 31.2357,
    workersNeeded: overrides.workersNeeded || 1,
    dailyWage: overrides.dailyWage || 320,
    startDate: overrides.startDate || '2026-06-10',
    durationDays: overrides.durationDays || 2,
    description: overrides.description || 'مطلوب عامل ملتزم لاختبار payment dispute smoke',
    urgency: overrides.urgency || 'normal',
  });
}

async function waitFor(fn, options = {}) {
  const timeoutMs = options.timeoutMs || 2500;
  const intervalMs = options.intervalMs || 25;
  const startedAt = Date.now();
  let lastValue;

  while (Date.now() - startedAt <= timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  assert.fail(`Timed out waiting for condition. Last value: ${JSON.stringify(lastValue)}`);
}

async function createCompletedJobWithPayment(services, suffix = '001', overrides = {}) {
  const employer = await createEmployer(services, suffix);
  const worker = await createWorker(services, String(Number(suffix) + 100).padStart(3, '0'));

  const job = await createBasicJob(services, employer.id, overrides);

  assert.equal(job.status, 'open');
  assert.equal(job.employerId, employer.id);

  const applyResult = await services.applications.apply(job.id, worker.id);
  assert.equal(applyResult.ok, true, applyResult.error || 'worker should apply to payment smoke job');
  assert.equal(applyResult.application.status, 'pending');

  const acceptResult = await services.applications.accept(applyResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true, acceptResult.error || 'employer should accept worker');
  assert.equal(acceptResult.application.status, 'accepted');

  const filledJob = await services.jobs.findById(job.id);
  assert.equal(filledJob.status, 'filled');
  assert.equal(filledJob.workersAccepted, 1);

  const startResult = await services.jobs.startJob(job.id, employer.id);
  assert.equal(startResult.ok, true, startResult.error || 'employer should start filled job');
  assert.equal(startResult.job.status, 'in_progress');

  const completeResult = await services.jobs.completeJob(job.id, employer.id);
  assert.equal(completeResult.ok, true, completeResult.error || 'employer should complete in-progress job');
  assert.equal(completeResult.job.status, 'completed');

  const payments = await waitFor(async () => {
    const rows = await services.payments.listByJob(job.id);
    return rows.length > 0 ? rows : null;
  });

  assert.equal(payments.length, 1, 'completed job should create one payment record');

  const completedJob = await services.jobs.findById(job.id);

  return {
    employer,
    worker,
    job: completedJob,
    application: acceptResult.application,
    payment: payments[0],
  };
}

function assertPaymentShape(payment) {
  assert.ok(payment, 'payment should exist');
  assert.ok(payment.id.startsWith('pay_'));
  assert.ok(payment.jobId.startsWith('job_'));
  assert.ok(payment.employerId.startsWith('usr_'));
  assert.equal(typeof payment.amount, 'number');
  assert.equal(typeof payment.platformFee, 'number');
  assert.equal(typeof payment.workerPayout, 'number');
  assert.equal(typeof payment.workersAccepted, 'number');
  assert.equal(typeof payment.dailyWage, 'number');
  assert.equal(typeof payment.durationDays, 'number');
  assert.ok(['pending', 'employer_confirmed', 'completed', 'disputed'].includes(payment.status));
  assert.ok(payment.createdAt);
}

function assertFinancialSummaryShape(summary) {
  assert.ok(summary, 'financial summary should exist');
  assert.equal(typeof summary.totalPayments, 'number');
  assert.equal(typeof summary.byStatus, 'object');
  assert.equal(typeof summary.byStatus.pending, 'number');
  assert.equal(typeof summary.byStatus.employer_confirmed, 'number');
  assert.equal(typeof summary.byStatus.completed, 'number');
  assert.equal(typeof summary.byStatus.disputed, 'number');
  assert.equal(typeof summary.totalAmount, 'number');
  assert.equal(typeof summary.totalPlatformFee, 'number');
  assert.equal(typeof summary.totalWorkerPayout, 'number');
  assert.equal(typeof summary.completedAmount, 'number');
  assert.equal(typeof summary.completedPlatformFee, 'number');
  assert.equal(typeof summary.completedWorkerPayout, 'number');
  assert.equal(typeof summary.pendingAmount, 'number');
  assert.equal(typeof summary.pendingPlatformFee, 'number');
  assert.equal(typeof summary.disputedCount, 'number');
}

test('Patch 32: completed job payment can be confirmed then disputed by involved worker', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    // Safe: removes only this test-created temp directory under os.tmpdir(), never ./data.
    await rm(tempDir, { recursive: true, force: true });
  });

  const services = await loadServices();

  const { employer, worker, job, payment } = await createCompletedJobWithPayment(services, '001', {
    title: 'فرصة Payment Dispute Smoke مؤكدة',
    dailyWage: 320,
    durationDays: 2,
  });

  assertPaymentShape(payment);
  assert.equal(payment.status, 'pending');
  assert.equal(payment.jobId, job.id);
  assert.equal(payment.employerId, employer.id);
  assert.equal(payment.amount, job.totalCost);
  assert.equal(payment.platformFee, job.platformFee);
  assert.equal(payment.workerPayout, payment.amount - payment.platformFee);
  assert.equal(payment.workersAccepted, 1);
  assert.equal(payment.dailyWage, 320);
  assert.equal(payment.durationDays, 2);
  assert.equal(payment.disputedBy, null);
  assert.equal(payment.disputeReason, null);
  assert.equal(payment.disputedAt, null);

  const byJobBeforeConfirm = await services.payments.listByJob(job.id);
  assert.equal(byJobBeforeConfirm.length, 1);
  assert.equal(byJobBeforeConfirm[0].id, payment.id);

  const confirmResult = await services.payments.confirmPayment(payment.id, employer.id);
  assert.equal(confirmResult.ok, true, confirmResult.error || 'employer should confirm pending payment');
  assert.equal(confirmResult.payment.status, 'employer_confirmed');
  assert.equal(confirmResult.payment.confirmedAt !== null, true);

  const disputeReason = 'العامل يفتح نزاع اختبار بعد تأكيد صاحب العمل';
  const disputeResult = await services.payments.disputePayment(payment.id, worker.id, disputeReason);

  assert.equal(disputeResult.ok, true, disputeResult.error || 'accepted worker should dispute payment');
  assert.equal(disputeResult.payment.status, 'disputed');
  assert.equal(disputeResult.payment.disputedBy, worker.id);
  assert.equal(disputeResult.payment.disputeReason, disputeReason);
  assert.ok(disputeResult.payment.disputedAt, 'disputedAt should be persisted');

  const persisted = await services.payments.findById(payment.id);
  assertPaymentShape(persisted);
  assert.equal(persisted.status, 'disputed');
  assert.equal(persisted.disputedBy, worker.id);
  assert.equal(persisted.disputeReason, disputeReason);
  assert.ok(persisted.disputedAt);

  const byJobAfterDispute = await services.payments.listByJob(job.id);
  assert.equal(byJobAfterDispute.length, 1);
  assert.equal(byJobAfterDispute[0].id, payment.id);
  assert.equal(byJobAfterDispute[0].status, 'disputed');
  assert.equal(byJobAfterDispute[0].disputedBy, worker.id);
});

test('Patch 32: dispute access guard, duplicate protection, and financial summary remain stable', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    // Safe: removes only this test-created temp directory under os.tmpdir(), never ./data.
    await rm(tempDir, { recursive: true, force: true });
  });

  const services = await loadServices();

  const { employer, worker, job, payment } = await createCompletedJobWithPayment(services, '002', {
    title: 'فرصة Payment Dispute Smoke حماية',
    dailyWage: 250,
    durationDays: 1,
  });

  const unrelatedWorker = await createUnrelatedWorker(services, '202');

  assertPaymentShape(payment);
  assert.equal(payment.status, 'pending');

  const confirmResult = await services.payments.confirmPayment(payment.id, employer.id);
  assert.equal(confirmResult.ok, true, confirmResult.error || 'employer should confirm payment');
  assert.equal(confirmResult.payment.status, 'employer_confirmed');

  const notInvolvedResult = await services.payments.disputePayment(
    payment.id,
    unrelatedWorker.id,
    'محاولة نزاع من عامل غير مشارك'
  );

  assert.equal(notInvolvedResult.ok, false);
  assert.equal(notInvolvedResult.code, 'NOT_INVOLVED');

  const stillConfirmed = await services.payments.findById(payment.id);
  assert.equal(stillConfirmed.status, 'employer_confirmed');
  assert.equal(stillConfirmed.disputedBy, null);
  assert.equal(stillConfirmed.disputeReason, null);
  assert.equal(stillConfirmed.disputedAt, null);

  const disputeResult = await services.payments.disputePayment(
    payment.id,
    worker.id,
    'نزاع صحيح من العامل المقبول'
  );

  assert.equal(disputeResult.ok, true, disputeResult.error || 'accepted worker should dispute payment');
  assert.equal(disputeResult.payment.status, 'disputed');
  assert.equal(disputeResult.payment.disputedBy, worker.id);

  const duplicateDispute = await services.payments.disputePayment(
    payment.id,
    worker.id,
    'محاولة نزاع مكرر يجب رفضها'
  );

  assert.equal(duplicateDispute.ok, false);
  assert.equal(duplicateDispute.code, 'ALREADY_DISPUTED');

  const duplicateEmployerDispute = await services.payments.disputePayment(
    payment.id,
    employer.id,
    'محاولة نزاع مكرر من صاحب العمل يجب رفضها'
  );

  assert.equal(duplicateEmployerDispute.ok, false);
  assert.equal(duplicateEmployerDispute.code, 'ALREADY_DISPUTED');

  const persisted = await services.payments.findById(payment.id);
  assertPaymentShape(persisted);
  assert.equal(persisted.status, 'disputed');
  assert.equal(persisted.disputedBy, worker.id);
  assert.equal(persisted.disputeReason, 'نزاع صحيح من العامل المقبول');
  assert.ok(persisted.disputedAt);

  const byJob = await services.payments.listByJob(job.id);
  assert.equal(byJob.length, 1);
  assert.equal(byJob[0].status, 'disputed');

  const counts = await services.payments.countByStatus();
  assert.equal(counts.total, 1);
  assert.equal(counts.pending, 0);
  assert.equal(counts.employer_confirmed, 0);
  assert.equal(counts.completed, 0);
  assert.equal(counts.disputed, 1);

  const summary = await services.payments.getFinancialSummary();
  assertFinancialSummaryShape(summary);
  assert.equal(summary.totalPayments, 1);
  assert.equal(summary.byStatus.disputed, 1);
  assert.equal(summary.disputedCount, 1);
  assert.equal(summary.totalAmount, payment.amount);
  assert.equal(summary.totalPlatformFee, payment.platformFee);
  assert.equal(summary.totalWorkerPayout, payment.workerPayout);
  assert.equal(summary.pendingAmount, 0);
  assert.equal(summary.pendingPlatformFee, 0);
});
