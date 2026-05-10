import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir;
let db;
let registry;
let queue;
let workers;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase52-export-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  await db.initDatabase();

  registry = await import('../server/services/exportRegistry.js');
  queue = await import('../server/services/opsQueue.js');
  workers = await import('../server/services/queueWorkers.js');

  // Create audit records.
  for (let i = 0; i < 3; i++) {
    await db.atomicWrite(db.getRecordPath('audit', `aud_phase52_${i}`), {
      id: `aud_phase52_${i}`,
      adminId: 'admin_test',
      action: i === 0 ? 'user_banned' : 'test_action',
      targetType: 'user',
      targetId: `usr_${i}`,
      details: { i },
      ip: '127.0.0.1',
      createdAt: new Date(Date.now() + i).toISOString(),
    });
  }
});

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test('async audit export queue job generates persisted CSV', async () => {
  const exp = await registry.createExport({
    type: 'audit_csv',
    filters: {},
    requestedBy: 'admin_test',
    totalEstimate: 3,
  });

  const enq = await queue.enqueueJob({
    type: 'audit_csv_export',
    priority: 'normal',
    payload: {
      exportId: exp.id,
      filters: {},
    },
    idempotencyKey: `test:audit_export:${exp.id}`,
    createdBy: 'test',
  });

  assert.equal(enq.ok, true);

  await workers.processDueJobs();
  await new Promise(resolve => setTimeout(resolve, 500));

  const updated = await registry.getExport(exp.id);
  assert.equal(updated.status, 'completed');
  assert.equal(updated.percentage, 100);
  assert.equal(updated.rowsProcessed >= 3, true);

  const filePath = registry.getExportCsvAbsolutePath(exp.id);
  await stat(filePath);

  const csv = await readFile(filePath, 'utf-8');
  assert.match(csv, /المعرّف/);
  assert.match(csv, /aud_phase52_0/);
});

test('async audit export respects action filter', async () => {
  const exp = await registry.createExport({
    type: 'audit_csv',
    filters: { action: 'user_banned' },
    requestedBy: 'admin_test',
    totalEstimate: 3,
  });

  const enq = await queue.enqueueJob({
    type: 'audit_csv_export',
    payload: {
      exportId: exp.id,
      filters: { action: 'user_banned' },
    },
    idempotencyKey: `test:audit_export_filter:${exp.id}`,
  });

  assert.equal(enq.ok, true);

  await workers.processDueJobs();
  await new Promise(resolve => setTimeout(resolve, 500));

  const updated = await registry.getExport(exp.id);
  assert.equal(updated.status, 'completed');

  const csv = await readFile(registry.getExportCsvAbsolutePath(exp.id), 'utf-8');
  assert.match(csv, /aud_phase52_0/);
  assert.doesNotMatch(csv, /aud_phase52_1/);
});

test('cancelled export job returns cancelled and does not corrupt registry', async () => {
  const exp = await registry.createExport({
    type: 'audit_csv',
    filters: {},
    requestedBy: 'admin_test',
    totalEstimate: 3,
  });

  await registry.cancelExport(exp.id, 'admin_test');

  const enq = await queue.enqueueJob({
    type: 'audit_csv_export',
    payload: {
      exportId: exp.id,
      filters: {},
    },
    idempotencyKey: `test:audit_export_cancelled:${exp.id}`,
  });

  assert.equal(enq.ok, true);

  await workers.processDueJobs();
  await new Promise(resolve => setTimeout(resolve, 250));

  const updated = await registry.getExport(exp.id);
  assert.equal(updated.status, 'cancelled');
});

test('async export queue idempotency is scoped to exportId to avoid orphan exports', async () => {
  const exp1 = await registry.createExport({
    type: 'audit_csv',
    filters: {},
    requestedBy: 'admin_test',
    totalEstimate: 3,
  });

  const exp2 = await registry.createExport({
    type: 'audit_csv',
    filters: {},
    requestedBy: 'admin_test',
    totalEstimate: 3,
  });

  const enq1 = await queue.enqueueJob({
    type: 'audit_csv_export',
    payload: { exportId: exp1.id, filters: {} },
    idempotencyKey: `audit_csv_export:${exp1.id}`,
  });

  const enq2 = await queue.enqueueJob({
    type: 'audit_csv_export',
    payload: { exportId: exp2.id, filters: {} },
    idempotencyKey: `audit_csv_export:${exp2.id}`,
  });

  assert.equal(enq1.ok, true);
  assert.equal(enq2.ok, true);
  assert.notEqual(enq1.job.id, enq2.job.id);
  assert.equal(enq2.deduped, false);
});
