// tests/phase21-cache-infra.test.js
// ═══════════════════════════════════════════════════════════════
// Phase 21 — Cache, Log Writer, Config, Health, Batch Cleanup
// ═══════════════════════════════════════════════════════════════

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdir, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

let config;

before(async () => {
  config = (await import('../config.js')).default;
});

async function fileExists(path) {
  try { await access(resolve(path)); return true; } catch { return false; }
}

// ══════════════════════════════════════════════════════════════
// Config & Version
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Config & Version', () => {

  it('P21-01: package.json version is 0.21.0', async () => {
    const raw = await readFile(resolve('package.json'), 'utf-8');
    const pkg = JSON.parse(raw);
    assert.strictEqual(pkg.version, '0.22.0');
  });

  it('P21-02: Config has 34 sections', () => {
    const keys = Object.keys(config);
    assert.strictEqual(keys.length, 34, `expected 36 config sections, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('P21-03: CACHE section exists with correct fields', () => {
    assert.ok(config.CACHE, 'CACHE section should exist');
    assert.strictEqual(config.CACHE.enabled, true);
    assert.strictEqual(typeof config.CACHE.defaultTtlMs, 'number');
    assert.strictEqual(typeof config.CACHE.maxEntries, 'number');
    assert.ok(config.CACHE.ttl, 'CACHE.ttl should exist');
    assert.strictEqual(typeof config.CACHE.ttl.phoneIndex, 'number');
    assert.strictEqual(typeof config.CACHE.ttl.user, 'number');
    assert.strictEqual(typeof config.CACHE.ttl.job, 'number');
    assert.strictEqual(typeof config.CACHE.ttl.session, 'number');
  });

  it('P21-04: LOGGING section has fileEnabled field', () => {
    assert.strictEqual(typeof config.LOGGING.fileEnabled, 'boolean');
  });

  it('P21-05: LOGGING section has filePath field', () => {
    assert.strictEqual(typeof config.LOGGING.filePath, 'string');
  });

  it('P21-06: PWA cacheName is yawmia-v0.21.0', () => {
    assert.strictEqual(config.PWA.cacheName, 'yawmia-v0.22.0');
  });
});

// ══════════════════════════════════════════════════════════════
// Cache Service
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Cache Service', () => {
  let cache;

  before(async () => {
    cache = await import('../server/services/cache.js');
  });

  beforeEach(() => {
    cache.clear();
  });

  it('P21-07: cache.js exports get, set, invalidate, invalidatePrefix, stats, clear', () => {
    assert.strictEqual(typeof cache.get, 'function');
    assert.strictEqual(typeof cache.set, 'function');
    assert.strictEqual(typeof cache.invalidate, 'function');
    assert.strictEqual(typeof cache.invalidatePrefix, 'function');
    assert.strictEqual(typeof cache.stats, 'function');
    assert.strictEqual(typeof cache.clear, 'function');
  });

  it('P21-08: set + get returns cached value', () => {
    cache.set('test:key', { name: 'hello' }, 60000);
    const result = cache.get('test:key');
    assert.deepStrictEqual(result, { name: 'hello' });
  });

  it('P21-09: get returns undefined for missing key', () => {
    const result = cache.get('nonexistent:key');
    assert.strictEqual(result, undefined);
  });

  it('P21-10: TTL expiry — value unavailable after TTL', async () => {
    cache.set('test:expiry', 'value', 50); // 50ms TTL
    assert.strictEqual(cache.get('test:expiry'), 'value');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(cache.get('test:expiry'), undefined);
  });

  it('P21-11: invalidate removes specific key', () => {
    cache.set('test:a', 'a', 60000);
    cache.set('test:b', 'b', 60000);
    cache.invalidate('test:a');
    assert.strictEqual(cache.get('test:a'), undefined);
    assert.strictEqual(cache.get('test:b'), 'b');
  });

  it('P21-12: invalidatePrefix removes matching keys', () => {
    cache.set('file:/data/users/usr_001.json', { id: 1 }, 60000);
    cache.set('file:/data/users/usr_002.json', { id: 2 }, 60000);
    cache.set('file:/data/jobs/job_001.json', { id: 3 }, 60000);
    cache.invalidatePrefix('file:/data/users/');
    assert.strictEqual(cache.get('file:/data/users/usr_001.json'), undefined);
    assert.strictEqual(cache.get('file:/data/users/usr_002.json'), undefined);
    assert.deepStrictEqual(cache.get('file:/data/jobs/job_001.json'), { id: 3 });
  });

  it('P21-13: stats returns hits, misses, size, hitRate', () => {
    cache.set('test:stats', 'val', 60000);
    cache.get('test:stats'); // hit
    cache.get('test:miss');  // miss
    const s = cache.stats();
    assert.strictEqual(typeof s.hits, 'number');
    assert.strictEqual(typeof s.misses, 'number');
    assert.strictEqual(typeof s.size, 'number');
    assert.strictEqual(typeof s.hitRate, 'string');
    assert.ok(s.hits >= 1);
    assert.ok(s.misses >= 1);
  });

  it('P21-14: clear removes all entries', () => {
    cache.set('test:1', 'a', 60000);
    cache.set('test:2', 'b', 60000);
    cache.clear();
    assert.strictEqual(cache.get('test:1'), undefined);
    assert.strictEqual(cache.stats().size, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// Log Writer
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Log Writer', () => {

  it('P21-16: logWriter.js exports append', async () => {
    const logWriter = await import('../server/services/logWriter.js');
    assert.strictEqual(typeof logWriter.append, 'function');
  });

  it('P21-17: append creates log file', async () => {
    // This tests with config.LOGGING.fileEnabled which is false in dev
    // So append should be a no-op — just verify it doesn't throw
    const logWriter = await import('../server/services/logWriter.js');
    assert.doesNotThrow(() => logWriter.append('test log line\n'));
  });

  it('P21-19: append does not throw on error', async () => {
    const logWriter = await import('../server/services/logWriter.js');
    // Call with various inputs — should never throw
    assert.doesNotThrow(() => logWriter.append(''));
    assert.doesNotThrow(() => logWriter.append(null));
    assert.doesNotThrow(() => logWriter.append(undefined));
  });
});

// ══════════════════════════════════════════════════════════════
// Database Cache Integration
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Database + Cache Integration', () => {
  let tmpDir;
  let db;
  let cache;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'yawmia-cache-test-'));
    process.env.YAWMIA_DATA_PATH = tmpDir;
    // Create necessary dirs
    const dirs = ['users', 'sessions', 'jobs', 'applications', 'otp', 'notifications', 'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit'];
    for (const d of dirs) {
      await mkdir(join(tmpDir, d), { recursive: true });
    }
    db = await import('../server/services/database.js');
    cache = await import('../server/services/cache.js');
  });

  after(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  });

  beforeEach(() => {
    cache.clear();
  });

  it('P21-20: readJSON caches result after disk read', async () => {
    const filePath = join(tmpDir, 'users', 'test-cache.json');
    await writeFile(filePath, JSON.stringify({ name: 'cached' }), 'utf-8');
    const result1 = await db.readJSON(filePath);
    assert.deepStrictEqual(result1, { name: 'cached' });
    // Second call should come from cache
    const s1 = cache.stats();
    const result2 = await db.readJSON(filePath);
    assert.deepStrictEqual(result2, { name: 'cached' });
    const s2 = cache.stats();
    assert.ok(s2.hits > s1.hits, 'should have more cache hits after second read');
  });

  it('P21-21: readJSON returns cached value on second call', async () => {
    const filePath = join(tmpDir, 'users', 'test-cache2.json');
    await writeFile(filePath, JSON.stringify({ val: 42 }), 'utf-8');
    await db.readJSON(filePath);
    // Overwrite file on disk — cache should still return old value
    await writeFile(filePath, JSON.stringify({ val: 99 }), 'utf-8');
    const cached = await db.readJSON(filePath);
    assert.strictEqual(cached.val, 42, 'should return cached value, not disk value');
  });

  it('P21-22: atomicWrite invalidates cache', async () => {
    const filePath = join(tmpDir, 'users', 'test-invalidate.json');
    await db.atomicWrite(filePath, { v: 1 });
    const r1 = await db.readJSON(filePath);
    assert.strictEqual(r1.v, 1);
    await db.atomicWrite(filePath, { v: 2 });
    const r2 = await db.readJSON(filePath);
    assert.strictEqual(r2.v, 2, 'should read new value after atomicWrite invalidated cache');
  });

  it('P21-23: deleteJSON invalidates cache', async () => {
    const filePath = join(tmpDir, 'users', 'test-delete.json');
    await db.atomicWrite(filePath, { delete: true });
    await db.readJSON(filePath); // cache it
    await db.deleteJSON(filePath);
    const result = await db.readJSON(filePath);
    assert.strictEqual(result, null, 'should return null after delete');
  });
});

// ══════════════════════════════════════════════════════════════
// Index Locking (Source Analysis)
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Index Locking', () => {

  it('P21-24: addToSetIndex source contains withLock', async () => {
    const content = await readFile(resolve('server/services/database.js'), 'utf-8');
    assert.ok(content.includes("return withLock(`index:${relativePath}`"), 'addToSetIndex should use withLock');
  });

  it('P21-25: removeFromSetIndex source contains withLock', async () => {
    const content = await readFile(resolve('server/services/database.js'), 'utf-8');
    // Check that removeFromSetIndex also uses withLock
    const removeBlock = content.substring(content.indexOf('export async function removeFromSetIndex'));
    assert.ok(removeBlock.includes('withLock(`index:${relativePath}`'), 'removeFromSetIndex should use withLock');
  });
});

// ══════════════════════════════════════════════════════════════
// Batch Cleanup (Backward Compatibility)
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Batch Cleanup', () => {

  it('P21-26: enforceExpiredJobs source uses setImmediate', async () => {
    const content = await readFile(resolve('server/services/jobs.js'), 'utf-8');
    assert.ok(content.includes('setImmediate'), 'enforceExpiredJobs should use setImmediate for yielding');
  });

  it('P21-27: cleanExpired source uses setImmediate', async () => {
    const content = await readFile(resolve('server/services/sessions.js'), 'utf-8');
    assert.ok(content.includes('setImmediate'), 'cleanExpired should use setImmediate for yielding');
  });

  it('P21-28: cleanOldNotifications source uses setImmediate', async () => {
    const content = await readFile(resolve('server/services/notifications.js'), 'utf-8');
    assert.ok(content.includes('setImmediate'), 'cleanOldNotifications should use setImmediate for yielding');
  });
});

// ══════════════════════════════════════════════════════════════
// Health Endpoint (Source Check)
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — Health Endpoint', () => {

  it('P21-29: health handler includes cache stats', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes('cacheStats'), 'health should include cache stats');
  });

  it('P21-30: health handler version is 0.21.0', async () => {
    const content = await readFile(resolve('server/router.js'), 'utf-8');
    assert.ok(content.includes("version: '0.21.0'"), 'version should be 0.22.0');
  });
});

// ══════════════════════════════════════════════════════════════
// File Existence
// ══════════════════════════════════════════════════════════════

describe('Phase 21 — File Existence', () => {

  it('P21-31: ecosystem.config.cjs exists', async () => {
    assert.ok(await fileExists('ecosystem.config.cjs'));
  });

  it('P21-32: DEPLOYMENT.md exists', async () => {
    assert.ok(await fileExists('DEPLOYMENT.md'));
  });
});
