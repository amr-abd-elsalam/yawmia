// ═══════════════════════════════════════════════════════════════
// tests/phase44-admin-direct-offers.test.js — Platform-Wide Analytics
// ═══════════════════════════════════════════════════════════════
// Tests for directOfferAnalytics.js (Phase 44).
// Covers: getPlatformOfferFunnel, getTopEmployersByAcceptance,
//         getTopWorkersByAcceptance, getDeclineReasonsBreakdown,
//         getOfferStatsSnapshot, clearCache.
// ═══════════════════════════════════════════════════════════════

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';

const TEST_DATA_DIR = join(process.cwd(), 'test-data-phase44-analytics');

// Setup test data directory before importing services
process.env.YAWMIA_DATA_PATH = TEST_DATA_DIR;

// Helper: generate offer ID
function offerId() {
  return 'dof_' + crypto.randomBytes(6).toString('hex');
}

// Helper: get current month shard (YYYY-MM Egypt timezone)
function getCurrentShard() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const d = new Date(egyptMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Helper: write offer to disk in current shard
async function writeOffer(offer) {
  const shard = getCurrentShard();
  const dir = join(TEST_DATA_DIR, 'direct_offers', shard);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${offer.id}.json`);
  await writeFile(filePath, JSON.stringify(offer, null, 2), 'utf-8');
}

// Helper: write user to disk
async function writeUser(user) {
  const dir = join(TEST_DATA_DIR, 'users');
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${user.id}.json`);
  await writeFile(filePath, JSON.stringify(user, null, 2), 'utf-8');
}

// Helper: build basic offer
function buildOffer(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: offerId(),
    employerId: 'usr_emp1',
    workerId: 'usr_wkr1',
    status: 'pending',
    category: 'farming',
    governorate: 'cairo',
    proposedDailyWage: 250,
    proposedStartDate: '2026-05-01',
    proposedDurationDays: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

before(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
  await mkdir(TEST_DATA_DIR, { recursive: true });
});

after(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════
// Test 1: getPlatformOfferFunnel — calculates rates correctly
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getPlatformOfferFunnel calculates accept/decline/expire rates correctly', async () => {
  const { getPlatformOfferFunnel, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // Setup: 10 offers — 5 accepted, 3 declined, 2 expired
  for (let i = 0; i < 5; i++) {
    await writeOffer(buildOffer({ status: 'accepted', acceptedAt: new Date().toISOString() }));
  }
  for (let i = 0; i < 3; i++) {
    await writeOffer(buildOffer({ status: 'declined', declinedAt: new Date().toISOString() }));
  }
  for (let i = 0; i < 2; i++) {
    await writeOffer(buildOffer({ status: 'expired' }));
  }

  const funnel = await getPlatformOfferFunnel();

  assert.equal(funnel.sent, 10);
  assert.equal(funnel.accepted, 5);
  assert.equal(funnel.declined, 3);
  assert.equal(funnel.expired, 2);
  // decided = 10, accepted/decided = 50%
  assert.equal(funnel.acceptRate, 50);
  assert.equal(funnel.declineRate, 30);
  assert.equal(funnel.expireRate, 20);
});

// ═══════════════════════════════════════════════════════════════
// Test 2: getPlatformOfferFunnel — handles empty offers
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getPlatformOfferFunnel handles empty offers (all-zero with rates 0)', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getPlatformOfferFunnel, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  const funnel = await getPlatformOfferFunnel();

  assert.equal(funnel.sent, 0);
  assert.equal(funnel.accepted, 0);
  assert.equal(funnel.acceptRate, 0);
  assert.equal(funnel.declineRate, 0);
  assert.equal(funnel.expireRate, 0);
});

// ═══════════════════════════════════════════════════════════════
// Test 3: getPlatformOfferFunnel — respects from/to filters
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getPlatformOfferFunnel respects from/to date filters', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getPlatformOfferFunnel, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // Offer in past (filtered out)
  await writeOffer(buildOffer({
    status: 'accepted',
    createdAt: '2025-01-01T00:00:00.000Z',
    acceptedAt: '2025-01-01T00:01:00.000Z',
  }));
  // Offer in range
  await writeOffer(buildOffer({
    status: 'accepted',
    createdAt: '2026-04-15T00:00:00.000Z',
    acceptedAt: '2026-04-15T00:01:00.000Z',
  }));

  const funnel = await getPlatformOfferFunnel({
    from: '2026-04-01',
    to: '2026-04-30',
  });

  assert.equal(funnel.sent, 1);
  assert.equal(funnel.accepted, 1);
});

