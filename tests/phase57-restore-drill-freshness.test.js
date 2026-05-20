import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('restore drill freshness reports missing drill', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-brd-fresh-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const mod = await import('../server/services/backupRestoreDrill.js');
  const freshness = await mod.getLatestRestoreDrillFreshness({ thresholdDays: 7 });

  assert.equal(freshness.enabled, true);
  assert.equal(freshness.latest, null);
  assert.equal(freshness.fresh, false);
  assert.equal(freshness.passed, false);
  assert.equal(freshness.status, 'missing');

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});

test('restore drill freshness reports recent passed drill as healthy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-brd-fresh-'));
  const prev = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const now = new Date().toISOString();
  await db.atomicWrite(db.getRecordPath('backup_restore_drills', 'brd_test'), {
    id: 'brd_test',
    status: 'passed',
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
    errors: [],
  });

  const mod = await import('../server/services/backupRestoreDrill.js');
  const freshness = await mod.getLatestRestoreDrillFreshness({ thresholdDays: 7 });

  assert.equal(freshness.enabled, true);
  assert.equal(freshness.fresh, true);
  assert.equal(freshness.passed, true);
  assert.equal(freshness.status, 'healthy');

  process.env.YAWMIA_DATA_PATH = prev;
  await rm(dir, { recursive: true, force: true });
});
