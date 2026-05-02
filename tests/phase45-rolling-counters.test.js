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

const { initDatabase, atomicWrite, getRecordPath, getCollectionPath } = await import('../server/services/database.js');
const directOfferCounters = await import('../server/services/directOfferCounters.js');
const config = (await import('../config.js')).default;

await initDatabase();

function freshFilePath() {
  return directOfferCounters._testHelpers.getCounterFilePath();
}

async function clearCounterFile() {
  try {
    await rm(freshFilePath());
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
  // Manually create raw offer files
  const offersDir = getCollectionPath('direct_offers');
  await mkdir(offersDir, { recursive: true });
  const now = new Date().toISOString();

  const offer1 = {
    id: 'dof_rb1', employerId: 'emp_x', workerId: 'wrk_x',
    status: 'accepted', createdAt: now, acceptedAt: now,
  };
  const offer2 = {
    id: 'dof_rb2', employerId: 'emp_x', workerId: 'wrk_y',
    status: 'declined', createdAt: now, declinedAt: now, declinedReason: 'busy',
  };

  await atomicWrite(getRecordPath('direct_offers', 'dof_rb1'), offer1);
  await atomicWrite(getRecordPath('direct_offers', 'dof_rb2'), offer2);

  // Rebuild
  const result = await directOfferCounters.rebuildCounters();
  // Note: rebuild may be skipped if recent rebuild — ensure clean state first
  if (result.skipped) {
    // Force a stale rebuild by manipulating lastRebuildAt
    const c = await directOfferCounters.readCounters();
    c.lastRebuildAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await atomicWrite(freshFilePath(), c);
    await directOfferCounters.rebuildCounters();
  }

  const counters = await directOfferCounters.readCounters();
  assert.equal(counters.platform.total, 2);
  assert.equal(counters.platform.accepted, 1);
  assert.equal(counters.platform.declined, 1);
  assert.equal(counters.platform.declineReasons['busy'], 1);
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
    offerId: 'v1', employerId: 'e1', workerId: 'w1', viewMs: 12000,
  });
  const c = await directOfferCounters.readCounters();
  assert.equal(c.aging.totalTimeToFirstViewMs, 12000);
  assert.equal(c.aging.viewCount, 1);
});

test('Phase 45 — getAgingStats returns avg + p50 + p95', async () => {
  await clearCounterFile();
  // Generate 10 decisions with varying response times
  for (let i = 0; i < 10; i++) {
    await directOfferCounters.applyEvent('created', { offerId: `agi${i}`, employerId: 'e1', workerId: `w${i}` });
    await directOfferCounters.applyEvent('accepted', {
      offerId: `agi${i}`, employerId: 'e1', workerId: `w${i}`,
      responseMs: (i + 1) * 1000, // 1s, 2s, ..., 10s
    });
  }
  const stats = await directOfferCounters.getAgingStats();
  assert.equal(stats.avgTimeToDecisionSec, 6); // avg of 1..10 = 5.5 → rounded to 6
  assert.ok(stats.p50DecisionSec >= 5 && stats.p50DecisionSec <= 6);
  assert.ok(stats.p95DecisionSec >= 9);
});

// Cleanup
test('Phase 45 — cleanup test data', async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});
