import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-lock-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?db=${Date.now()}`);
  await db.initDatabase();

  const locks = await import(`../server/services/processLock.js?lock=${Date.now()}`);

  return { dir, db, locks };
}

test('process lock acquire, renew, reject, stale recover, release', async () => {
  const { dir, locks } = await setup();

  try {
    const a1 = await locks.acquireProcessLock('queue_worker_test', { ownerId: 'owner_a' });
    assert.equal(a1.ok, true);
    assert.equal(a1.lock.ownerId, 'owner_a');

    const a2 = await locks.acquireProcessLock('queue_worker_test', { ownerId: 'owner_a' });
    assert.equal(a2.ok, true);
    assert.equal(a2.lock.ownerId, 'owner_a');

    const b1 = await locks.acquireProcessLock('queue_worker_test', { ownerId: 'owner_b' });
    assert.equal(b1.ok, false);
    assert.equal(b1.code, 'LOCK_HELD');

    const lock = await locks.getProcessLock('queue_worker_test');
    lock.heartbeatAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    lock.expiresAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { atomicWrite, getRecordPath } = await import(`../server/services/database.js?db2=${Date.now()}`);
    await atomicWrite(getRecordPath('ops_locks', 'queue_worker_test'), lock);

    const b2 = await locks.acquireProcessLock('queue_worker_test', { ownerId: 'owner_b' });
    assert.equal(b2.ok, true);
    assert.equal(b2.recovered, true);
    assert.equal(b2.lock.ownerId, 'owner_b');

    const releaseWrong = await locks.releaseProcessLock('queue_worker_test', 'owner_a');
    assert.equal(releaseWrong.ok, false);
    assert.equal(releaseWrong.code, 'LOCK_NOT_OWNER');

    const releaseRight = await locks.releaseProcessLock('queue_worker_test', 'owner_b');
    assert.equal(releaseRight.ok, true);
    assert.equal(releaseRight.released, true);
  } finally {
    locks._testHelpers.stopAllHeartbeats();
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});

test('process lock heartbeat updates lock and is clearable', async () => {
  const { dir, locks } = await setup();

  try {
    const r = await locks.acquireProcessLock('heartbeat_test', { ownerId: 'owner_h' });
    assert.equal(r.ok, true);

    locks.startLockHeartbeat('heartbeat_test', 'owner_h', { heartbeatMs: 20 });
    assert.equal(locks._testHelpers.heartbeatTimers.has('heartbeat_test'), true);

    await new Promise(resolve => setTimeout(resolve, 60));

    const fresh = await locks.getProcessLock('heartbeat_test');
    assert.equal(fresh.ownerId, 'owner_h');

    locks.stopLockHeartbeat('heartbeat_test');
    assert.equal(locks._testHelpers.heartbeatTimers.has('heartbeat_test'), false);
  } finally {
    locks._testHelpers.stopAllHeartbeats();
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
