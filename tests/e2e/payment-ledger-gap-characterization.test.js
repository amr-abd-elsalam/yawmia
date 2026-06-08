// ═══════════════════════════════════════════════════════════════
// tests/e2e/payment-ledger-gap-characterization.test.js
// Patch 39 — Payment Ledger Gap Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize the current payment model as a mutable projection,
//   not an immutable financial ledger.
//
// This test intentionally documents production gaps:
//   - no payment_ledger_entries collection/table
//   - payment lifecycle mutates one pay_*.json record
//   - financial summary reads mutable payment projections
//   - receipt generation is on-demand and not persisted transactionally
//
// Safety:
//   - uses temp YAWMIA_DATA_PATH only
//   - does not import server.js
//   - does not start queue workers or schedulers
//   - does not mutate ./data
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let importCounter = 0;

async function importFresh(path) {
  importCounter++;
  return await import(`${path}?payment-ledger-gap=${Date.now()}-${importCounter}`);
}

async function countJsonFiles(rootDir) {
  let count = 0;

  async function walk(dir) {
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        !entry.name.endsWith('.tmp')
      ) {
        count++;
      }
    }
  }

  await walk(rootDir);
  return count;
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-payment-ledger-gap-'));

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

async function buildCompletedJobFixture() {
  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const payments = await importFresh('../../server/services/payments.js');

  const employer = await users.create('01012345678', 'employer');
  const worker = await users.create('01112345678', 'worker');

  const job = await jobs.create(employer.id, {
    title: 'حصاد محصول يوم كامل',
    category: 'farming',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 300,
    startDate: '2026-06-09',
    durationDays: 1,
    description: 'مطلوب عامل حصاد لمدة يوم واحد',
  });

  const appResult = await applications.apply(job.id, worker.id);
  assert.equal(appResult.ok, true, 'fixture application should be created');

  const acceptResult = await applications.accept(appResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true, 'fixture application should be accepted');

  const completedJob = await jobs.updateStatus(job.id, 'completed');
  assert.equal(completedJob.status, 'completed', 'fixture job should be completed');

  const paymentResult = await payments.createPayment(job.id, employer.id, {
    method: 'cash',
  });

  assert.equal(paymentResult.ok, true, 'fixture payment should be created');

  return {
    employer,
    worker,
    job: completedJob,
    application: acceptResult.application,
    payment: paymentResult.payment,
    services: {
      users,
      jobs,
      applications,
      payments,
    },
  };
}

test('payment lifecycle mutates one projection record and has no immutable ledger collection', async (t) => {
  await setupIsolatedDataPath(t);

  const { default: config } = await importFresh('../../config.js');
  const fixture = await buildCompletedJobFixture();
  const { payments } = fixture.services;

  assert.equal(
    config.DATABASE.dirs.payment_ledger_entries,
    undefined,
    'current config has no payment_ledger_entries collection'
  );

  assert.equal(
    config.DATABASE.dirs.receipts,
    undefined,
    'current config has no durable payment receipts collection'
  );

  let allPayments = await payments.listAll();
  assert.equal(allPayments.length, 1, 'only one payment projection exists after createPayment');

  const paymentId = fixture.payment.id;

  assert.equal(fixture.payment.status, 'pending');
  assert.equal(fixture.payment.id, paymentId);

  const confirmResult = await payments.confirmPayment(paymentId, fixture.employer.id);
  assert.equal(confirmResult.ok, true);
  assert.equal(confirmResult.payment.id, paymentId);
  assert.equal(confirmResult.payment.status, 'employer_confirmed');

  allPayments = await payments.listAll();
  assert.equal(allPayments.length, 1, 'confirmPayment mutates same payment projection, does not append ledger rows');

  const disputeResult = await payments.disputePayment(
    paymentId,
    fixture.worker.id,
    'worker disputes payment amount'
  );

  assert.equal(disputeResult.ok, true);
  assert.equal(disputeResult.payment.id, paymentId);
  assert.equal(disputeResult.payment.status, 'disputed');
  assert.equal(disputeResult.payment.disputedBy, fixture.worker.id);

  allPayments = await payments.listAll();
  assert.equal(allPayments.length, 1, 'disputePayment mutates same payment projection, does not append ledger rows');

  const completeResult = await payments.completePayment(paymentId);
  assert.equal(completeResult.ok, true);
  assert.equal(completeResult.payment.id, paymentId);
  assert.equal(completeResult.payment.status, 'completed');

  allPayments = await payments.listAll();
  assert.equal(allPayments.length, 1, 'completePayment mutates same payment projection, does not append ledger rows');

  const finalPayment = allPayments[0];

  assert.equal(finalPayment.id, paymentId);
  assert.equal(finalPayment.status, 'completed');
  assert.equal(finalPayment.ledgerEntryId, undefined);
  assert.equal(finalPayment.ledgerEntries, undefined);
});

