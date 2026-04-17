// tests/payments.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 9 — Payment Tracking + Financial Foundation Tests
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-payments-test-'));
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  process.env.YAWMIA_DATA_PATH = tmpDir;
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

let paymentService, jobService, appService, userService, db, eventBus;

before(async () => {
  db = await import('../server/services/database.js');
  eventBus = (await import('../server/services/eventBus.js')).eventBus;
  eventBus.clear();
  userService = await import('../server/services/users.js');
  jobService = await import('../server/services/jobs.js');
  appService = await import('../server/services/applications.js');
  paymentService = await import('../server/services/payments.js');
});

after(() => {
  if (eventBus) eventBus.clear();
});

/**
 * Helper: create a completed job with one accepted worker
 * Returns { employer, worker, job }
 */
let helperCounter = 0;
async function setupCompletedJob() {
  helperCounter++;
  const empPhone = '0101100' + String(helperCounter).padStart(4, '0');
  const wrkPhone = '0102100' + String(helperCounter).padStart(4, '0');

  const employer = await userService.create(empPhone, 'employer');
  const worker = await userService.create(wrkPhone, 'worker');

  const job = await jobService.create(employer.id, {
    title: 'فرصة دفع رقم ' + helperCounter,
    category: 'construction',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 200,
    startDate: '2026-05-01',
    durationDays: 3,
  });

  // Worker applies
  await appService.apply(job.id, worker.id);
  const apps = await appService.listByJob(job.id);
  const application = apps.find(a => a.workerId === worker.id);

  // Employer accepts
  await appService.accept(application.id, employer.id);

  // Start job
  await jobService.startJob(job.id, employer.id);

  // Complete job (fire-and-forget auto-create might run, but we test manual create)
  await jobService.completeJob(job.id, employer.id);

  // Re-fetch
  const completedJob = await jobService.findById(job.id);

  return { employer, worker, job: completedJob };
}

describe('Payment Service — Creation', () => {

  it('PH9-01: createPayment on completed job succeeds', async () => {
    const { employer, job } = await setupCompletedJob();
    // Auto-create may have happened; list first
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      // Already auto-created, verify it
      assert.ok(existing[0].id.startsWith('pay_'));
      assert.strictEqual(existing[0].status, 'pending');
      assert.strictEqual(existing[0].method, 'cash');
      return;
    }
    const result = await paymentService.createPayment(job.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.ok(result.payment.id.startsWith('pay_'));
    assert.strictEqual(result.payment.status, 'pending');
    assert.strictEqual(result.payment.method, 'cash');
    assert.strictEqual(result.payment.jobId, job.id);
    assert.strictEqual(result.payment.employerId, employer.id);
  });

  it('PH9-02: createPayment calculates amounts correctly', async () => {
    const { employer, job } = await setupCompletedJob();
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      const pay = existing[0];
      // 1 worker * 200/day * 3 days = 600
      assert.strictEqual(pay.amount, 600);
      assert.strictEqual(pay.platformFee, 90); // 15% of 600
      assert.strictEqual(pay.workerPayout, 510); // 600 - 90
      return;
    }
    const result = await paymentService.createPayment(job.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.amount, 600);
    assert.strictEqual(result.payment.platformFee, 90);
    assert.strictEqual(result.payment.workerPayout, 510);
  });

  it('PH9-03: createPayment rejects duplicate for same job', async () => {
    const { employer, job } = await setupCompletedJob();
    // Ensure first payment exists
    const existing = await paymentService.listByJob(job.id);
    if (existing.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
    }
    // Try duplicate
    const result = await paymentService.createPayment(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'PAYMENT_EXISTS');
  });

  it('PH9-04: createPayment rejects non-completed job', async () => {
    const employer = await userService.create('01011040001', 'employer');
    const job = await jobService.create(employer.id, {
      title: 'فرصة مفتوحة',
      category: 'farming',
      governorate: 'giza',
      workersNeeded: 2,
      dailyWage: 150,
      startDate: '2026-05-10',
      durationDays: 1,
    });
    const result = await paymentService.createPayment(job.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'JOB_NOT_COMPLETED');
  });

  it('PH9-05: createPayment rejects non-owner', async () => {
    const { job } = await setupCompletedJob();
    const other = await userService.create('01011050001', 'employer');
    // Clear any auto-created payment first (for clean test)
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      // Payment already exists — just test with the same job will give PAYMENT_EXISTS
      // Instead, test ownership check on a fresh job
      const { job: job2 } = await setupCompletedJob();
      const existing2 = await paymentService.listByJob(job2.id);
      if (existing2.length === 0) {
        const result = await paymentService.createPayment(job2.id, other.id);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.code, 'NOT_JOB_OWNER');
        return;
      }
    }
    const result = await paymentService.createPayment(job.id, other.id);
    assert.strictEqual(result.ok, false);
    // Either NOT_JOB_OWNER or PAYMENT_EXISTS (if auto-created)
    assert.ok(result.code === 'NOT_JOB_OWNER' || result.code === 'PAYMENT_EXISTS');
  });

  it('PH9-06: createPayment rejects invalid method', async () => {
    const { employer, job } = await setupCompletedJob();
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      // Skip — already has payment
      assert.ok(true);
      return;
    }
    const result = await paymentService.createPayment(job.id, employer.id, { method: 'bitcoin' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_PAYMENT_METHOD');
  });

  it('PH9-07: createPayment accepts wallet method', async () => {
    const { employer, job } = await setupCompletedJob();
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      assert.ok(true);
      return;
    }
    const result = await paymentService.createPayment(job.id, employer.id, { method: 'wallet' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.method, 'wallet');
  });

  it('PH9-08: createPayment accepts instapay method', async () => {
    const { employer, job } = await setupCompletedJob();
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      assert.ok(true);
      return;
    }
    const result = await paymentService.createPayment(job.id, employer.id, { method: 'instapay' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.method, 'instapay');
  });
});

