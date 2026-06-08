// ═══════════════════════════════════════════════════════════════
// tests/e2e/receipt-persistence-gap-characterization.test.js
// Patch 44 — Receipt Persistence Gap Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize current receipt generation as an on-demand view,
//   not a persisted transactional financial artifact.
//
// Current runtime behavior:
//   - generateReceipt(paymentId) reads current payment/job/user/application state
//   - receiptNumber is generated at read time
//   - no receipts collection exists
//   - no receipt record is persisted
//   - receipt content can change after mutable payment projection changes
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
  return await import(`${path}?receipt-persistence-gap=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-receipt-persistence-gap-'));

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

async function buildCompletedJobWithPaymentFixture() {
  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const payments = await importFresh('../../server/services/payments.js');
  const financialExport = await importFresh('../../server/services/financialExport.js');

  const employer = await users.create('01012345678', 'employer');
  await users.update(employer.id, {
    name: 'صاحب عمل إيصال غير مثبت',
    governorate: 'cairo',
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
  });

  const worker = await users.create('01112345678', 'worker');
  await users.update(worker.id, {
    name: 'عامل إيصال غير مثبت',
    governorate: 'cairo',
    categories: ['construction'],
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
  });

  const job = await jobs.create(employer.id, {
    title: 'فرصة إيصال غير مثبت',
    category: 'construction',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 300,
    startDate: '2026-06-09',
    durationDays: 1,
    description: 'مطلوب عامل لمدة يوم واحد',
  });

  const appResult = await applications.apply(job.id, worker.id);
  assert.equal(appResult.ok, true);

  const acceptResult = await applications.accept(appResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true);

  const completedJob = await jobs.updateStatus(job.id, 'completed');
  assert.equal(completedJob.status, 'completed');

  const paymentResult = await payments.createPayment(job.id, employer.id, {
    method: 'cash',
  });
  assert.equal(paymentResult.ok, true);

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
      financialExport,
    },
  };
}

function withMockedDateNow(values, fn) {
  const originalNow = Date.now;
  let idx = 0;

  Date.now = function mockedDateNow() {
    const value = values[Math.min(idx, values.length - 1)];
    idx++;
    return value;
  };

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Date.now = originalNow;
    });
}

test('generateReceipt does not persist a receipt record or receipts collection', async (t) => {
  const { dataPath, database } = await setupIsolatedDataPath(t);
  const { default: config } = await importFresh('../../config.js');

  const fixture = await buildCompletedJobWithPaymentFixture();
  const { financialExport } = fixture.services;

  assert.equal(
    config.DATABASE.dirs.receipts,
    undefined,
    'current config has no durable receipts collection'
  );

  assert.throws(
    () => database.getCollectionPath('receipts'),
    /Unknown collection: receipts/,
    'database has no receipts collection path'
  );

  const before = await countJsonFiles(dataPath);

  const receipt = await financialExport.generateReceipt(fixture.payment.id);

  assert.ok(receipt);
  assert.match(receipt.receiptNumber, /^RCT-\d{8}-\d{3}$/);

  const after = await countJsonFiles(dataPath);

  assert.equal(
    after,
    before,
    'receipt generation does not write any durable receipt artifact'
  );

  assert.equal(
    receipt.paymentId,
    undefined,
    'receipt output has no persisted receipt/payment artifact identity beyond generated display number'
  );
});

test('receipt number is generated at read time and is not stable as a persisted financial identity', async (t) => {
  await setupIsolatedDataPath(t);

  const fixture = await buildCompletedJobWithPaymentFixture();
  const { financialExport } = fixture.services;

  // Use separate fixed Date.now() windows per receipt call.
  // A single generateReceipt() call may internally consume Date.now() more than once
  // through lazy imports/cache reads, so using a two-value sequence can be flaky.
  const fixedA = 1000000000000; // seq => 001
  const fixedB = 1000000000123; // seq => 124

  const receiptA = await withMockedDateNow([fixedA], async () => {
    return await financialExport.generateReceipt(fixture.payment.id);
  });

  const receiptB = await withMockedDateNow([fixedB], async () => {
    return await financialExport.generateReceipt(fixture.payment.id);
  });

  assert.ok(receiptA);
  assert.ok(receiptB);

  assert.match(receiptA.receiptNumber, /^RCT-\d{8}-\d{3}$/);
  assert.match(receiptB.receiptNumber, /^RCT-\d{8}-\d{3}$/);

  assert.notEqual(
    receiptA.receiptNumber,
    receiptB.receiptNumber,
    'same payment can receive different receipt numbers across reads because no persisted receipt allocation exists'
  );

  assert.equal(receiptA.subtotal, receiptB.subtotal);
  assert.equal(receiptA.platformFee, receiptB.platformFee);
  assert.equal(receiptA.workerPayout, receiptB.workerPayout);
});

test('receipt content reflects current mutable payment projection rather than an immutable issued snapshot', async (t) => {
  await setupIsolatedDataPath(t);

  const fixture = await buildCompletedJobWithPaymentFixture();
  const { payments, financialExport } = fixture.services;

  const receiptBefore = await financialExport.generateReceipt(fixture.payment.id);

  assert.ok(receiptBefore);
  assert.equal(receiptBefore.paymentStatus, 'pending');
  assert.equal(receiptBefore.subtotal, fixture.payment.amount);
  assert.equal(receiptBefore.platformFee, fixture.payment.platformFee);
  assert.equal(receiptBefore.workerPayout, fixture.payment.workerPayout);

  const confirmResult = await payments.confirmPayment(fixture.payment.id, fixture.employer.id);
  assert.equal(confirmResult.ok, true);
  assert.equal(confirmResult.payment.status, 'employer_confirmed');

  const receiptAfterConfirm = await financialExport.generateReceipt(fixture.payment.id);

  assert.ok(receiptAfterConfirm);
  assert.equal(
    receiptAfterConfirm.paymentStatus,
    'employer_confirmed',
    'receipt generated after status mutation reflects current payment projection'
  );

  const disputeResult = await payments.disputePayment(
    fixture.payment.id,
    fixture.worker.id,
    'worker disputes payment after first receipt view'
  );
  assert.equal(disputeResult.ok, true);
  assert.equal(disputeResult.payment.status, 'disputed');

  const receiptAfterDispute = await financialExport.generateReceipt(fixture.payment.id);

  assert.ok(receiptAfterDispute);
  assert.equal(
    receiptAfterDispute.paymentStatus,
    'disputed',
    'receipt generated after dispute reflects changed mutable projection, not an immutable issued receipt snapshot'
  );

  assert.equal(
    receiptBefore.paymentStatus,
    'pending',
    'first generated receipt object is only an in-memory view, not a durable issued artifact'
  );
});
