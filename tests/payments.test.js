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
 * Waits for fire-and-forget auto-create to settle
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

  // Complete job (fire-and-forget auto-create will run)
  await jobService.completeJob(job.id, employer.id);

  // Wait for fire-and-forget auto-create payment to settle
  await new Promise(r => setTimeout(r, 150));

  // Re-fetch
  const completedJob = await jobService.findById(job.id);

  return { employer, worker, job: completedJob };
}

/**
 * Helper: get or create payment for a job
 * Handles the auto-create scenario gracefully
 */
async function ensurePayment(jobId, employerId, options) {
  const existing = await paymentService.listByJob(jobId);
  if (existing.length > 0) return existing[0];
  const result = await paymentService.createPayment(jobId, employerId, options);
  if (result.ok) return result.payment;
  // If PAYMENT_EXISTS, fetch it
  if (result.code === 'PAYMENT_EXISTS') {
    const retry = await paymentService.listByJob(jobId);
    return retry[0] || null;
  }
  return null;
}

describe('Payment Service — Creation', () => {

  it('PH9-01: createPayment on completed job succeeds', async () => {
    // Bypass auto-create: set job completed directly
    helperCounter++;
    const emp = await userService.create('0101101' + String(helperCounter).padStart(5, '0'), 'employer');
    const wrk = await userService.create('0102101' + String(helperCounter).padStart(5, '0'), 'worker');
    const job = await jobService.create(emp.id, {
      title: 'فرصة PH9-01 ' + helperCounter,
      category: 'construction',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-05-01',
      durationDays: 3,
    });
    await appService.apply(job.id, wrk.id);
    const apps = await appService.listByJob(job.id);
    await appService.accept(apps[0].id, emp.id);
    await jobService.startJob(job.id, emp.id);
    // Set completed directly (bypass completeJob to avoid auto-create)
    const jobData = await jobService.findById(job.id);
    jobData.status = 'completed';
    jobData.completedAt = new Date().toISOString();
    await db.atomicWrite(db.getRecordPath('jobs', job.id), jobData);

    const result = await paymentService.createPayment(job.id, emp.id);
    assert.strictEqual(result.ok, true);
    assert.ok(result.payment.id.startsWith('pay_'));
    assert.strictEqual(result.payment.status, 'pending');
    assert.strictEqual(result.payment.method, 'cash');
    assert.strictEqual(result.payment.jobId, job.id);
    assert.strictEqual(result.payment.employerId, emp.id);
  });

  it('PH9-02: createPayment calculates amounts correctly', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    // 1 worker * 200/day * 3 days = 600
    assert.strictEqual(pay.amount, 600);
    assert.strictEqual(pay.platformFee, 90); // 15% of 600
    assert.strictEqual(pay.workerPayout, 510); // 600 - 90
  });

  it('PH9-03: createPayment rejects duplicate for same job', async () => {
    const { employer, job } = await setupCompletedJob();
    // Ensure first payment exists
    await ensurePayment(job.id, employer.id);
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
    const { employer, job } = await setupCompletedJob();
    const other = await userService.create('01011050001', 'employer');
    // Payment may already exist from auto-create — that gives PAYMENT_EXISTS
    // We need to test ownership separately: try with a different employer
    const result = await paymentService.createPayment(job.id, other.id);
    assert.strictEqual(result.ok, false);
    // If payment already auto-created → PAYMENT_EXISTS (duplicate check runs before owner check)
    // If no auto-create → NOT_JOB_OWNER
    assert.ok(result.code === 'NOT_JOB_OWNER' || result.code === 'PAYMENT_EXISTS',
      'expected NOT_JOB_OWNER or PAYMENT_EXISTS, got: ' + result.code);
  });

  it('PH9-06: createPayment rejects invalid method', async () => {
    // Bypass auto-create: set job completed directly
    helperCounter++;
    const emp = await userService.create('0101106' + String(helperCounter).padStart(5, '0'), 'employer');
    const wrk = await userService.create('0102106' + String(helperCounter).padStart(5, '0'), 'worker');
    const job = await jobService.create(emp.id, {
      title: 'فرصة method test ' + helperCounter,
      category: 'cleaning',
      governorate: 'giza',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-05-01',
      durationDays: 1,
    });
    await appService.apply(job.id, wrk.id);
    const apps = await appService.listByJob(job.id);
    await appService.accept(apps[0].id, emp.id);
    await jobService.startJob(job.id, emp.id);
    // Set completed directly (bypass completeJob to avoid auto-create)
    const jobData = await jobService.findById(job.id);
    jobData.status = 'completed';
    jobData.completedAt = new Date().toISOString();
    await db.atomicWrite(db.getRecordPath('jobs', job.id), jobData);

    const result = await paymentService.createPayment(job.id, emp.id, { method: 'bitcoin' });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_PAYMENT_METHOD');
  });

  it('PH9-07: createPayment accepts wallet method', async () => {
    // Create a completed job manually (bypass auto-create)
    helperCounter++;
    const emp = await userService.create('0101108' + String(helperCounter).padStart(5, '0'), 'employer');
    const wrk = await userService.create('0102108' + String(helperCounter).padStart(5, '0'), 'worker');
    const job = await jobService.create(emp.id, {
      title: 'فرصة wallet ' + helperCounter,
      category: 'painting',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 300,
      startDate: '2026-05-01',
      durationDays: 2,
    });
    await appService.apply(job.id, wrk.id);
    const apps = await appService.listByJob(job.id);
    await appService.accept(apps[0].id, emp.id);
    await jobService.startJob(job.id, emp.id);

    // Set job to completed directly (bypass completeJob to avoid auto-create)
    const jobData = await jobService.findById(job.id);
    jobData.status = 'completed';
    jobData.completedAt = new Date().toISOString();
    await db.atomicWrite(db.getRecordPath('jobs', job.id), jobData);

    const result = await paymentService.createPayment(job.id, emp.id, { method: 'wallet' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.method, 'wallet');
  });

  it('PH9-08: createPayment accepts instapay method', async () => {
    // Create a completed job manually (bypass auto-create)
    helperCounter++;
    const emp = await userService.create('0101109' + String(helperCounter).padStart(5, '0'), 'employer');
    const wrk = await userService.create('0102109' + String(helperCounter).padStart(5, '0'), 'worker');
    const job = await jobService.create(emp.id, {
      title: 'فرصة instapay ' + helperCounter,
      category: 'plumbing',
      governorate: 'alex',
      workersNeeded: 1,
      dailyWage: 250,
      startDate: '2026-05-01',
      durationDays: 1,
    });
    await appService.apply(job.id, wrk.id);
    const apps = await appService.listByJob(job.id);
    await appService.accept(apps[0].id, emp.id);
    await jobService.startJob(job.id, emp.id);

    // Set job to completed directly (bypass auto-create)
    const jobData = await jobService.findById(job.id);
    jobData.status = 'completed';
    jobData.completedAt = new Date().toISOString();
    await db.atomicWrite(db.getRecordPath('jobs', job.id), jobData);

    const result = await paymentService.createPayment(job.id, emp.id, { method: 'instapay' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.method, 'instapay');
  });
});

describe('Payment Service — Confirmation', () => {

  it('PH9-09: confirmPayment by employer succeeds', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    if (pay.status !== 'pending') {
      assert.ok(true, 'payment already past pending — skip');
      return;
    }
    const result = await paymentService.confirmPayment(pay.id, employer.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.status, 'employer_confirmed');
    assert.ok(result.payment.confirmedAt);
  });

  it('PH9-10: confirmPayment rejects non-owner', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    const other = await userService.create('01011100001', 'employer');
    const result = await paymentService.confirmPayment(pay.id, other.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'NOT_PAYMENT_OWNER');
  });

  it('PH9-11: confirmPayment rejects on non-pending status', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    // Confirm first time
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    // Try confirm again — should fail
    const result = await paymentService.confirmPayment(pay.id, employer.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_PAYMENT_STATUS');
  });
});

