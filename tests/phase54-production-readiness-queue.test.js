import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('production_readiness_check queue handler completes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-readiness-queue-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.INSTANCE_MODE = 'single_writer';
  process.env.INSTANCE_ID = 'readiness_queue_test';
  process.env.ADMIN_TOKEN = 'non_default_admin_token_for_test';

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const { enqueueJob, getJob } = await import(`../server/services/opsQueue.js?q=${Date.now()}`);
    const workers = await import(`../server/services/queueWorkers.js?w=${Date.now()}`);

    const enq = await enqueueJob({
      type: 'production_readiness_check',
      priority: 'low',
      payload: {},
      idempotencyKey: 'unit:production_readiness_check',
      createdBy: 'test',
    });

    assert.equal(enq.ok, true);

    const processed = await workers.processDueJobs();
    assert.equal(processed.claimed >= 1, true);

    await new Promise(resolve => setTimeout(resolve, 500));

    const job = await getJob(enq.job.id);
    assert.equal(job.status, 'completed');
    assert.ok(job.result.status);
    assert.ok(job.result.summary);

    await workers.stopQueueWorkers({ drainMs: 1000 });
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.INSTANCE_MODE;
    delete process.env.INSTANCE_ID;
    delete process.env.ADMIN_TOKEN;
  }
});
