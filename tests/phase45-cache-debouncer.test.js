// ═══════════════════════════════════════════════════════════════
// tests/phase45-cache-debouncer.test.js — Phase 45 Cache Debouncer Tests
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const TEST_DATA_DIR = `/tmp/yawmia-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
process.env.YAWMIA_DATA_PATH = TEST_DATA_DIR;

const { initDatabase } = await import('../server/services/database.js');
const cacheDebouncer = await import('../server/services/cacheDebouncer.js');

await initDatabase();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('Phase 45 — debouncedClear delays execution by debounceMs', async () => {
  let callCount = 0;
  const fn = () => { callCount++; };

  const start = Date.now();
  cacheDebouncer.debouncedClear('key_delay', fn);

  // Should NOT have fired immediately
  assert.equal(callCount, 0);

  // Wait for debounce to fire (10s default — but for tests we'll use shorter)
  // Note: actual config is 10s, but we'll wait up to 12s and verify it fired
  await delay(11000);
  assert.equal(callCount, 1, 'fn should have fired exactly once');
});

test('Phase 45 — Multiple calls within debounce window → only 1 execution', async () => {
  let callCount = 0;
  const fn = () => { callCount++; };

  for (let i = 0; i < 10; i++) {
    cacheDebouncer.debouncedClear('key_multi', fn);
  }

  // Wait for debounce + min interval
  await delay(11000);
  assert.equal(callCount, 1, 'Multiple calls should coalesce to 1 execution');
});

test('Phase 45 — Different keys debounced independently', async () => {
  let countA = 0, countB = 0;
  const fnA = () => { countA++; };
  const fnB = () => { countB++; };

  cacheDebouncer.debouncedClear('keyA_indep', fnA);
  cacheDebouncer.debouncedClear('keyB_indep', fnB);

  await delay(11000);
  assert.equal(countA, 1);
  assert.equal(countB, 1);
});

test('Phase 45 — clearFn errors do not break debouncer', async () => {
  let callCount = 0;
  const fn = () => {
    callCount++;
    throw new Error('intentional test error');
  };

  cacheDebouncer.debouncedClear('key_err', fn);
  await delay(11000);
  assert.equal(callCount, 1, 'fn should be called once even if it throws');

  // Subsequent calls should still work
  cacheDebouncer.debouncedClear('key_err', fn);
  await delay(11000);
  assert.equal(callCount, 2);
});

test('Phase 45 — flushPending forces immediate execution', async () => {
  let callCount = 0;
  const fn = () => { callCount++; };

  cacheDebouncer.debouncedClear('key_flush', fn);

  // Should not have fired yet
  assert.equal(callCount, 0);

  cacheDebouncer.flushPending();

  // After flushPending, fn should have been called immediately
  assert.equal(callCount, 1);
});

test('Phase 45 — Coalesce maintains latest clearFn (idempotent)', async () => {
  let calls = [];
  const fnA = () => { calls.push('A'); };
  const fnB = () => { calls.push('B'); };

  cacheDebouncer.debouncedClear('key_coalesce', fnA);
  cacheDebouncer.debouncedClear('key_coalesce', fnB); // should override

  await delay(11000);
  assert.equal(calls.length, 1);
  // Latest fn (B) should be the one executed
  assert.equal(calls[0], 'B');
});

test('Phase 45 — Cleanup removes stale entries', async () => {
  let callCount = 0;
  const fn = () => { callCount++; };

  cacheDebouncer.debouncedClear('key_stale', fn);
  await delay(11000); // let it fire

  const { pendingClears, cleanup, STALE_ENTRY_AGE_MS } = cacheDebouncer._testHelpers;
  // Should still have entry (recently cleared)
  assert.ok(pendingClears.has('key_stale'));

  // Manually mutate lastClearedAt to past
  const entry = pendingClears.get('key_stale');
  entry.lastClearedAt = Date.now() - STALE_ENTRY_AGE_MS - 1000; // older than threshold

  cleanup();
  assert.equal(pendingClears.has('key_stale'), false);
});

test('Phase 45 — Concurrent debouncedClear from different events serialized', async () => {
  let callCount = 0;
  const fn = () => { callCount++; };

  // Fire 100 debouncedClear calls in tight loop
  for (let i = 0; i < 100; i++) {
    cacheDebouncer.debouncedClear('key_concurrent', fn);
  }

  await delay(11000);
  // Should still only fire once due to coalescing
  assert.equal(callCount, 1);
});