// ═══════════════════════════════════════════════════════════════
// Test 4: getTopEmployersByAcceptance — sorting
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getTopEmployersByAcceptance sorts by acceptRate then total', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });
  await rm(join(TEST_DATA_DIR, 'users'), { recursive: true, force: true });

  const { getTopEmployersByAcceptance, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // Setup users
  await writeUser({ id: 'usr_empA', name: 'Employer A', role: 'employer' });
  await writeUser({ id: 'usr_empB', name: 'Employer B', role: 'employer' });

  // Employer A: 4 offers, 4 accepted = 100%
  for (let i = 0; i < 4; i++) {
    await writeOffer(buildOffer({ employerId: 'usr_empA', status: 'accepted', acceptedAt: new Date().toISOString() }));
  }
  // Employer B: 5 offers, 3 accepted, 2 declined = 60%
  for (let i = 0; i < 3; i++) {
    await writeOffer(buildOffer({ employerId: 'usr_empB', status: 'accepted', acceptedAt: new Date().toISOString() }));
  }
  for (let i = 0; i < 2; i++) {
    await writeOffer(buildOffer({ employerId: 'usr_empB', status: 'declined', declinedAt: new Date().toISOString() }));
  }

  const top = await getTopEmployersByAcceptance({ limit: 10, minOffers: 3 });

  assert.equal(top.length, 2);
  assert.equal(top[0].employerId, 'usr_empA'); // 100% > 60%
  assert.equal(top[0].acceptRate, 100);
  assert.equal(top[1].employerId, 'usr_empB');
  assert.equal(top[1].acceptRate, 60);
});

// ═══════════════════════════════════════════════════════════════
// Test 5: getTopEmployersByAcceptance — minOffers filter
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getTopEmployersByAcceptance respects minOffers filter', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getTopEmployersByAcceptance, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // Employer C: only 2 offers (below minOffers=3)
  for (let i = 0; i < 2; i++) {
    await writeOffer(buildOffer({ employerId: 'usr_empC', status: 'accepted', acceptedAt: new Date().toISOString() }));
  }

  const top = await getTopEmployersByAcceptance({ minOffers: 3 });

  assert.equal(top.length, 0); // filtered out
});

// ═══════════════════════════════════════════════════════════════
// Test 6: getTopEmployersByAcceptance — fallback to userId on missing user
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getTopEmployersByAcceptance fallback to userId on missing user', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });
  await rm(join(TEST_DATA_DIR, 'users'), { recursive: true, force: true });

  const { getTopEmployersByAcceptance, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // Employer X exists in offers but NOT in users/
  for (let i = 0; i < 3; i++) {
    await writeOffer(buildOffer({ employerId: 'usr_empX', status: 'accepted', acceptedAt: new Date().toISOString() }));
  }

  const top = await getTopEmployersByAcceptance({ minOffers: 3 });

  assert.equal(top.length, 1);
  assert.equal(top[0].employerId, 'usr_empX');
  assert.equal(top[0].name, 'usr_empX'); // fallback to userId
});

// ═══════════════════════════════════════════════════════════════
// Test 7: getTopWorkersByAcceptance — includes avgResponseSec
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getTopWorkersByAcceptance includes avgResponseSec', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });
  await rm(join(TEST_DATA_DIR, 'users'), { recursive: true, force: true });

  const { getTopWorkersByAcceptance, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  await writeUser({ id: 'usr_wkrA', name: 'Worker A', role: 'worker' });

  // 3 accepted offers with known response times: 30s, 60s, 90s → avg 60s
  const baseTime = Date.now();
  await writeOffer(buildOffer({
    workerId: 'usr_wkrA',
    status: 'accepted',
    createdAt: new Date(baseTime).toISOString(),
    acceptedAt: new Date(baseTime + 30000).toISOString(),
  }));
  await writeOffer(buildOffer({
    workerId: 'usr_wkrA',
    status: 'accepted',
    createdAt: new Date(baseTime).toISOString(),
    acceptedAt: new Date(baseTime + 60000).toISOString(),
  }));
  await writeOffer(buildOffer({
    workerId: 'usr_wkrA',
    status: 'accepted',
    createdAt: new Date(baseTime).toISOString(),
    acceptedAt: new Date(baseTime + 90000).toISOString(),
  }));

  const top = await getTopWorkersByAcceptance({ minOffers: 3 });

  assert.equal(top.length, 1);
  assert.equal(top[0].workerId, 'usr_wkrA');
  assert.equal(top[0].acceptRate, 100);
  assert.equal(top[0].avgResponseSec, 60);
});

