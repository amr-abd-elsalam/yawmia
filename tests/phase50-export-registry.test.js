import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tempDir;
let db;
let registry;

before(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'yawmia-phase50-export-'));
  process.env.YAWMIA_DATA_PATH = tempDir;

  db = await import('../server/services/database.js?phase50exportdb=' + Date.now());
  await db.initDatabase();

  registry = await import('../server/services/exportRegistry.js?phase50exportregistry=' + Date.now());
});

after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
});

test('Phase 50: export registry persists lifecycle state', async () => {
  const created = await registry.createExport({
    type: 'audit_csv',
    filters: { action: 'user_banned' },
    requestedBy: 'adm_test',
    totalEstimate: 100,
  });

  assert.ok(created.id.startsWith('exp_'));
  assert.equal(created.status, 'pending');
  assert.equal(created.rowsProcessed, 0);
  assert.equal(created.totalEstimate, 100);

  const updated = await registry.updateExportProgress(created.id, { rowsProcessed: 25 });
  assert.equal(updated.status, 'running');
  assert.equal(updated.rowsProcessed, 25);
  assert.equal(updated.percentage, 25);
  assert.ok(updated.startedAt);

  const fetched = await registry.getExport(created.id);
  assert.equal(fetched.id, created.id);
  assert.equal(fetched.rowsProcessed, 25);

  const completed = await registry.completeExport(created.id, { rowsProcessed: 100 });
  assert.equal(completed.status, 'completed');
  assert.equal(completed.percentage, 100);
  assert.ok(completed.completedAt);

  const listed = await registry.listExports({ limit: 10 });
  assert.ok(listed.total >= 1);
  assert.ok(listed.exports.some(e => e.id === created.id));
});

test('Phase 50: export registry cancellation persists cancelRequested', async () => {
  const created = await registry.createExport({
    type: 'audit_csv',
    filters: {},
    requestedBy: 'adm_test',
    totalEstimate: 10,
  });

  await registry.updateExportProgress(created.id, { rowsProcessed: 2 });

  const cancelled = await registry.cancelExport(created.id, 'adm_test');
  assert.equal(cancelled.ok, true);
  assert.equal(cancelled.export.status, 'cancelled');
  assert.equal(cancelled.export.cancelRequested, true);

  const isCancelled = await registry.isCancellationRequested(created.id);
  assert.equal(isCancelled, true);
});

test('Phase 50: export registry cleanup removes expired exports and CSV file', async () => {
  const created = await registry.createExport({
    type: 'audit_csv',
    filters: {},
    requestedBy: 'adm_test',
    totalEstimate: 1,
  });

  const csvPath = registry.getExportCsvAbsolutePath(created.id);
  await writeFile(csvPath, 'test', 'utf-8');

  const recordPath = db.getRecordPath('exports', created.id);
  const raw = await db.readJSON(recordPath);
  assert.ok(raw, 'export record should exist before forcing expiry');

  raw.expiresAt = new Date(Date.now() - 1000).toISOString();
  await db.atomicWrite(recordPath, raw);

  const cleaned = await registry.cleanupExpiredExports();
  assert.ok(cleaned >= 1);

  const after = await registry.getExport(created.id);
  assert.equal(after, null);
});
