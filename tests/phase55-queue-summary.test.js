import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-summary-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const opsQueue = await import(`../server/services/opsQueue.js?x=${Date.now()}`);

  return { dir, opsQueue };
}

test('Phase 55: opsQueue stats use queue summary shape', async () => {
  const { dir, opsQueue } = await setup();

  try {
    const enq = await opsQueue.enqueueJob({
      type: 'summary_stats_job',
      priority: 'normal',
      payload: {},
      idempotencyKey: 'summary_stats_job_once',
      createdBy: 'test',
    });

    assert.equal(enq.ok, true);

    const stats = await opsQueue.getQueueStats();

    assert.equal(stats.enabled, true);
    assert.equal(stats.byStatus.pending, 1);
    assert.equal(stats.byType.summary_stats_job, 1);
    assert.equal(stats.summary.stale, false);
    assert.equal(typeof stats.summary.locationCount, 'number');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
