import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-verify-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const storage = await import(`../server/services/queueStorageIndex.js?x=${Date.now()}`);
  const verify = await import(`../server/services/queueHealthVerify.js?x=${Date.now()}`);

  return { dir, database, storage, verify };
}

test('Phase 55: queue verify detects healthy queue', async () => {
  const { dir, storage, verify } = await setup();

  try {
    await storage.writeQueueRecord({
      id: 'q_verify_ok',
      type: 'verify_job',
      status: 'pending',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 0,
      maxAttempts: 5,
      nextRunAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await verify.verifyQueueHealth();

    assert.equal(result.ok, true);
    assert.equal(result.errors.length, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: queue verify detects status-dir mismatch', async () => {
  const { dir, database, verify } = await setup();

  try {
    const job = {
      id: 'q_verify_mismatch',
      type: 'verify_job',
      status: 'completed',
      priority: 'normal',
      priorityWeight: 50,
      payload: {},
      attempts: 1,
      maxAttempts: 5,
      createdAt: '2026-05-16T10:00:00.000Z',
      updatedAt: '2026-05-16T10:00:00.000Z',
    };

    const wrongPath = join(dir, 'ops_queue', 'pending', '2026-05', 'q_verify_mismatch.json');
    await database.atomicWrite(wrongPath, job);

    const result = await verify.verifyQueueHealth();

    assert.equal(result.ok, true);
    assert.equal(result.details.statusDirMismatches.length, 1);
    assert.equal(result.details.statusDirMismatches[0].actualStatus, 'completed');
    assert.equal(result.details.statusDirMismatches[0].expectedStatus, 'pending');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