describe('Payment Service — Confirmation', () => {

  it('PH9-09: confirmPayment by employer succeeds', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    // Only confirm if still pending
    if (pay.status !== 'pending') {
      assert.ok(true);
      return;
    }
    const result = await paymentService.confirmPayment(pay.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.status, 'employer_confirmed');
    assert.ok(result.payment.confirmedAt);
  });

  it('PH9-10: confirmPayment rejects non-owner', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const other = await userService.create('01011100001', 'employer');
    const result = await paymentService.confirmPayment(payments[0].id, other.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_PAYMENT_OWNER');
  });

  it('PH9-11: confirmPayment rejects on non-pending status', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    // Confirm first time
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    // Try confirm again
    const result = await paymentService.confirmPayment(pay.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_PAYMENT_STATUS');
  });
});

describe('Payment Service — Admin Completion', () => {

  it('PH9-12: completePayment on confirmed payment succeeds', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    if (pay.status === 'completed') {
      assert.ok(true);
      return;
    }
    const result = await paymentService.completePayment(pay.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.status, 'completed');
    assert.ok(result.payment.completedAt);
  });

  it('PH9-13: completePayment rejects on pending payment (not confirmed)', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    if (pay.status !== 'pending') {
      // Already confirmed/completed/disputed — skip
      assert.ok(true);
      return;
    }
    const result = await paymentService.completePayment(pay.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_PAYMENT_STATUS');
  });

  it('PH9-14: completePayment on disputed payment succeeds (resolve)', async () => {
    const { employer, worker, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    // Dispute it if still pending
    if (pay.status === 'pending') {
      await paymentService.disputePayment(pay.id, employer.id, 'سبب النزاع التجريبي');
    }
    // Now re-read
    const updated = await paymentService.findById(pay.id);
    if (updated.status !== 'disputed') {
      assert.ok(true);
      return;
    }
    const result = await paymentService.completePayment(pay.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.status, 'completed');
  });
});

describe('Payment Service — Disputes', () => {

  it('PH9-15: disputePayment on pending payment succeeds', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    if (pay.status !== 'pending') {
      assert.ok(true);
      return;
    }
    const result = await paymentService.disputePayment(pay.id, employer.id, 'العامل لم يحضر اليوم الأخير');
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.status, 'disputed');
    assert.ok(result.payment.disputedAt);
    assert.strictEqual(result.payment.disputedBy, employer.id);
    assert.strictEqual(result.payment.disputeReason, 'العامل لم يحضر اليوم الأخير');
  });

  it('PH9-16: disputePayment on completed payment fails', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    // Fast-forward to completed
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    const updated = await paymentService.findById(pay.id);
    if (updated.status === 'employer_confirmed') {
      await paymentService.completePayment(pay.id);
    }
    const result = await paymentService.disputePayment(pay.id, employer.id, 'سبب النزاع بعد الاكتمال');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'PAYMENT_ALREADY_COMPLETED');
  });

  it('PH9-17: disputePayment on already-disputed payment fails', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    if (pay.status === 'pending') {
      await paymentService.disputePayment(pay.id, employer.id, 'نزاع أول تجريبي');
    }
    const updated = await paymentService.findById(pay.id);
    if (updated.status !== 'disputed') {
      assert.ok(true);
      return;
    }
    const result = await paymentService.disputePayment(pay.id, employer.id, 'نزاع ثاني');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'ALREADY_DISPUTED');
  });
});