test('financial summary is derived from mutable payment status projection, not immutable ledger history', async (t) => {
  await setupIsolatedDataPath(t);

  const fixture = await buildCompletedJobFixture();
  const { payments } = fixture.services;
  const paymentId = fixture.payment.id;
  const amount = fixture.payment.amount;

  let summary = await payments.getFinancialSummary();
  assert.equal(summary.totalPayments, 1);
  assert.equal(summary.pendingAmount, amount);
  assert.equal(summary.completedAmount, 0);
  assert.equal(summary.disputedCount, 0);

  const confirmResult = await payments.confirmPayment(paymentId, fixture.employer.id);
  assert.equal(confirmResult.ok, true);

  summary = await payments.getFinancialSummary();
  assert.equal(summary.totalPayments, 1);
  assert.equal(summary.pendingAmount, amount, 'employer_confirmed is still counted as pending money');
  assert.equal(summary.completedAmount, 0);
  assert.equal(summary.disputedCount, 0);

  const disputeResult = await payments.disputePayment(
    paymentId,
    fixture.worker.id,
    'worker disputes payment amount'
  );
  assert.equal(disputeResult.ok, true);

  summary = await payments.getFinancialSummary();
  assert.equal(summary.totalPayments, 1);
  assert.equal(summary.pendingAmount, 0, 'same payment leaves pending totals when mutable status becomes disputed');
  assert.equal(summary.completedAmount, 0);
  assert.equal(summary.disputedCount, 1);

  const completeResult = await payments.completePayment(paymentId);
  assert.equal(completeResult.ok, true);

  summary = await payments.getFinancialSummary();
  assert.equal(summary.totalPayments, 1);
  assert.equal(summary.pendingAmount, 0);
  assert.equal(summary.completedAmount, amount, 'same payment enters completed totals after mutable status changes');
  assert.equal(summary.disputedCount, 0, 'disputedCount is based on current status only, not dispute history');
});

test('receipt generation is on-demand and does not persist a transactional receipt record', async (t) => {
  const { dataPath, database } = await setupIsolatedDataPath(t);
  const { default: config } = await importFresh('../../config.js');

  const fixture = await buildCompletedJobFixture();

  const financialExport = await importFresh('../../server/services/financialExport.js');

  assert.equal(
    config.DATABASE.dirs.receipts,
    undefined,
    'there is no configured durable receipts collection'
  );

  assert.throws(
    () => database.getCollectionPath('receipts'),
    /Unknown collection: receipts/,
    'database has no receipts collection path'
  );

  const jsonCountBeforeReceipt = await countJsonFiles(dataPath);

  const receipt = await financialExport.generateReceipt(fixture.payment.id);

  assert.ok(receipt, 'receipt can be generated from current projections');
  assert.match(
    receipt.receiptNumber,
    /^RCT-\d{8}-\d{3}$/,
    'receipt number is generated on demand'
  );

  assert.equal(receipt.job.title, fixture.job.title);
  assert.equal(receipt.subtotal, fixture.payment.amount);
  assert.equal(receipt.platformFee, fixture.payment.platformFee);
  assert.equal(receipt.workerPayout, fixture.payment.workerPayout);

  const jsonCountAfterReceipt = await countJsonFiles(dataPath);

  assert.equal(
    jsonCountAfterReceipt,
    jsonCountBeforeReceipt,
    'generateReceipt reads current state but does not persist a receipt artifact'
  );
});
