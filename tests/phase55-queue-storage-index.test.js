import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-storage-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const storage = await import(`../server/services/queueStorageIndex.js?x=${Date.now()}`);

  return { dir, database, storage };
}

test('Phase 55: queueStorageIndex writes segmented queue records', async () => {
  const { dir, storage } = await setup();

  try {
    const job = {
      id: 'q_test_segmented',
      type: 'test_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    };

    await storage.writeQueueRecord(job);

    const expectedPath = join(dir, 'ops_queue', 'pending', '2026-05', 'q_test_segmented.json');
    const exists = await stat(expectedPath).then(() => true).catch(() => false);

    assert.equal(exists, true);

    const readBack = await storage.readQueueRecord(job.id);
    assert.equal(readBack.id, job.id);
    assert.equal(readBack.status, 'pending');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: queueStorageIndex moves record between status segments', async () => {
  const { dir, storage } = await setup();

  try {
    const job = {
      id: 'q_test_move',
      type: 'test_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    };

    await storage.writeQueueRecord(job);

    const moved = await storage.moveQueueRecord(job, 'running');

    assert.equal(moved.status, 'running');

    const pendingPath = join(dir, 'ops_queue', 'pending', '2026-05', 'q_test_move.json');
    const runningPath = join(dir, 'ops_queue', 'running', '2026-05', 'q_test_move.json');

    const pendingExists = await stat(pendingPath).then(() => true).catch(() => false);
    const runningExists = await stat(runningPath).then(() => true).catch(() => false);

    assert.equal(pendingExists, false);
    assert.equal(runningExists, true);

    const readBack = await storage.readQueueRecord(job.id);
    assert.equal(readBack.status, 'running');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: queue summary is updated by writes and moves', async () => {
  const { dir, storage } = await setup();

  try {
    const job = {
      id: 'q_test_summary',
      type: 'summary_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    };

    await storage.writeQueueRecord(job);

    let summary = await storage.readQueueSummary();
    assert.equal(summary.byStatus.pending, 1);
    assert.equal(summary.byType.summary_job, 1);
    assert.equal(summary.locations[job.id].status, 'pending');

    await storage.moveQueueRecord(job, 'completed');

    summary = await storage.readQueueSummary();
    assert.equal(summary.byStatus.pending, 0);
    assert.equal(summary.byStatus.completed, 1);
    assert.equal(summary.locations[job.id].status, 'completed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
