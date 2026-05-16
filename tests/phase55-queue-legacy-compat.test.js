import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-legacy-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const storage = await import(`../server/services/queueStorageIndex.js?x=${Date.now()}`);

  return { dir, database, storage };
}

test('Phase 55: legacy flat queue record remains readable', async () => {
  const { dir, database, storage } = await setup();

  try {
    const legacy = {
      id: 'q_legacy_read',
      type: 'legacy_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await database.atomicWrite(database.getRecordPath('ops_queue', legacy.id), legacy);

    const readBack = await storage.readQueueRecord(legacy.id);
    assert.equal(readBack.id, legacy.id);
    assert.equal(readBack.type, 'legacy_job');
    assert.equal(readBack.status, 'pending');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: rebuilding queue summary includes legacy records', async () => {
  const { dir, database, storage } = await setup();

  try {
    const legacy = {
      id: 'q_legacy_summary',
      type: 'legacy_summary_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await database.atomicWrite(database.getRecordPath('ops_queue', legacy.id), legacy);

    const summary = await storage.rebuildQueueSummary();

    assert.equal(summary.byStatus.pending, 1);
    assert.equal(summary.byType.legacy_summary_job, 1);
    assert.equal(summary.locations[legacy.id].legacy, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
