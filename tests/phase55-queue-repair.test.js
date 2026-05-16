import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-repair-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const storage = await import(`../server/services/queueStorageIndex.js?x=${Date.now()}`);
  const verify = await import(`../server/services/queueHealthVerify.js?x=${Date.now()}`);

  return { dir, database, storage, verify };
}

test('Phase 55: queue repair rebuilds summary', async () => {
  const { dir, storage, verify } = await setup();

  try {
    await storage.writeQueueRecord({
      id: 'q_repair_summary',
      type: 'repair_job',
      status: 'completed',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 1,
      maxAttempts: 5,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
      completedAt: '2026-05-16T10:00:00.000Z',
    });

    const result = await verify.repairQueueStorage();

    assert.equal(result.ok, true);
    assert.equal(result.summary.byStatus.completed, 1);
    assert.equal(result.summary.locationCount >= 1, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
