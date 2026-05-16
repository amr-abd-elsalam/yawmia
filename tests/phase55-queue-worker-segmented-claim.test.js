import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-queue-claim-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const opsQueue = await import(`../server/services/opsQueue.js?x=${Date.now()}`);

  return { dir, opsQueue };
}

test('Phase 55: queue worker claim reads segmented pending records', async () => {
  const { dir, opsQueue } = await setup();

  try {
    const enq = await opsQueue.enqueueJob({
      type: 'segmented_claim_job',
      priority: 'normal',
      payload: {},
      idempotencyKey: 'segmented_claim_job_once',
      createdBy: 'test',
    });

    assert.equal(enq.ok, true);

    const claimed = await opsQueue.claimNextJobs({
      workerId: 'test_worker',
      limit: 1,
    });

    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].type, 'segmented_claim_job');
    assert.equal(claimed[0].status, 'running');

    const job = await opsQueue.getJob(claimed[0].id);
    assert.equal(job.status, 'running');
    assert.equal(job.lockedBy, 'test_worker');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
