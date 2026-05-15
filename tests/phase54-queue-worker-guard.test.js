import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
let db;
let workers;
let locks;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-qwg-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.INSTANCE_MODE = 'single_writer';
  process.env.INSTANCE_ID = 'queue_worker_guard_test';

  db = await import('../server/services/database.js');
  await db.initDatabase();

  locks = await import('../server/services/processLock.js');
  workers = await import('../server/services/queueWorkers.js');
});

beforeEach(async () => {
  await workers.stopQueueWorkers({ drainMs: 0 }).catch(() => {});
  locks._testHelpers.stopAllHeartbeats();

  await locks.forceReleaseLock('queue_worker', 'test').catch(() => {});
  workers._testHelpers.resetQueueWorkerLockState();

  process.env.INSTANCE_MODE = 'single_writer';
  process.env.INSTANCE_ID = 'queue_worker_guard_test';
});

after(async () => {
  await workers.stopQueueWorkers({ drainMs: 0 }).catch(() => {});
  locks._testHelpers.stopAllHeartbeats();
  await rm(dir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
  delete process.env.INSTANCE_MODE;
  delete process.env.INSTANCE_ID;
});

test('queue worker refuses to start in read_only_replica mode', async () => {
  process.env.INSTANCE_MODE = 'read_only_replica';
  process.env.INSTANCE_ID = 'readonly_instance';

  await workers.startQueueWorkers();

  const stats = workers.getWorkerStats();

  assert.equal(stats.started, false);
  assert.equal(stats.instance.canRunQueueWorkers, false);
});

test('queue worker does not start if process lock held by another owner', async () => {
  process.env.INSTANCE_MODE = 'single_writer';
  process.env.INSTANCE_ID = 'owner_a';

  const acquired = await locks.acquireProcessLock('queue_worker', { ownerId: 'owner_b' });
  assert.equal(acquired.ok, true);

  await workers.startQueueWorkers();

  const stats = workers.getWorkerStats();
  assert.equal(stats.started, false);
  assert.equal(stats.lock.held, false);
});

test('queue worker starts with lock and shutdown releases it', async () => {
  process.env.INSTANCE_MODE = 'single_writer';
  process.env.INSTANCE_ID = 'owner_start';

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
});
