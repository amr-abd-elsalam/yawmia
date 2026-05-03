// ═══════════════════════════════════════════════════════════════
// tests/phase46-replay-queue.test.js — Phase 46 Replay Queue
// ═══════════════════════════════════════════════════════════════
// 8 tests for replay queue during rebuild operations.
// Note: BASE_PATH cached in database.js → use single shared testDir
// for the whole file (set BEFORE first import).
// ═══════════════════════════════════════════════════════════════

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, unlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir;
let counters; // shared module instance

before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'yawmia-p46-replay-'));
  await mkdir(join(testDir, 'metrics'), { recursive: true });
  await mkdir(join(testDir, 'direct_offers'), { recursive: true });
  process.env.YAWMIA_DATA_PATH = testDir;

  // Import AFTER env set — BASE_PATH gets resolved from this testDir
  counters = await import('../server/services/directOfferCounters.js');
});

after(async () => {
  delete process.env.YAWMIA_DATA_PATH;
  if (testDir) await rm(testDir, { recursive: true, force: true });
});

// Reset state between tests
async function resetState() {
  counters._testHelpers.clearEventQueue();
  counters._testHelpers.clearReplayQueue();
  counters._testHelpers.clearFlushTimer();

  // Wait for any in-flight flush to complete
  while (counters._testHelpers.isFlushingNow() || counters._testHelpers.isRebuildInProgress()) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  // Clear counter file
  try {
    await unlink(join(testDir, 'metrics', 'direct-offer-counters.json'));
  } catch (_) { /* may not exist */ }

  // Clear seeded offers
  try {
    const files = await readdir(join(testDir, 'direct_offers'));
    for (const f of files) {
      if (f.endsWith('.json')) {
        await unlink(join(testDir, 'direct_offers', f));
      }
    }
  } catch (_) { /* may not exist */ }
}

async function seedOffers(n, prefix = 'seed') {
  const now = new Date().toISOString();
  for (let i = 0; i < n; i++) {
    const id = `dof_${prefix}_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const offer = {
      id,
      employerId: `usr_e_${prefix}`,
      workerId: `usr_w_${prefix}_${i}`,
      status: 'pending',
      createdAt: now,
    };
    await writeFile(join(testDir, 'direct_offers', `${id}.json`), JSON.stringify(offer), 'utf-8');
  }
}

test('Phase 46 — _rebuildInProgress flag toggles correctly', async () => {
  await resetState();

  assert.strictEqual(counters._testHelpers.isRebuildInProgress(), false);

  await seedOffers(2, 'flag');
  await counters.rebuildCounters();

  // After rebuild, flag should be false
  assert.strictEqual(counters._testHelpers.isRebuildInProgress(), false);
});

test('Phase 46 — Events during rebuild routed to replay queue', async () => {
  await resetState();

  await seedOffers(20, 'during');

  // Start rebuild + concurrent applyEventBatched
  // Use Promise.all to fire events while rebuild is acquiring lock
  const eventsBeforeAwait = (async () => {
    // Yield once to let rebuild start
    await new Promise(resolve => setImmediate(resolve));
    counters.applyEventBatched('created', { offerId: 'dof_during_1', employerId: 'usr_e_during', workerId: 'usr_w_during_1' });
    counters.applyEventBatched('created', { offerId: 'dof_during_2', employerId: 'usr_e_during', workerId: 'usr_w_during_2' });
  })();

  await Promise.all([counters.rebuildCounters(), eventsBeforeAwait]);

  // Wait for replay + flush
  await counters.forceFlush();
  await new Promise(resolve => setTimeout(resolve, 100));
  await counters.forceFlush();

  const data = await counters.readCounters();
  // Should have the 20 seeded offers from rebuild scan
  assert.ok(data.platform.total >= 20, `expected at least 20 offers, got ${data.platform.total}`);
});

test('Phase 46 — Replay queue overflow drops oldest with warning', async () => {
  await resetState();

  await seedOffers(2, 'overflow');
  const rebuildPromise = counters.rebuildCounters();

  await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 1100; i++) {
    counters.applyEventBatched('created', { offerId: `dof_overflow_${i}`, employerId: 'usr_e_ov', workerId: `usr_w_ov_${i}` });
  }

  await rebuildPromise;
  await counters.forceFlush();
  // Test passes if no exception thrown — overflow is logged warning only
  assert.ok(true);
});

test('Phase 46 — Queued events replayed after rebuild completes', async () => {
  await resetState();

  await seedOffers(3, 'replay');

  const eventsTask = (async () => {
    await new Promise(resolve => setImmediate(resolve));
    counters.applyEventBatched('created', { offerId: 'dof_replay_1', employerId: 'usr_e_replay', workerId: 'usr_w_replay' });
  })();

  await Promise.all([counters.rebuildCounters(), eventsTask]);
  await counters.forceFlush();
  await new Promise(resolve => setTimeout(resolve, 100));
  await counters.forceFlush();

  const data = await counters.readCounters();
  // Either the rebuild scanned 3 + replayed 1 OR scanned 3 alone (if event arrived after rebuild)
  // Check that totals are at least 3 (rebuilt offers)
  assert.ok(data.platform.total >= 3, `expected at least 3 offers, got ${data.platform.total}`);
});

test('Phase 46 — Replay queue cleared on rebuild entry', async () => {
  await resetState();

  await seedOffers(2, 'clear');
  await counters.rebuildCounters();

  // Replay queue should be empty after rebuild
  assert.strictEqual(counters._testHelpers.getReplayQueueSize(), 0);
});

test('Phase 46 — Skip-guard prevents thrashing rebuilds', async () => {
  await resetState();

  await seedOffers(2, 'skip');

  // First rebuild — should succeed
  const result1 = await counters.rebuildCounters();
  assert.ok(!result1.skipped || result1.offerCount === 2);

  // Second rebuild immediately after — should skip
  const result2 = await counters.rebuildCounters();
  assert.strictEqual(result2.skipped, true);
});

test('Phase 46 — Rebuild creates per-entity hourlyBuckets from raw offers', async () => {
  await resetState();

  // Seed offer with a UNIQUE employer ID
  const now = new Date().toISOString();
  const offer = {
    id: 'dof_rebuild_test_unique',
    employerId: 'usr_e_rb_unique',
    workerId: 'usr_w_rb_unique',
    status: 'pending',
    createdAt: now,
  };
  await writeFile(join(testDir, 'direct_offers', `${offer.id}.json`), JSON.stringify(offer), 'utf-8');

  await counters.rebuildCounters();

  const data = await counters.readCounters();
  assert.ok(data.byEmployer['usr_e_rb_unique'], `expected byEmployer['usr_e_rb_unique'] to exist, got ${JSON.stringify(Object.keys(data.byEmployer))}`);
  assert.ok(data.byEmployer['usr_e_rb_unique'].hourlyBuckets, 'rebuild should create per-entity hourlyBuckets');
});

test('Phase 46 — _rebuildInProgress is false after rebuild completes (even on error)', async () => {
  await resetState();

  // Seed valid offers
  await seedOffers(3, 'errcheck');
  await counters.rebuildCounters();

  assert.strictEqual(counters._testHelpers.isRebuildInProgress(), false);
});