// ═══════════════════════════════════════════════════════════════
// Test 8: getDeclineReasonsBreakdown — aggregates with percentages
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getDeclineReasonsBreakdown aggregates with percentages summing to ~100', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getDeclineReasonsBreakdown, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // 6 declined offers: 3 busy, 2 wage_low, 1 distance
  for (let i = 0; i < 3; i++) {
    await writeOffer(buildOffer({ status: 'declined', declinedAt: new Date().toISOString(), declinedReason: 'busy' }));
  }
  for (let i = 0; i < 2; i++) {
    await writeOffer(buildOffer({ status: 'declined', declinedAt: new Date().toISOString(), declinedReason: 'wage_low' }));
  }
  await writeOffer(buildOffer({ status: 'declined', declinedAt: new Date().toISOString(), declinedReason: 'distance' }));

  const result = await getDeclineReasonsBreakdown();

  assert.equal(result.total, 6);
  assert.equal(result.breakdown.length, 3);
  assert.equal(result.breakdown[0].reason, 'busy');
  assert.equal(result.breakdown[0].count, 3);
  assert.equal(result.breakdown[0].percentage, 50);

  // Verify percentages sum to 100
  const totalPct = result.breakdown.reduce((s, r) => s + r.percentage, 0);
  assert.equal(totalPct, 100);
});

// ═══════════════════════════════════════════════════════════════
// Test 9: getDeclineReasonsBreakdown — 'unspecified' fallback
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getDeclineReasonsBreakdown handles unspecified for null reason', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getDeclineReasonsBreakdown, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  // 2 declined offers without reason
  await writeOffer(buildOffer({ status: 'declined', declinedAt: new Date().toISOString(), declinedReason: null }));
  await writeOffer(buildOffer({ status: 'declined', declinedAt: new Date().toISOString() })); // no field at all

  const result = await getDeclineReasonsBreakdown();

  assert.equal(result.total, 2);
  assert.equal(result.breakdown.length, 1);
  assert.equal(result.breakdown[0].reason, 'unspecified');
  assert.equal(result.breakdown[0].count, 2);
});

// ═══════════════════════════════════════════════════════════════
// Test 10: cache hit on second call same params
// ═══════════════════════════════════════════════════════════════

test('Phase 44: cache hit on second call same params (no recomputation)', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getPlatformOfferFunnel, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  await writeOffer(buildOffer({ status: 'accepted', acceptedAt: new Date().toISOString() }));

  const r1 = await getPlatformOfferFunnel();
  assert.equal(r1.sent, 1);

  // Add another offer to disk
  await writeOffer(buildOffer({ status: 'accepted', acceptedAt: new Date().toISOString() }));

  // Without clearing cache, should still see r1's snapshot (1 offer)
  const r2 = await getPlatformOfferFunnel();
  assert.equal(r2.sent, 1); // cached, did not re-read disk
});

// ═══════════════════════════════════════════════════════════════
// Test 11: clearCache empties cache (subsequent call recomputes)
// ═══════════════════════════════════════════════════════════════

test('Phase 44: clearCache empties cache (subsequent call recomputes)', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getPlatformOfferFunnel, clearCache } = await import('../server/services/directOfferAnalytics.js');
  clearCache();

  await writeOffer(buildOffer({ status: 'accepted', acceptedAt: new Date().toISOString() }));

  const r1 = await getPlatformOfferFunnel();
  assert.equal(r1.sent, 1);

  // Add another, clear cache, recompute
  await writeOffer(buildOffer({ status: 'accepted', acceptedAt: new Date().toISOString() }));
  clearCache();

  const r2 = await getPlatformOfferFunnel();
  assert.equal(r2.sent, 2); // fresh read after clearCache
});

// ═══════════════════════════════════════════════════════════════
// Test 12: getOfferStatsSnapshot — lightweight (no caching, recent hour only)
// ═══════════════════════════════════════════════════════════════

test('Phase 44: getOfferStatsSnapshot lightweight (no caching, recent hour only)', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { getOfferStatsSnapshot } = await import('../server/services/directOfferAnalytics.js');

  const now = Date.now();

  // Old offer (>1 hour ago) — should be excluded from recent counts
  await writeOffer(buildOffer({
    status: 'accepted',
    createdAt: new Date(now - 7200000).toISOString(),
    updatedAt: new Date(now - 7200000).toISOString(),
    acceptedAt: new Date(now - 7200000 + 30000).toISOString(),
  }));
  // Recent offer (<1 hour ago)
  await writeOffer(buildOffer({
    status: 'accepted',
    createdAt: new Date(now - 1800000).toISOString(),
    updatedAt: new Date(now - 1800000 + 30000).toISOString(),
    acceptedAt: new Date(now - 1800000 + 30000).toISOString(),
  }));
  // Active pending
  await writeOffer(buildOffer({ status: 'pending' }));

  const snapshot = await getOfferStatsSnapshot();

  assert.equal(snapshot.activePending, 1);
  assert.equal(snapshot.recentAccepted, 1); // only recent
  assert.equal(snapshot.recentDeclined, 0);
  assert.equal(snapshot.recentExpired, 0);
  assert.equal(snapshot.acceptRate, 100); // 1 accepted / 1 decided
  assert.ok(snapshot.avgResponseSec >= 0);
});
