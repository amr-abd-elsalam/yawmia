import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: queue repair dry-run does not mutate summary', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-queue-'));
  const previous = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js?' + Date.now());
    await db.initDatabase();

    const storage = await import('../server/services/queueStorageIndex.js?' + Date.now());
    const verify = await import('../server/services/queueHealthVerify.js?' + Date.now());

    await storage.writeQueueRecord({
      id: 'q_test_1',
      type: 'test_job',
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

    const summaryPath = storage._testHelpers.summaryPath();
    const beforeRaw = await readFile(summaryPath, 'utf-8');
    const beforeStat = await stat(summaryPath);

    const result = await verify.repairQueueStorage({ dryRun: true });

    const afterRaw = await readFile(summaryPath, 'utf-8');
    const afterStat = await stat(summaryPath);

    assert.equal(result.dryRun, true);
    assert.equal(result.mutationPerformed, false);
    assert.deepEqual(JSON.parse(afterRaw), JSON.parse(beforeRaw));
    assert.equal(afterStat.size, beforeStat.size);
  } finally {
    if (previous === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
