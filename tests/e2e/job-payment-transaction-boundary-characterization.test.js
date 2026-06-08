// ═══════════════════════════════════════════════════════════════
// tests/e2e/job-payment-transaction-boundary-characterization.test.js
// Patch 43 — Job Completion / Payment Creation Transaction Boundary Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize the current job completion + payment creation workflow as
//   non-transactional.
//
// Current runtime behavior:
//   - completeJob() mutates the job to completed
//   - emits job:completed
//   - starts createPayment() as fire-and-forget
//   - does not await or surface payment creation result
//
// This test intentionally documents the production gap:
//   completing a job can succeed even when payment creation cannot create
//   the expected payment projection.
//
// Safety:
//   - uses temp YAWMIA_DATA_PATH only
//   - does not import server.js
//   - does not start queue workers or schedulers
//   - does not mutate ./data
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let importCounter = 0;

async function importFresh(path) {
  importCounter++;
  return await import(`${path}?job-payment-boundary=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-job-payment-boundary-'));

  process.env.NODE_ENV = 'test';
  process.env.YAWMIA_DATA_PATH = dataPath;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  t.after(async () => {
    delete process.env.YAWMIA_DATA_PATH;
    await rm(dataPath, { recursive: true, force: true });
  });

  return { dataPath, database };
}

async function buildInProgressJobFixture() {
  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');

  const employer = await users.create('01012345678', 'employer');
  const worker = await users.create('01112345678', 'worker');

  const job = await jobs.create(employer.id, {
    title: 'تحميل بضائع يوم كامل',
    category: 'loading',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 300,
    startDate: '2026-06-09',
    durationDays: 1,
    description: 'مطلوب عامل تحميل لمدة يوم واحد',
  });

  const appResult = await applications.apply(job.id, worker.id);
  assert.equal(appResult.ok, true, 'fixture application should be created');

  const acceptResult = await applications.accept(appResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true, 'fixture application should be accepted');

  const startResult = await jobs.startJob(job.id, employer.id);
  assert.equal(startResult.ok, true, 'fixture job should be started');
  assert.equal(startResult.job.status, 'in_progress');

  return {
    employer,
    worker,
    job: startResult.job,
    services: {
      users,
      jobs,
      applications,
    },
  };
}

async function insertPreexistingPaymentProjection(database, job, employer) {
  const { default: config } = await importFresh('../../config.js');

  const paymentId = 'pay_preexisting_boundary';
  const now = new Date().toISOString();

  const amount = job.totalCost;
  const platformFee = job.platformFee;
  const workerPayout = amount - platformFee;

  const payment = {
    id: paymentId,
    jobId: job.id,
    employerId: employer.id,
    amount,
    platformFee,
    workerPayout,
    method: 'cash',
    status: 'pending',
    workersAccepted: job.workersAccepted,
    dailyWage: job.dailyWage,
    durationDays: job.durationDays,
    createdAt: now,
    confirmedAt: null,
    completedAt: null,
    disputedBy: null,
    disputeReason: null,
    disputedAt: null,
    notes: 'preexisting projection inserted by characterization test',
    attendanceBreakdown: null,
  };

  const paymentPath = database.getWriteRecordPath('payments', paymentId);
  await database.atomicWrite(paymentPath, payment);

  await database.addToSetIndex(
    config.DATABASE.indexFiles.jobPaymentsIndex,
    job.id,
    paymentId
  );

  return payment;
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('completeJob can commit completed job even when auto payment creation cannot create the expected new payment', async (t) => {
  const { database } = await setupIsolatedDataPath(t);

  const fixture = await buildInProgressJobFixture();
  const { employer, job } = fixture;
  const { jobs } = fixture.services;

  const payments = await importFresh('../../server/services/payments.js');

  const preexisting = await insertPreexistingPaymentProjection(database, job, employer);

  let paymentsBeforeCompletion = await payments.listByJob(job.id);
  assert.equal(paymentsBeforeCompletion.length, 1);
  assert.equal(paymentsBeforeCompletion[0].id, preexisting.id);

  const completeResult = await jobs.completeJob(job.id, employer.id);

  assert.equal(completeResult.ok, true);
  assert.equal(
    completeResult.job.status,
    'completed',
    'completeJob reports success and persists completed state'
  );

  // Give the fire-and-forget createPayment() path time to run and fail with PAYMENT_EXISTS.
  await wait(100);

  const completedJob = await jobs.findById(job.id);
  assert.equal(completedJob.status, 'completed');

  const paymentsAfterCompletion = await payments.listByJob(job.id);

  assert.equal(
    paymentsAfterCompletion.length,
    1,
    'no new payment was created because the job already had a payment projection'
  );

  assert.equal(
    paymentsAfterCompletion[0].id,
    preexisting.id,
    'the only payment remains the preexisting projection'
  );

  assert.equal(
    paymentsAfterCompletion[0].status,
    'pending',
    'completeJob does not validate or reconcile the payment creation result'
  );

  assert.equal(
    completeResult.payment,
    undefined,
    'completeJob response does not include committed payment information'
  );
});

test('completeJob payment side effect is not part of the returned transaction result', async (t) => {
  await setupIsolatedDataPath(t);

  const fixture = await buildInProgressJobFixture();
  const { employer, job } = fixture;
  const { jobs } = fixture.services;

  const payments = await importFresh('../../server/services/payments.js');

  const completeResult = await jobs.completeJob(job.id, employer.id);

  assert.equal(completeResult.ok, true);
  assert.equal(completeResult.job.status, 'completed');

  assert.equal(
    completeResult.payment,
    undefined,
    'completeJob returns before exposing any durable payment creation result'
  );

  assert.equal(
    completeResult.ledgerEntry,
    undefined,
    'completeJob has no ledger entry result because payment ledger is not implemented'
  );

  // Normal happy path eventually creates a payment projection, but that happens
  // outside the completeJob return contract.
  let eventualPayments = [];
  for (let i = 0; i < 20; i++) {
    eventualPayments = await payments.listByJob(job.id);
    if (eventualPayments.length > 0) break;
    await wait(25);
  }

  assert.equal(
    eventualPayments.length,
    1,
    'normal runtime eventually creates a payment projection as an asynchronous side effect'
  );

  assert.equal(eventualPayments[0].status, 'pending');
});
