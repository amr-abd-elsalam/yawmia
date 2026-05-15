import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup(env = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-qwg-'));
  process.env.YAWMIA_DATA_PATH = dir;

  if (env.INSTANCE_MODE !== undefined) process.env.INSTANCE_MODE = env.INSTANCE_MODE;
  if (env.INSTANCE_ID !== undefined) process.env.INSTANCE_ID = env.INSTANCE_ID;

  const db = await import(`../server/services/database.js?db=${Date.now()}`);
  await db.initDatabase();

  const workers = await import(`../server/services/queueWorkers.js?w=${Date.now()}`);
  const locks = await import(`../server/services/processLock.js?l=${Date.now()}`);

  return { dir, db, workers, locks };
}

async function cleanup(dir, workers, locks) {
  try { await workers.stopQueueWorkers({ drainMs: 0 }); } catch (_) {}
  try { locks._testHelpers.stopAllHeartbeats(); } catch (_) {}
  await rm(dir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
  delete process.env.INSTANCE_MODE;
  delete process.env.INSTANCE_ID;
}

test('queue worker refuses to start in read_only_replica mode', async () => {
  const { dir, workers, locks } = await setup({
    INSTANCE_MODE: 'read_only_replica',
    INSTANCE_ID: 'readonly_instance',
  });

  try {
    await workers.startQueueWorkers();
    const stats = workers.getWorkerStats();

    assert.equal(stats.started, false);
    assert.equal(stats.instance.canRunQueueWorkers, false);
  } finally {
    await cleanup(dir, workers, locks);
  }
});

test('queue worker does not start if process lock held by another owner', async () => {
  const { dir, workers, locks } = await setup({
    INSTANCE_MODE: 'single_writer',
    INSTANCE_ID: 'owner_a',
  });

  try {
    const acquired = await locks.acquireProcessLock('queue_worker', { ownerId: 'owner_b' });
    assert.equal(acquired.ok, true);

    await workers.startQueueWorkers();

    const stats = workers.getWorkerStats();
    assert.equal(stats.started, false);
    assert.equal(stats.lock.held, false);
  } finally {
    await cleanup(dir, workers, locks);
  }
});

test('queue worker starts with lock and shutdown releases it', async () => {
  const { dir, workers, locks } = await setup({
    INSTANCE_MODE: 'single_writer',
    INSTANCE_ID: 'owner_start',
  });

  try {
    await workers.startQueueWorkers();

    let stats = workers.getWorkerStats();
    assert.equal(stats.started, true);
    assert.equal(stats.lock.held, true);
    assert.equal(stats.lock.ownerId, 'owner_start');

    await workers.stopQueueWorkers({ drainMs: 0 });

    stats = workers.getWorkerStats();
    assert.equal(stats.started, false);

    const lock = await locks.getProcessLock('queue_worker');
    assert.equal(lock, null);
  } finally {
    await cleanup(dir, workers, locks);
  }
});
