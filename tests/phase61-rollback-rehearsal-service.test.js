import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Phase 61 rollback rehearsal is non-destructive and JSON-safe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p61-rollback-'));
  const old = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js?rb=' + Date.now());
    await db.initDatabase();

    const svc = await import('../server/services/rollbackRehearsal.js?rb=' + Date.now());
    const result = await svc.runRollbackRehearsal({ dryRun: true, persist: true });

    assert.equal(typeof result.ok, 'boolean');
    assert.equal(result.rehearsal.phase, 61);
    assert.equal(result.rehearsal.sourceDataMutated, false);
    assert.equal(result.rehearsal.externalDbConnected, false);
    assert.equal(result.rehearsal.externalSearchConnected, false);
    assert.equal(result.rehearsal.externalQueueConnected, false);
    assert.ok(Array.isArray(result.rehearsal.indexRepairPlan));
    assert.ok(Array.isArray(result.rehearsal.queueVerifyPlan));
    assert.ok(Array.isArray(result.rehearsal.smokePlan));

    const saved = await svc.getRollbackRehearsal(result.rehearsal.id);
    assert.equal(saved.id, result.rehearsal.id);
  } finally {
    if (old === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = old;
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 61 rollback readiness blocks missing backup/restore drill', async () => {
  const svc = await import('../server/services/rollbackRehearsal.js?rbpure=' + Date.now());

  const result = svc.evaluateRollbackReadiness({
    backupReference: null,
    restoreDrill: null,
    snapshotReference: null,
    indexRepairPlan: [],
    queueVerifyPlan: [],
    smokePlan: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.ok(result.blockers.some(b => b.code === 'BACKUP_REFERENCE_MISSING'));
  assert.ok(result.blockers.some(b => b.code === 'RESTORE_DRILL_MISSING'));
});
