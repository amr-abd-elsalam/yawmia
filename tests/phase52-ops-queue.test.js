import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir;
let db;
let queue;

test.before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'yawmia-phase52-queue-'));
  process.env.YAWMIA_DATA_PATH = dataDir;

  db = await import('../server/services/database.js');
  await db.initDatabase();

  queue = await import('../server/services/opsQueue.js');
});

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

test('enqueueJob creates a pending queue job', async () => {
  const result = await queue.enqueueJob({
    type: 'test_job',
    payload: { hello: 'world' },
    priority: 'normal',
    createdBy: 'test',
  });

  assert.equal(result.ok, true);
  assert.equal(result.job.status, 'pending');

  const loaded = await queue.getJob(result.job.id);
  assert.equal(loaded.id, result.job.id);
  assert.equal(loaded.type, 'test_job');
});

test('enqueueJob rejects oversized payload', async () => {
  await assert.rejects(
    () => queue.enqueueJob({
      type: 'oversized',
      payload: { text: 'x'.repeat(300 * 1024) },
    }),
    /payload exceeds/i
  );
});

test('idempotency key prevents duplicate active jobs', async () => {
  const first = await queue.enqueueJob({
    type: 'idem_test',
    payload: { n: 1 },
    idempotencyKey: 'idem:same',
  });

  const second = await queue.enqueueJob({
    type: 'idem_test',
    payload: { n: 2 },
    idempotencyKey: 'idem:same',
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.deduped, true);
  assert.equal(second.job.id, first.job.id);
});

test('claimNextJobs claims due pending job and sets lease', async () => {
  const enq = await queue.enqueueJob({
    type: 'claim_test',
    payload: {},
    priority: 'high',
  });

  const claimed = await queue.claimNextJobs({ workerId: 'w1', limit: 1 });
  assert.equal(claimed.length >= 1, true);

  const job = await queue.getJob(enq.job.id);
  assert.equal(job.status, 'running');
  assert.equal(job.lockedBy, 'w1');
  assert.ok(job.leaseUntil);
  assert.equal(job.attempts, 1);
});

test('completeJob marks completed', async () => {
  const enq = await queue.enqueueJob({ type: 'complete_test', payload: {} });
  const claimed = await queue.claimNextJobs({ workerId: 'w2', limit: 10 });
  const job = claimed.find(j => j.id === enq.job.id);

  assert.ok(job);

  const result = await queue.completeJob(enq.job.id, { done: true });
  assert.equal(result.ok, true);

  const loaded = await queue.getJob(enq.job.id);
  assert.equal(loaded.status, 'completed');
  assert.deepEqual(loaded.result, { done: true });
});

test('failJob retryable schedules nextRunAt', async () => {
  const enq = await queue.enqueueJob({
    type: 'fail_retry_test',
    payload: {},
    backoffMs: 10,
    maxAttempts: 3,
  });

  await queue.claimNextJobs({ workerId: 'w3', limit: 10 });

  const result = await queue.failJob(enq.job.id, new Error('boom'), { retryable: true });
  assert.equal(result.ok, true);
  assert.equal(result.retryScheduled, true);

  const loaded = await queue.getJob(enq.job.id);
  assert.equal(loaded.status, 'pending');
  assert.ok(new Date(loaded.nextRunAt).getTime() >= Date.now());
  assert.match(loaded.lastError, /boom/);
});

test('exhausted attempts moves to dead-letter', async () => {
  const enq = await queue.enqueueJob({
    type: 'dlq_test',
    payload: {},
    maxAttempts: 1,
  });

  await queue.claimNextJobs({ workerId: 'w4', limit: 10 });
  const result = await queue.failJob(enq.job.id, new Error('fatal'), { retryable: true });

  assert.equal(result.ok, true);
  assert.equal(result.deadLettered, true);

  const loaded = await queue.getJob(enq.job.id);
  assert.equal(loaded.status, 'dead-letter');
});

test('cancel pending job', async () => {
  const enq = await queue.enqueueJob({ type: 'cancel_test', payload: {} });
  const result = await queue.cancelJob(enq.job.id, 'test cancel');

  assert.equal(result.ok, true);
  assert.equal(result.job.status, 'cancelled');
});

test('retry cancelled job resets to pending', async () => {
  const enq = await queue.enqueueJob({ type: 'retry_cancelled', payload: {} });
  await queue.cancelJob(enq.job.id, 'test cancel');

  const result = await queue.retryJob(enq.job.id);
  assert.equal(result.ok, true);
  assert.equal(result.job.status, 'pending');
  assert.equal(result.job.attempts, 0);
});

test('recoverStaleRunningJobs recovers expired lease', async () => {
  const enq = await queue.enqueueJob({
    type: 'stale_test',
    payload: {},
    maxAttempts: 3,
  });

  await queue.claimNextJobs({ workerId: 'stale-worker', limit: 10 });

  const job = await queue.getJob(enq.job.id);
  job.leaseUntil = new Date(Date.now() - 1000).toISOString();
  job.updatedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  await db.atomicWrite(db.getRecordPath('ops_queue', job.id), job);

  const recovered = await queue.recoverStaleRunningJobs();
  assert.equal(recovered >= 1, true);

  const loaded = await queue.getJob(job.id);
  assert.equal(loaded.status, 'pending');
  assert.equal(loaded.lockedBy, null);
});

test('getQueueStats returns status counts', async () => {
  const stats = await queue.getQueueStats();
  assert.equal(stats.enabled, true);
  assert.ok(stats.byStatus);
  assert.equal(typeof stats.byStatus.pending, 'number');
});

test('retry dead-letter job removes dead-letter copy', async () => {
  const enq = await queue.enqueueJob({
    type: 'retry_dlq_cleanup',
    payload: {},
    maxAttempts: 1,
  });

  await queue.claimNextJobs({ workerId: 'dlq-cleanup-worker', limit: 10 });
  await queue.failJob(enq.job.id, new Error('to dlq'), { retryable: true });

  const before = await queue.listJobs({
    deadLetter: true,
    status: 'dead-letter',
    limit: 100,
  });
  assert.equal(before.jobs.some(j => j.id === enq.job.id), true);

  const retry = await queue.retryJob(enq.job.id);
  assert.equal(retry.ok, true);
  assert.equal(retry.job.status, 'pending');

  const after = await queue.listJobs({
    deadLetter: true,
    status: 'dead-letter',
    limit: 100,
  });
  assert.equal(after.jobs.some(j => j.id === enq.job.id), false);
});