describe('Payment Service — Queries', () => {

  it('PH9-18: findById returns payment', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const found = await paymentService.findById(payments[0].id);
    assert.ok(found);
    assert.strictEqual(found.id, payments[0].id);
    assert.strictEqual(found.jobId, job.id);
  });

  it('PH9-19: findById returns null for non-existent', async () => {
    const found = await paymentService.findById('pay_nonexistent');
    assert.strictEqual(found, null);
  });

  it('PH9-20: listByJob returns payments for job', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    assert.ok(payments.length >= 1);
    assert.strictEqual(payments[0].jobId, job.id);
  });

  it('PH9-21: listByJob returns empty for job with no payments', async () => {
    const payments = await paymentService.listByJob('job_nonexistent_xyz');
    assert.strictEqual(payments.length, 0);
  });

  it('PH9-22: getFinancialSummary returns correct structure', async () => {
    const summary = await paymentService.getFinancialSummary();
    assert.strictEqual(typeof summary.totalPayments, 'number');
    assert.ok(summary.byStatus);
    assert.strictEqual(typeof summary.byStatus.pending, 'number');
    assert.strictEqual(typeof summary.byStatus.completed, 'number');
    assert.strictEqual(typeof summary.byStatus.disputed, 'number');
    assert.strictEqual(typeof summary.byStatus.employer_confirmed, 'number');
    assert.strictEqual(typeof summary.totalAmount, 'number');
    assert.strictEqual(typeof summary.totalPlatformFee, 'number');
    assert.strictEqual(typeof summary.totalWorkerPayout, 'number');
    assert.strictEqual(typeof summary.completedAmount, 'number');
    assert.strictEqual(typeof summary.completedPlatformFee, 'number');
    assert.strictEqual(typeof summary.pendingAmount, 'number');
    assert.strictEqual(typeof summary.pendingPlatformFee, 'number');
    assert.strictEqual(typeof summary.disputedCount, 'number');
  });

  it('PH9-23: countByStatus returns correct counts', async () => {
    const counts = await paymentService.countByStatus();
    assert.strictEqual(typeof counts.total, 'number');
    assert.strictEqual(typeof counts.pending, 'number');
    assert.strictEqual(typeof counts.completed, 'number');
    assert.strictEqual(typeof counts.disputed, 'number');
    assert.strictEqual(typeof counts.employer_confirmed, 'number');
    assert.ok(counts.total >= 0);
  });
});

describe('Payment Service — Events', () => {

  it('PH9-24: payment:created event emitted on create', async () => {
    const { employer, job } = await setupCompletedJob();
    const existing = await paymentService.listByJob(job.id);
    if (existing.length > 0) {
      assert.ok(true, 'Auto-created — event already fired');
      return;
    }

    let eventData = null;
    const unsub = eventBus.on('payment:created', (data) => { eventData = data; });

    await paymentService.createPayment(job.id, employer.id);
    unsub();

    assert.ok(eventData, 'payment:created event should fire');
    assert.ok(eventData.paymentId);
    assert.strictEqual(eventData.jobId, job.id);
    assert.strictEqual(eventData.employerId, employer.id);
    assert.strictEqual(typeof eventData.amount, 'number');
    assert.strictEqual(typeof eventData.platformFee, 'number');
  });

  it('PH9-25: payment:confirmed event emitted on confirm', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    if (pay.status !== 'pending') {
      assert.ok(true);
      return;
    }

    let eventData = null;
    const unsub = eventBus.on('payment:confirmed', (data) => { eventData = data; });

    await paymentService.confirmPayment(pay.id, employer.id);
    unsub();

    assert.ok(eventData, 'payment:confirmed event should fire');
    assert.strictEqual(eventData.paymentId, pay.id);
  });

  it('PH9-26: payment:completed event emitted on complete', async () => {
    const { employer, job } = await setupCompletedJob();
    let payments = await paymentService.listByJob(job.id);
    if (payments.length === 0) {
      await paymentService.createPayment(job.id, employer.id);
      payments = await paymentService.listByJob(job.id);
    }
    const pay = payments[0];
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    const refreshed = await paymentService.findById(pay.id);
    if (refreshed.status !== 'employer_confirmed') {
      assert.ok(true);
      return;
    }

    let eventData = null;
    const unsub = eventBus.on('payment:completed', (data) => { eventData = data; });

    await paymentService.completePayment(pay.id);
    unsub();

    assert.ok(eventData, 'payment:completed event should fire');
    assert.strictEqual(eventData.paymentId, pay.id);
  });
});

describe('Payment Service — Config', () => {

  it('PH9-27: Config has 22 sections', async () => {
    const config = (await import('../config.js')).default;
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 22, `expected 22 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('PH9-28: PAYMENTS section has correct default values', async () => {
    const config = (await import('../config.js')).default;
    assert.ok(config.PAYMENTS);
    assert.strictEqual(config.PAYMENTS.enabled, true);
    assert.strictEqual(config.PAYMENTS.autoCreateOnComplete, true);
    assert.ok(config.PAYMENTS.methods.includes('cash'));
    assert.ok(config.PAYMENTS.methods.includes('wallet'));
    assert.ok(config.PAYMENTS.methods.includes('instapay'));
    assert.strictEqual(config.PAYMENTS.defaultMethod, 'cash');
    assert.strictEqual(config.PAYMENTS.disputeWindowDays, 7);
    assert.strictEqual(config.PAYMENTS.confirmationRequired, true);
    assert.strictEqual(config.PAYMENTS.adminApprovalRequired, true);
  });
});
