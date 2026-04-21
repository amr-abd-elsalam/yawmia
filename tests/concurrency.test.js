// tests/concurrency.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 21 — Concurrency Tests: Parallel operations, index locking
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmpDir;
let db;

before(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-concurrency-test-'));
  process.env.YAWMIA_DATA_PATH = tmpDir;
  const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit'];
  for (const d of dirs) {
    await mkdir(join(tmpDir, d), { recursive: true });
  }
  db = await import('../server/services/database.js');
  await db.initDatabase();
});

after(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  delete process.env.YAWMIA_DATA_PATH;
});

// ══════════════════════════════════════════════════════════════
// Index Locking Under Concurrency
// ══════════════════════════════════════════════════════════════

describe('Concurrency — Index Locking', () => {

  it('C-01: 10 parallel addToSetIndex on same index — 0 lost entries', async () => {
    const indexPath = 'applications/worker-index.json';
    const promises = [];
    for (let i = 0; i < 10; i++) {
      promises.push(db.addToSetIndex(indexPath, 'worker_test', `app_concurrent_${i}`));
    }
    await Promise.all(promises);
    const result = await db.getFromSetIndex(indexPath, 'worker_test');
    assert.strictEqual(result.length, 10, `Expected 10 entries, got ${result.length}`);
  });

  it('C-02: 5 parallel addToSetIndex on different keys — all entries present', async () => {
    const indexPath = 'applications/job-index.json';
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(db.addToSetIndex(indexPath, `job_parallel_${i}`, `app_parallel_${i}`));
    }
    await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      const result = await db.getFromSetIndex(indexPath, `job_parallel_${i}`);
      assert.ok(result.includes(`app_parallel_${i}`));
    }
  });

  it('C-03: addToSetIndex deduplication under concurrency', async () => {
    const indexPath = 'notifications/user-index.json';
    const promises = [];
    // Try to add same ID 5 times concurrently
    for (let i = 0; i < 5; i++) {
      promises.push(db.addToSetIndex(indexPath, 'user_dedup', 'ntf_same_id'));
    }
    await Promise.all(promises);
    const result = await db.getFromSetIndex(indexPath, 'user_dedup');
    assert.strictEqual(result.length, 1, 'Should have exactly 1 entry (no duplicates)');
  });
});

// ══════════════════════════════════════════════════════════════
// withLock Behavior
// ══════════════════════════════════════════════════════════════

describe('Concurrency — withLock', () => {

  it('C-07: withLock same key — serialized execution', async () => {
    const { withLock } = await import('../server/services/resourceLock.js');
    const order = [];
    const p1 = withLock('serial:test', async () => {
      order.push('start-1');
      await new Promise(r => setTimeout(r, 50));
      order.push('end-1');
    });
    const p2 = withLock('serial:test', async () => {
      order.push('start-2');
      order.push('end-2');
    });
    await Promise.all([p1, p2]);
    // p2 should not start until p1 ends
    assert.strictEqual(order.indexOf('start-2') > order.indexOf('end-1'), true, 'p2 should start after p1 ends');
  });

  it('C-08: withLock different keys — parallel execution', async () => {
    const { withLock } = await import('../server/services/resourceLock.js');
    const startTimes = {};
    const p1 = withLock('parallel:a', async () => {
      startTimes.a = Date.now();
      await new Promise(r => setTimeout(r, 50));
    });
    const p2 = withLock('parallel:b', async () => {
      startTimes.b = Date.now();
      await new Promise(r => setTimeout(r, 50));
    });
    await Promise.all([p1, p2]);
    const diff = Math.abs(startTimes.a - startTimes.b);
    assert.ok(diff < 30, `Different keys should run in parallel (diff: ${diff}ms)`);
  });

  it('C-13: getLockCount reflects active locks', async () => {
    const { withLock, getLockCount } = await import('../server/services/resourceLock.js');
    let lockCountDuring = 0;
    const p = withLock('count:test', async () => {
      lockCountDuring = getLockCount();
      await new Promise(r => setTimeout(r, 20));
    });
    await p;
    assert.ok(lockCountDuring >= 1, 'Should have at least 1 active lock during execution');
  });
});

// ══════════════════════════════════════════════════════════════
// Parallel File Operations
// ══════════════════════════════════════════════════════════════

describe('Concurrency — Parallel File Operations', () => {

  it('C-05: parallel readJSON — all return correct data', async () => {
    // Write 5 files
    for (let i = 0; i < 5; i++) {
      await db.atomicWrite(join(tmpDir, `jobs/conc_job_${i}.json`), { id: `job_${i}`, value: i });
    }
    // Read all 5 in parallel
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(db.readJSON(join(tmpDir, `jobs/conc_job_${i}.json`)));
    }
    const results = await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      assert.deepStrictEqual(results[i], { id: `job_${i}`, value: i });
    }
  });

  it('C-06: parallel atomicWrite — all files written correctly', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(db.atomicWrite(join(tmpDir, `jobs/parallel_write_${i}.json`), { id: i }));
    }
    await Promise.all(promises);
    for (let i = 0; i < 5; i++) {
      const data = await db.readJSON(join(tmpDir, `jobs/parallel_write_${i}.json`));
      assert.deepStrictEqual(data, { id: i });
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Cache Under Concurrency
// ══════════════════════════════════════════════════════════════

describe('Concurrency — Cache', () => {

  it('C-09: cache under concurrent reads — no corruption', async () => {
    const cache = await import('../server/services/cache.js');
    cache.clear();
    cache.set('conc:test', { stable: true }, 60000);
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(Promise.resolve(cache.get('conc:test')));
    }
    const results = await Promise.all(promises);
    for (const r of results) {
      assert.deepStrictEqual(r, { stable: true });
    }
  });

  it('C-10: cache after write — no stale data', async () => {
    const cache = await import('../server/services/cache.js');
    cache.clear();
    const filePath = join(tmpDir, 'jobs/cache_conc.json');
    await db.atomicWrite(filePath, { v: 1 });
    await db.readJSON(filePath); // cache v:1
    await db.atomicWrite(filePath, { v: 2 }); // invalidates cache
    const result = await db.readJSON(filePath); // should read v:2 from disk
    assert.strictEqual(result.v, 2);
  });
});
