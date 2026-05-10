import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir;
let db;
let queue;
let workers;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase52-concurrency-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  await db.initDatabase();

  queue = await import('../server/services/opsQueue.js');
  workers = await import('../server/services/queueWorkers.js');
});

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test('concurrent enqueue with same idempotencyKey creates one job', async () => {
  const calls = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      queue.enqueueJob({
        type: 'idem_concurrent',
        payload: { i },
        idempotencyKey: 'idem:concurrent',
      })
    )
  );

  const ids = new Set(calls.map(r => r.job.id));
  assert.equal(ids.size, 1);
  assert.equal(calls.filter(r => r.deduped).length >= 9, true);
});

test('concurrent claim cannot claim same job twice', async () => {
  const enq = await queue.enqueueJob({
    type: 'claim_concurrent',
    payload: {},
    priority: 'critical',
  });

  const results = await Promise.all([
    queue.claimNextJobs({ workerId: 'cw1', limit: 1 }),
    queue.claimNextJobs({ workerId: 'cw2', limit: 1 }),
    queue.claimNextJobs({ workerId: 'cw3', limit: 1 }),
  ]);

  const allClaimedIds = results.flat().map(j => j.id);
  const targetCount = allClaimedIds.filter(id => id === enq.job.id).length;

  assert.equal(targetCount, 1);
});

test('running job lease prevents another worker claim until stale', async () => {
  const enq = await queue.enqueueJob({
    type: 'lease_test',
    payload: {},
  });

  const first = await queue.claimNextJobs({ workerId: 'lease-a', limit: 1 });
  assert.ok(first.find(j => j.id === enq.job.id));

  const second = await queue.claimNextJobs({ workerId: 'lease-b', limit: 10 });
  assert.equal(second.some(j => j.id === enq.job.id), false);
});

test('queue worker handler error does not corrupt job file', async () => {
  workers.registerJobHandler('throwing_test', async () => {
    throw new Error('handler exploded');
  });

  const enq = await queue.enqueueJob({
    type: 'throwing_test',
    payload: {},
    maxAttempts: 2,
    backoffMs: 10,
  });

  await workers.processDueJobs();

  // allow fire-and-forget processOneJob to finish
  await new Promise(resolve => setTimeout(resolve, 100));

  const loaded = await queue.getJob(enq.job.id);
  assert.ok(loaded);
  assert.equal(['pending', 'dead-letter'].includes(loaded.status), true);
  assert.match(loaded.lastError || '', /handler exploded/);
});

test('bounded worker concurrency processes at most available claims per tick', async () => {
  let running = 0;
  let maxRunning = 0;

  workers.registerJobHandler('slow_test', async () => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    await new Promise(resolve => setTimeout(resolve, 100));
    running--;
    return { ok: true };
  });

  for (let i = 0; i < 5; i++) {
    await queue.enqueueJob({
      type: 'slow_test',
      payload: { i },
      idempotencyKey: `slow:${i}`,
    });
  }

  await workers.processDueJobs();
  await new Promise(resolve => setTimeout(resolve, 250));

  const stats = workers.getWorkerStats();
  assert.equal(maxRunning <= stats.concurrency, true);
});
