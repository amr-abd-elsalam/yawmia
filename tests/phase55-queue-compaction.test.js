import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-compaction-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const storage = await import(`../server/services/queueStorageIndex.js?x=${Date.now()}`);
  const compaction = await import(`../server/services/queueCompaction.js?x=${Date.now()}`);

  return { dir, database, storage, compaction };
}

test('Phase 55: queue compaction archives old completed records', async () => {
  const { dir, storage, compaction } = await setup();

  try {
    const oldIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const job = {
      id: 'q_old_completed',
      type: 'old_completed_job',
      status: 'completed',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 1,
      maxAttempts: 5,
      createdAt: oldIso,
      updatedAt: oldIso,
      completedAt: oldIso,
    };

    await storage.writeQueueRecord(job);

    const result = await compaction.archiveOldQueueRecords({ status: 'completed' });

    assert.equal(result.archived, 1);

    const activePath = join(dir, 'ops_queue', 'completed', oldIso.slice(0, 7), 'q_old_completed.json');
    const activeExists = await stat(activePath).then(() => true).catch(() => false);
    assert.equal(activeExists, false);

    const archivePath = join(dir, 'ops_queue', 'archive', oldIso.slice(0, 7), 'completed.json');
    const fsArchiveExists = await stat(archivePath).then(() => true).catch(() => false);
    assert.equal(fsArchiveExists, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: queue compaction does not archive pending or running jobs', async () => {
  const { dir, storage, compaction } = await setup();

  try {
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    await storage.writeQueueRecord({
      id: 'q_old_pending',
      type: 'pending_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: oldIso,
      createdAt: oldIso,
      updatedAt: oldIso,
    });

    await storage.writeQueueRecord({
      id: 'q_old_running',
      type: 'running_job',
      status: 'running',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 1,
      maxAttempts: 5,
      leaseUntil: new Date(Date.now() + 60000).toISOString(),
      createdAt: oldIso,
      updatedAt: oldIso,
    });

    const result = await compaction.archiveOldQueueRecords();

    assert.equal(result.archived, 0);

    const p = await storage.readQueueRecord('q_old_pending');
    const r = await storage.readQueueRecord('q_old_running');

    assert.equal(p.status, 'pending');
    assert.equal(r.status, 'running');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