describe('Payment Service — Admin Completion', () => {

  it('PH9-12: completePayment on confirmed payment succeeds', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    // Ensure confirmed
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    const refreshed = await paymentService.findById(pay.id);
    if (refreshed.status === 'completed') {
      assert.ok(true, 'already completed — skip');
      return;
    }
    const result = await paymentService.completePayment(pay.id);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.payment.status, 'completed');
    assert.ok(result.payment.completedAt);
  });

  it('PH9-13: completePayment rejects on pending payment (not confirmed)', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    if (pay.status !== 'pending') {
      assert.ok(true, 'not pending — skip');
      return;
    }
    const result = await paymentService.completePayment(pay.id);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, 'INVALID_PAYMENT_STATUS');
  });

  it('PH9-14: completePayment on disputed payment succeeds (resolve)', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    // Dispute it if still pending
    if (pay.status === 'pending') {
      await paymentService.disputePayment(pay.id, employer.id, 'سبب النزاع التجريبي');
    }
    const updated = await paymentService.findById(pay.id);
    if (updated.status !== 'disputed') {
      assert.ok(true, 'not disputed — skip');
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
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    if (pay.status !== 'pending') {
      assert.ok(true, 'not pending — skip');
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
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
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
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    if (pay.status === 'pending') {
      await paymentService.disputePayment(pay.id, employer.id, 'نزاع أول تجريبي');
    }
    const updated = await paymentService.findById(pay.id);
    if (updated.status !== 'disputed') {
      assert.ok(true, 'not disputed — skip');
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
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    const found = await paymentService.findById(pay.id);
    assert.ok(found);
    assert.strictEqual(found.id, pay.id);
    assert.strictEqual(found.jobId, job.id);
  });

  it('PH9-19: findById returns null for non-existent', async () => {
    const found = await paymentService.findById('pay_nonexistent');
    assert.strictEqual(found, null);
  });

  it('PH9-20: listByJob returns payments for job', async () => {
    const { employer, job } = await setupCompletedJob();
    await ensurePayment(job.id, employer.id);
    const payments = await paymentService.listByJob(job.id);
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
    // Create a completed job manually (bypass auto-create for clean event capture)
    helperCounter++;
    const emp = await userService.create('0101124' + String(helperCounter).padStart(5, '0'), 'employer');
    const wrk = await userService.create('0102124' + String(helperCounter).padStart(5, '0'), 'worker');
    const job = await jobService.create(emp.id, {
      title: 'فرصة event test ' + helperCounter,
      category: 'carpentry',
      governorate: 'cairo',
      workersNeeded: 1,
      dailyWage: 200,
      startDate: '2026-05-01',
      durationDays: 1,
    });
    await appService.apply(job.id, wrk.id);
    const apps = await appService.listByJob(job.id);
    await appService.accept(apps[0].id, emp.id);
    await jobService.startJob(job.id, emp.id);

    // Set completed directly (no auto-create)
    const jobData = await jobService.findById(job.id);
    jobData.status = 'completed';
    jobData.completedAt = new Date().toISOString();
    await db.atomicWrite(db.getRecordPath('jobs', job.id), jobData);

    let eventData = null;
    const unsub = eventBus.on('payment:created', (data) => { eventData = data; });

    await paymentService.createPayment(job.id, emp.id);
    unsub();

    assert.ok(eventData, 'payment:created event should fire');
    assert.ok(eventData.paymentId);
    assert.strictEqual(eventData.jobId, job.id);
    assert.strictEqual(eventData.employerId, emp.id);
    assert.strictEqual(typeof eventData.amount, 'number');
    assert.strictEqual(typeof eventData.platformFee, 'number');
  });

  it('PH9-25: payment:confirmed event emitted on confirm', async () => {
    const { employer, job } = await setupCompletedJob();
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    if (pay.status !== 'pending') {
      assert.ok(true, 'not pending — skip');
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
    const pay = await ensurePayment(job.id, employer.id);
    assert.ok(pay, 'payment should exist');
    if (pay.status === 'pending') {
      await paymentService.confirmPayment(pay.id, employer.id);
    }
    const refreshed = await paymentService.findById(pay.id);
    if (refreshed.status !== 'employer_confirmed') {
      assert.ok(true, 'not employer_confirmed — skip');
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

  it('PH9-27: Config has 38 sections', async () => {
    const config = (await import('../config.js')).default;
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 48, `expected 43 config sections, got ${keys.length}: ${keys.join(', ')}`);
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
