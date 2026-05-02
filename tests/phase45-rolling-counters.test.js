// ═══════════════════════════════════════════════════════════════
// tests/phase45-rolling-counters.test.js — Phase 45 Counter File Tests
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';

// Set up isolated test data directory
const TEST_DATA_DIR = `/tmp/yawmia-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
process.env.YAWMIA_DATA_PATH = TEST_DATA_DIR;

const { initDatabase, atomicWrite, deleteJSON, getRecordPath, getCollectionPath } = await import('../server/services/database.js');
const cacheModule = await import('../server/services/cache.js');
const directOfferCounters = await import('../server/services/directOfferCounters.js');
const config = (await import('../config.js')).default;

await initDatabase();

function freshFilePath() {
  return directOfferCounters._testHelpers.getCounterFilePath();
}

/**
 * Clear counter file properly:
 * 1. Delete via deleteJSON (invalidates per-file cache)
 * 2. Clear ALL in-memory caches (database file cache + any module caches)
 * This ensures full test isolation — no stale counter data leaks between tests.
 */
async function clearCounterFile() {
  try {
    await deleteJSON(freshFilePath());
  } catch (_) { /* ignore */ }
  // Belt-and-suspenders: clear the entire database cache to remove any stale
  // entries from previous tests (counters file, employer/worker lookups, etc.)
  try {
    cacheModule.clear();
  } catch (_) { /* ignore */ }
}

test('Phase 45 — readCounters returns empty structure on missing file', async () => {
  await clearCounterFile();
  const c = await directOfferCounters.readCounters();
  assert.equal(c.platform.total, 0);
  assert.equal(c.platform.pending, 0);
  assert.equal(c.platform.accepted, 0);
  assert.equal(c.aging.viewCount, 0);
  assert.deepEqual(c.byEmployer, {});
  assert.deepEqual(c.byWorker, {});
});

test('Phase 45 — applyEvent("created") increments platform.total + employer + worker', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('created', {
    offerId: 'dof_test1',
    employerId: 'usr_emp1',
    workerId: 'usr_wrk1',
  });
  const c = await directOfferCounters.readCounters();
  assert.equal(c.platform.total, 1);
  assert.equal(c.platform.pending, 1);
  assert.equal(c.byEmployer['usr_emp1'].total, 1);
  assert.equal(c.byWorker['usr_wrk1'].total, 1);
});

test('Phase 45 — applyEvent("accepted") with responseMs updates totals', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('created', {
    offerId: 'dof_test2', employerId: 'usr_emp1', workerId: 'usr_wrk1',
  });
  await directOfferCounters.applyEvent('accepted', {
    offerId: 'dof_test2', employerId: 'usr_emp1', workerId: 'usr_wrk1', responseMs: 30000,
  });
  const c = await directOfferCounters.readCounters();
  assert.equal(c.platform.accepted, 1);
  assert.equal(c.platform.pending, 0);
  assert.equal(c.platform.totalResponseMs, 30000);
  assert.equal(c.platform.responseCount, 1);
  assert.equal(c.byEmployer['usr_emp1'].accepted, 1);
  assert.equal(c.byEmployer['usr_emp1'].totalResponseMs, 30000);
  assert.equal(c.aging.decisionCount, 1);
  assert.equal(c.aging.decisionTimes.length, 1);
});

test('Phase 45 — applyEvent("declined") with reason increments declineReasons', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('created', {
    offerId: 'dof_test3', employerId: 'usr_emp1', workerId: 'usr_wrk1',
  });
  await directOfferCounters.applyEvent('declined', {
    offerId: 'dof_test3', employerId: 'usr_emp1', workerId: 'usr_wrk1',
    declinedReason: 'wage_low', responseMs: 15000,
  });
  const c = await directOfferCounters.readCounters();
  assert.equal(c.platform.declined, 1);
  assert.equal(c.platform.declineReasons['wage_low'], 1);
});

test('Phase 45 — applyEvent serializes via withLock (no race condition)', async () => {
  await clearCounterFile();
  // 50 parallel applyEvent calls
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(directOfferCounters.applyEvent('created', {
      offerId: `dof_par${i}`, employerId: 'usr_emp1', workerId: 'usr_wrk1',
    }));
  }
  await Promise.all(promises);
  const c = await directOfferCounters.readCounters();
  assert.equal(c.platform.total, 50, 'Expected 50 total after 50 parallel applies');
  assert.equal(c.byEmployer['usr_emp1'].total, 50);
});

test('Phase 45 — getPlatformFunnel returns correct rates', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('created', { offerId: 'd1', employerId: 'e1', workerId: 'w1' });
  await directOfferCounters.applyEvent('created', { offerId: 'd2', employerId: 'e1', workerId: 'w2' });
  await directOfferCounters.applyEvent('created', { offerId: 'd3', employerId: 'e1', workerId: 'w3' });
  await directOfferCounters.applyEvent('accepted', { offerId: 'd1', employerId: 'e1', workerId: 'w1', responseMs: 1000 });
  await directOfferCounters.applyEvent('declined', { offerId: 'd2', employerId: 'e1', workerId: 'w2', declinedReason: 'busy' });

  const funnel = await directOfferCounters.getPlatformFunnel();
  assert.equal(funnel.sent, 3);
  assert.equal(funnel.pending, 1);
  assert.equal(funnel.accepted, 1);
  assert.equal(funnel.declined, 1);
  assert.equal(funnel.acceptRate, 50); // 1/(1+1) * 100
});

test('Phase 45 — getTopEmployers respects minOffers threshold', async () => {
  await clearCounterFile();
  // Employer1: 3 offers, Employer2: 1 offer
  await directOfferCounters.applyEvent('created', { offerId: 'a1', employerId: 'emp_a', workerId: 'w1' });
  await directOfferCounters.applyEvent('created', { offerId: 'a2', employerId: 'emp_a', workerId: 'w2' });
  await directOfferCounters.applyEvent('created', { offerId: 'a3', employerId: 'emp_a', workerId: 'w3' });
  await directOfferCounters.applyEvent('created', { offerId: 'b1', employerId: 'emp_b', workerId: 'w4' });

  const top = await directOfferCounters.getTopEmployers({ minOffers: 3 });
  assert.equal(top.length, 1);
  assert.equal(top[0].employerId, 'emp_a');

  const topLow = await directOfferCounters.getTopEmployers({ minOffers: 1 });
  assert.equal(topLow.length, 2);
});

test('Phase 45 — rebuildCounters from raw offers produces correct counts', async () => {
  await clearCounterFile();

  // Clean any leftover raw offers from previous tests (rebuildCounters scans ALL offers)
  // We can't easily delete raw offers (no helper for bulk delete), so use unique IDs
  // and ensure our rebuild reads only what we expect by making counts test relative.
  // Manually create raw offer files
  const offersDir = getCollectionPath('direct_offers');
  await mkdir(offersDir, { recursive: true });
  const now = new Date().toISOString();

  const offer1 = {
    id: 'dof_rb1_unique', employerId: 'emp_rb_unique', workerId: 'wrk_rb_x',
    status: 'accepted', createdAt: now, acceptedAt: now,
  };
  const offer2 = {
    id: 'dof_rb2_unique', employerId: 'emp_rb_unique', workerId: 'wrk_rb_y',
    status: 'declined', createdAt: now, declinedAt: now, declinedReason: 'busy_rb_test',
  };

  await atomicWrite(getRecordPath('direct_offers', 'dof_rb1_unique'), offer1);
  await atomicWrite(getRecordPath('direct_offers', 'dof_rb2_unique'), offer2);

  // Force a stale rebuild by clearing counter file first (clearCounterFile already did this)
  // Then rebuild — should pass minRebuildIntervalMs check (no prior rebuild)
  let result = await directOfferCounters.rebuildCounters();
  if (result.skipped) {
    // Force rebuild by setting lastRebuildAt to 25h ago
    const c = await directOfferCounters.readCounters();
    c.lastRebuildAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await atomicWrite(freshFilePath(), c);
    cacheModule.clear();
    result = await directOfferCounters.rebuildCounters();
  }

  const counters = await directOfferCounters.readCounters();
  // Rebuild scans ALL offers in collection — may include offers from previous tests
  // Verify our specific offers are reflected (relative assertions)
  assert.ok(counters.platform.total >= 2, `Expected at least 2 offers, got ${counters.platform.total}`);
  assert.ok(counters.platform.accepted >= 1);
  assert.ok(counters.platform.declined >= 1);
  assert.equal(counters.platform.declineReasons['busy_rb_test'], 1);
  // Verify per-employer aggregation captured our test employer
  assert.ok(counters.byEmployer['emp_rb_unique']);
  assert.equal(counters.byEmployer['emp_rb_unique'].total, 2);
  assert.equal(counters.byEmployer['emp_rb_unique'].accepted, 1);
  assert.equal(counters.byEmployer['emp_rb_unique'].declined, 1);
});

test('Phase 45 — hourlyBuckets accumulate correctly', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('created', { offerId: 'h1', employerId: 'e1', workerId: 'w1' });
  await directOfferCounters.applyEvent('created', { offerId: 'h2', employerId: 'e1', workerId: 'w2' });
  await directOfferCounters.applyEvent('accepted', { offerId: 'h1', employerId: 'e1', workerId: 'w1', responseMs: 5000 });

  const c = await directOfferCounters.readCounters();
  const hourKey = directOfferCounters._testHelpers.getHourKey(new Date());
  assert.ok(c.hourlyBuckets[hourKey], 'Hourly bucket should exist for current hour');
  assert.equal(c.hourlyBuckets[hourKey].created, 2);
  assert.equal(c.hourlyBuckets[hourKey].accepted, 1);
});

test('Phase 45 — atomicWrite preserves integrity (file readable after write)', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('created', { offerId: 'i1', employerId: 'e1', workerId: 'w1' });
  // Read raw file directly
  const raw = await readFile(freshFilePath(), 'utf-8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.platform.total, 1);
  assert.ok(parsed.lastUpdatedAt);
});

test('Phase 45 — applyEvent("viewed") updates aging.totalTimeToFirstViewMs', async () => {
  await clearCounterFile();
  await directOfferCounters.applyEvent('viewed', {
    offerId: 'v_unique_1', employerId: 'e_view', workerId: 'w_view', viewMs: 12000,
  });
  const c = await directOfferCounters.readCounters();
  assert.equal(c.aging.totalTimeToFirstViewMs, 12000);
  assert.equal(c.aging.viewCount, 1);
});

test('Phase 45 — getAgingStats returns avg + p50 + p95', async () => {
  await clearCounterFile();
  // Generate 10 decisions with varying response times
  for (let i = 0; i < 10; i++) {
    await directOfferCounters.applyEvent('created', { offerId: `agi_unique_${i}`, employerId: 'e_aging', workerId: `w_aging_${i}` });
    await directOfferCounters.applyEvent('accepted', {
      offerId: `agi_unique_${i}`, employerId: 'e_aging', workerId: `w_aging_${i}`,
      responseMs: (i + 1) * 1000, // 1s, 2s, ..., 10s
    });
  }
  const stats = await directOfferCounters.getAgingStats();
  // avg of 1..10 = 5.5 → rounded to 6 (allow tolerance for accumulated decision times)
  assert.ok(stats.avgTimeToDecisionSec >= 5 && stats.avgTimeToDecisionSec <= 7,
    `Expected avg ~6s, got ${stats.avgTimeToDecisionSec}`);
  assert.ok(stats.p50DecisionSec >= 1, `p50 should be > 0, got ${stats.p50DecisionSec}`);
  assert.ok(stats.p95DecisionSec >= 5, `p95 should be reasonable, got ${stats.p95DecisionSec}`);
});

// Cleanup
test('Phase 45 — cleanup test data', async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});
