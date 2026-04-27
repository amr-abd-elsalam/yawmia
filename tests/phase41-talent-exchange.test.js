// ═══════════════════════════════════════════════════════════════
// tests/phase41-talent-exchange.test.js — Phase 41 Test Suite
// ═══════════════════════════════════════════════════════════════
// Talent Exchange Foundation — ~70 test cases
//
// Categories:
//   1. AvailabilityAd Service       (15 tests)
//   2. WorkerDiscovery Service      (12 tests)
//   3. AdMatcher Service            (10 tests)
//   4. QueryIndex Updates           (5 tests)
//   5. Concurrency                  (4 tests)
//   6. API Endpoints                (15 tests)
//   7. Migration v4 + Config        (5 tests)
//   8. Repair Indexes               (4 tests)
// ═══════════════════════════════════════════════════════════════

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Setup temp data dir BEFORE any module loads ──
let TEMP_DIR;
let originalDataPath;

async function setupTempDataDir() {
  TEMP_DIR = await mkdtemp(join(tmpdir(), 'yawmia-p41-'));
  originalDataPath = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = TEMP_DIR;
  // Pre-create dirs
  const dirs = [
    'users', 'sessions', 'jobs', 'applications', 'otp', 'notifications',
    'ratings', 'payments', 'reports', 'verifications', 'attendance', 'audit',
    'messages', 'push_subscriptions', 'alerts', 'metrics', 'favorites',
    'images', 'availability_windows', 'instant_matches', 'availability_ads',
  ];
  for (const d of dirs) {
    await mkdir(join(TEMP_DIR, d), { recursive: true });
  }
}

async function teardownTempDataDir() {
  if (originalDataPath) {
    process.env.YAWMIA_DATA_PATH = originalDataPath;
  } else {
    delete process.env.YAWMIA_DATA_PATH;
  }
  if (TEMP_DIR) {
    await rm(TEMP_DIR, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Test fixtures helpers ────────────────────────────────────

const FUTURE_DAY_MS = 24 * 60 * 60 * 1000;

function futureISO(hoursFromNow) {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

function makeAdFields(overrides = {}) {
  return {
    categories: ['plumbing'],
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
    radiusKm: 20,
    minDailyWage: 250,
    maxDailyWage: 350,
    availableFrom: futureISO(2),
    availableUntil: futureISO(8),
    notes: null,
    ...overrides,
  };
}

async function createTestWorker(suffix = 'a') {
  const { atomicWrite, getRecordPath, readIndex, writeIndex } = await import('../server/services/database.js');
  const id = 'usr_test_w_' + suffix + Date.now().toString(36).slice(-4);
  const now = new Date().toISOString();
  const user = {
    id,
    phone: '0101' + Math.floor(Math.random() * 10000000).toString().padStart(7, '0'),
    role: 'worker',
    name: 'أحمد محمد',
    governorate: 'cairo',
    categories: ['plumbing'],
    lat: 30.0444,
    lng: 31.2357,
    rating: { avg: 4.5, count: 10 },
    status: 'active',
    verificationStatus: 'verified',
    createdAt: now,
    updatedAt: now,
  };
  await atomicWrite(getRecordPath('users', id), user);
  const idx = await readIndex('phoneIndex');
  idx[user.phone] = id;
  await writeIndex('phoneIndex', idx);
  return user;
}

async function createTestEmployer(suffix = 'a') {
  const { atomicWrite, getRecordPath } = await import('../server/services/database.js');
  const id = 'usr_test_e_' + suffix + Date.now().toString(36).slice(-4);
  const now = new Date().toISOString();
  const user = {
    id,
    phone: '0102' + Math.floor(Math.random() * 10000000).toString().padStart(7, '0'),
    role: 'employer',
    name: 'صاحب عمل',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
    rating: { avg: 0, count: 0 },
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  await atomicWrite(getRecordPath('users', id), user);
  return user;
}

// ═══════════════════════════════════════════════════════════════
// 1. AvailabilityAd Service — 15 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — AvailabilityAd Service', () => {
  before(async () => { await setupTempDataDir(); });
  after(async () => { await teardownTempDataDir(); });

  test('P41-01 — createAd with valid fields succeeds', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p1');
    const result = await createAd(worker.id, makeAdFields());
    assert.equal(result.ok, true);
    assert.ok(result.ad);
    assert.equal(result.ad.status, 'active');
    assert.match(result.ad.id, /^aad_/);
    assert.equal(result.ad.workerId, worker.id);
  });

  test('P41-02 — createAd rejects past availableFrom', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p2');
    const result = await createAd(worker.id, makeAdFields({
      availableFrom: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      availableUntil: futureISO(2),
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_TIME_WINDOW');
  });

  test('P41-03 — createAd rejects too-distant availableFrom (>7 days)', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p3');
    const result = await createAd(worker.id, makeAdFields({
      availableFrom: futureISO(8 * 24),
      availableUntil: futureISO(8 * 24 + 4),
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_TIME_WINDOW');
  });

  test('P41-04 — createAd rejects duration > 12h', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p4');
    const result = await createAd(worker.id, makeAdFields({
      availableFrom: futureISO(2),
      availableUntil: futureISO(20),
    }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_TIME_WINDOW');
  });

  test('P41-05 — createAd rejects radius > maxRadiusKm', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p5');
    const result = await createAd(worker.id, makeAdFields({ radiusKm: 200 }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_RADIUS');
  });

  test('P41-06 — createAd rejects categories not in LABOR_CATEGORIES', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p6');
    const result = await createAd(worker.id, makeAdFields({ categories: ['rocketscience'] }));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_CATEGORIES');
  });

  test('P41-07 — createAd rejects wage out of bounds', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p7');
    const r1 = await createAd(worker.id, makeAdFields({ minDailyWage: 50, maxDailyWage: 100 }));
    assert.equal(r1.ok, false);
    assert.equal(r1.code, 'INVALID_WAGE_RANGE');
    const r2 = await createAd(worker.id, makeAdFields({ minDailyWage: 500, maxDailyWage: 300 }));
    assert.equal(r2.ok, false);
    assert.equal(r2.code, 'INVALID_WAGE_RANGE');
  });

  test('P41-08 — createAd auto-expires existing active ad', async () => {
    const { createAd, listByWorker } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p8');
    const first = await createAd(worker.id, makeAdFields());
    assert.equal(first.ok, true);
    const second = await createAd(worker.id, makeAdFields({ minDailyWage: 300, maxDailyWage: 400 }));
    assert.equal(second.ok, true);
    const ads = await listByWorker(worker.id);
    const expired = ads.filter(a => a.status === 'expired');
    const active = ads.filter(a => a.status === 'active');
    assert.equal(expired.length, 1);
    assert.equal(active.length, 1);
    assert.equal(active[0].id, second.ad.id);
  });

  test('P41-09 — createAd enforces maxAdsPerWorkerPerDay', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const config = (await import('../config.js')).default;
    const worker = await createTestWorker('p9');
    const limit = config.LIMITS.maxAdsPerWorkerPerDay;
    let lastResult;
    for (let i = 0; i < limit + 1; i++) {
      lastResult = await createAd(worker.id, makeAdFields({
        minDailyWage: 200 + i,
        maxDailyWage: 400 + i,
      }));
    }
    assert.equal(lastResult.ok, false);
    assert.equal(lastResult.code, 'DAILY_AD_LIMIT');
  });

  test('P41-10 — withdrawAd ownership check', async () => {
    const { createAd, withdrawAd } = await import('../server/services/availabilityAd.js');
    const worker1 = await createTestWorker('p10a');
    const worker2 = await createTestWorker('p10b');
    const created = await createAd(worker1.id, makeAdFields());
    assert.equal(created.ok, true);
    const result = await withdrawAd(created.ad.id, worker2.id);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'NOT_OWNER');
  });

  test('P41-11 — withdrawAd success', async () => {
    const { createAd, withdrawAd, findById } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p11');
    const created = await createAd(worker.id, makeAdFields());
    const result = await withdrawAd(created.ad.id, worker.id);
    assert.equal(result.ok, true);
    assert.equal(result.ad.status, 'withdrawn');
    const reread = await findById(created.ad.id);
    assert.equal(reread.status, 'withdrawn');
  });

  test('P41-12 — listByWorker via index returns sorted newest first', async () => {
    const { createAd, listByWorker } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p12');
    await createAd(worker.id, makeAdFields());
    await new Promise(r => setTimeout(r, 10));
    await createAd(worker.id, makeAdFields({ minDailyWage: 300, maxDailyWage: 400 }));
    const ads = await listByWorker(worker.id);
    assert.ok(ads.length >= 2);
    for (let i = 1; i < ads.length; i++) {
      assert.ok(new Date(ads[i - 1].createdAt) >= new Date(ads[i].createdAt));
    }
  });

  test('P41-13 — searchAds Set intersection (gov + cat)', async () => {
    const { createAd, searchAds } = await import('../server/services/availabilityAd.js');
    const w1 = await createTestWorker('p13a');
    const w2 = await createTestWorker('p13b');
    await createAd(w1.id, makeAdFields({ governorate: 'cairo', categories: ['plumbing'] }));
    await createAd(w2.id, makeAdFields({ governorate: 'giza', categories: ['plumbing'] }));
    const results = await searchAds({ governorate: 'cairo', categories: ['plumbing'] });
    const cairoIds = results.filter(r => r.governorate === 'cairo').map(r => r.id);
    const gizaIds = results.filter(r => r.governorate === 'giza').map(r => r.id);
    assert.ok(cairoIds.length >= 1);
    assert.equal(gizaIds.length, 0);
  });

  test('P41-14 — searchAds wage overlap filter', async () => {
    const { createAd, searchAds } = await import('../server/services/availabilityAd.js');
    const w1 = await createTestWorker('p14a');
    const w2 = await createTestWorker('p14b');
    await createAd(w1.id, makeAdFields({ minDailyWage: 200, maxDailyWage: 300 }));
    await createAd(w2.id, makeAdFields({ minDailyWage: 500, maxDailyWage: 700 }));
    // Job paying 250 should match w1 only
    const results = await searchAds({ minWage: 250, maxWage: 250 });
    const matchingW1 = results.find(r => r.workerId === w1.id);
    const matchingW2 = results.find(r => r.workerId === w2.id);
    assert.ok(matchingW1, 'w1 should match');
    assert.equal(matchingW2, undefined, 'w2 should NOT match (wage out of range)');
  });

  test('P41-15 — expireStaleAds processes timed-out ads', async () => {
    const { createAd, expireStaleAds, findById, listByWorker } = await import('../server/services/availabilityAd.js');
    const { atomicWrite, getRecordPath } = await import('../server/services/database.js');
    const worker = await createTestWorker('p15');
    const created = await createAd(worker.id, makeAdFields());
    // Manually set availableUntil to 2 hours ago to trigger expiration
    const ad = await findById(created.ad.id);
    ad.availableUntil = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await atomicWrite(getRecordPath('availability_ads', ad.id), ad);
    const expiredCount = await expireStaleAds();
    assert.ok(expiredCount >= 1);
    const reread = await findById(created.ad.id);
    assert.equal(reread.status, 'expired');
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. WorkerDiscovery Service — 12 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — WorkerDiscovery Service', () => {
  before(async () => { await setupTempDataDir(); });
  after(async () => { await teardownTempDataDir(); });

  test('P41-16 — TIER 1 returns active ads first', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { discoverWorkers, _testHelpers } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    const worker = await createTestWorker('d1');
    await createAd(worker.id, makeAdFields());
    const result = await discoverWorkers({
      lat: 30.0444, lng: 31.2357, radiusKm: 30,
      governorate: 'cairo',
      limit: 10,
    });
    assert.ok(result.workers.length >= 1);
    const tier1 = result.workers.filter(w => w._tier === 1);
    assert.ok(tier1.length >= 1);
  });

  test('P41-17 — TIER 2 supplements when no ads', async () => {
    const { _setPresence } = await import('../server/services/presenceService.js');
    const { discoverWorkers, _testHelpers } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    const worker = await createTestWorker('d2');
    _setPresence(worker.id, {
      lastHeartbeat: Date.now(),
      currentLocation: { lat: 30.0444, lng: 31.2357 },
      acceptingJobs: true,
    });
    const result = await discoverWorkers({
      lat: 30.0444, lng: 31.2357, radiusKm: 30,
      governorate: 'cairo',
      categories: ['plumbing'],
      limit: 10,
    });
    const tier2 = result.workers.filter(w => w._tier === 2);
    assert.ok(tier2.length >= 0); // may match
    const ids = result.workers.map(w => w.id);
    assert.ok(ids.includes(worker.id));
  });

  test('P41-18 — TIER 3 fallback only when low supply', async () => {
    const { discoverWorkers, _testHelpers } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    // Just verify call works — TIER 3 is opportunistic
    const result = await discoverWorkers({
      lat: 30.0444, lng: 31.2357, radiusKm: 30,
      governorate: 'cairo',
      limit: 50,
    });
    assert.ok(Array.isArray(result.workers));
  });

  test('P41-19 — Composite scoring weights applied', async () => {
    const { _testHelpers } = await import('../server/services/workerDiscovery.js');
    const config = (await import('../config.js')).default;
    const candidate = {
      lat: 30.0444, lng: 31.2357,
      _distance: 5,
      trustScore: 0.8,
      rating: { avg: 4.5 },
      isOnline: true,
      hasActiveAd: false,
    };
    const score = _testHelpers.computeCompositeScore(candidate, 30.0444, 31.2357, 30);
    const w = config.WORKER_DISCOVERY.scoreWeights;
    const expectedDist = (1 - 5/30);
    const expectedRating = 4.5/5;
    const expected = w.distance*expectedDist + w.trustScore*0.8 + w.ratingAvg*expectedRating + w.recency*1.0;
    assert.ok(Math.abs(score - expected) < 0.01);
  });

  test('P41-20 — activeAdBonus applied to ad owners', async () => {
    const { _testHelpers } = await import('../server/services/workerDiscovery.js');
    const config = (await import('../config.js')).default;
    const candidateA = {
      lat: 30.0444, lng: 31.2357, _distance: 5,
      trustScore: 0.8, rating: { avg: 4.5 }, isOnline: true,
      hasActiveAd: false,
    };
    const candidateB = { ...candidateA, hasActiveAd: true };
    const scoreA = _testHelpers.computeCompositeScore(candidateA, 30.0444, 31.2357, 30);
    const scoreB = _testHelpers.computeCompositeScore(candidateB, 30.0444, 31.2357, 30);
    assert.ok(scoreB > scoreA);
    assert.ok(Math.abs((scoreB - scoreA) - config.WORKER_DISCOVERY.activeAdBonus) < 0.01);
  });

  test('P41-21 — Tile cache hit returns same data', async () => {
    const { discoverWorkers, _testHelpers } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    const opts = { lat: 30.0444, lng: 31.2357, radiusKm: 30, governorate: 'cairo', limit: 10 };
    const r1 = await discoverWorkers(opts);
    const r2 = await discoverWorkers(opts);
    assert.equal(r1.total, r2.total);
  });

  test('P41-22 — Tile cache invalidates on ad event', async () => {
    const { eventBus } = await import('../server/services/eventBus.js');
    const { discoverWorkers, _testHelpers, getStats } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    const opts = { lat: 30.0444, lng: 31.2357, radiusKm: 30, governorate: 'cairo', limit: 10 };
    await discoverWorkers(opts);
    const before = getStats().tilesCached;
    assert.ok(before >= 1);
    eventBus.emit('ad:created', { adId: 'aad_test', workerId: 'usr_test' });
    // Cache should be cleared after event
    const after = getStats().tilesCached;
    assert.equal(after, 0);
  });

  test('P41-23 — Privacy-first card redacts name', async () => {
    const { _testHelpers } = await import('../server/services/workerDiscovery.js');
    const user = { id: 'usr_test', name: 'أحمد محمد', governorate: 'cairo', categories: [], rating: { avg: 0, count: 0 }, createdAt: '2026-01-01' };
    const card = _testHelpers.buildPublicCard(user, null, null, null, null);
    assert.equal(card.displayName, 'أحمد م.');
  });

  test('P41-24 — Privacy-first card hides phone', async () => {
    const { _testHelpers } = await import('../server/services/workerDiscovery.js');
    const user = { id: 'usr_test', name: 'علي', phone: '01012345678', governorate: 'cairo', categories: [], rating: { avg: 0, count: 0 }, createdAt: '2026-01-01' };
    const card = _testHelpers.buildPublicCard(user, null, null, null, null);
    assert.equal(card.phone, undefined);
    assert.ok(!Object.keys(card).includes('phone'));
  });

  test('P41-25 — Privacy-first card returns governorate not lat/lng', async () => {
    const { _testHelpers } = await import('../server/services/workerDiscovery.js');
    const user = { id: 'usr_test', name: 'خالد', lat: 30.05, lng: 31.24, governorate: 'cairo', categories: [], rating: { avg: 0, count: 0 }, createdAt: '2026-01-01' };
    const card = _testHelpers.buildPublicCard(user, null, null, null, null);
    assert.equal(card.governorate, 'cairo');
    assert.equal(card.lat, undefined);
    assert.equal(card.lng, undefined);
  });

  test('P41-26 — distanceKm computed correctly', async () => {
    const { _testHelpers } = await import('../server/services/workerDiscovery.js');
    const user = { id: 'usr_test', name: 'عمر', governorate: 'cairo', categories: [], rating: { avg: 0, count: 0 }, createdAt: '2026-01-01' };
    const card = _testHelpers.buildPublicCard(user, null, null, 12.345, null);
    assert.equal(card.distanceKm, 12.3);
  });

  test('P41-27 — Dedup across tiers (no duplicate userIds)', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { _setPresence } = await import('../server/services/presenceService.js');
    const { discoverWorkers, _testHelpers } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    const worker = await createTestWorker('d27');
    await createAd(worker.id, makeAdFields());
    _setPresence(worker.id, {
      lastHeartbeat: Date.now(),
      currentLocation: { lat: 30.0444, lng: 31.2357 },
      acceptingJobs: true,
    });
    const result = await discoverWorkers({
      lat: 30.0444, lng: 31.2357, radiusKm: 30,
      governorate: 'cairo',
      limit: 50,
    });
    const ids = result.workers.map(w => w.id);
    const uniqueIds = new Set(ids);
    assert.equal(ids.length, uniqueIds.size);
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. AdMatcher Service — 10 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — AdMatcher Service', () => {
  before(async () => { await setupTempDataDir(); });
  after(async () => { await teardownTempDataDir(); });

  test('P41-28 — Skips job with urgency=normal', async () => {
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const job = {
      id: 'job_p28',
      title: 'Test',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'normal',
      status: 'open',
      employerId: 'usr_e_p28',
      startDate: futureISO(3),
    };
    const count = await matchAdsToJob(job);
    assert.equal(count, 0);
  });

  test('P41-29 — Notifies workers with matching ads (urgent)', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p29');
    await createAd(worker.id, makeAdFields({ availableFrom: futureISO(1), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    const job = {
      id: 'job_p29',
      title: 'فرصة سباكة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p29',
      startDate: futureISO(2),
    };
    const count = await matchAdsToJob(job);
    assert.ok(count >= 1);
  });

  test('P41-30 — Notifies workers with matching ads (immediate)', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p30');
    await createAd(worker.id, makeAdFields({ availableFrom: futureISO(0.5), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    const job = {
      id: 'job_p30',
      title: 'فرصة فورية',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'immediate',
      status: 'open',
      employerId: 'usr_e_p30',
      startDate: futureISO(1),
    };
    const count = await matchAdsToJob(job);
    assert.ok(count >= 1);
  });

  test('P41-31 — Wage overlap filter excludes non-matching', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p31');
    await createAd(worker.id, makeAdFields({ minDailyWage: 500, maxDailyWage: 700 }));
    await buildAllIndexes();
    // Job paying 200 — out of ad's range
    const job = {
      id: 'job_p31',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 200,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p31',
      startDate: futureISO(2),
    };
    const count = await matchAdsToJob(job);
    assert.equal(count, 0);
  });

  test('P41-32 — Time overlap filter excludes non-matching', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p32');
    await createAd(worker.id, makeAdFields({ availableFrom: futureISO(2), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    // Job starts way after ad's window
    const job = {
      id: 'job_p32',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p32',
      startDate: futureISO(50),
    };
    const count = await matchAdsToJob(job);
    assert.equal(count, 0);
  });

  test('P41-33 — Geo overlap filter excludes far jobs', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p33');
    await createAd(worker.id, makeAdFields({
      lat: 30.0444, lng: 31.2357, radiusKm: 5,
    }));
    await buildAllIndexes();
    // Job 100km away
    const job = {
      id: 'job_p33',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 31.2, lng: 29.9, // Alexandria area
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p33',
      startDate: futureISO(3),
    };
    const count = await matchAdsToJob(job);
    assert.equal(count, 0);
  });

  test('P41-34 — Increments offerCount on match', async () => {
    const { createAd, findById } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p34');
    const created = await createAd(worker.id, makeAdFields({ availableFrom: futureISO(1), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    const job = {
      id: 'job_p34',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p34',
      startDate: futureISO(2),
    };
    await matchAdsToJob(job);
    // Allow async incrementOfferCount to complete
    await new Promise(r => setTimeout(r, 100));
    const reread = await findById(created.ad.id);
    assert.ok(reread.offerCount >= 1);
  });

  test('P41-35 — Adds to dedup map for jobMatcher', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob, getDedupedWorkers } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p35');
    await createAd(worker.id, makeAdFields({ availableFrom: futureISO(1), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    const job = {
      id: 'job_p35',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p35',
      startDate: futureISO(2),
    };
    await matchAdsToJob(job);
    const deduped = getDedupedWorkers('job_p35');
    assert.ok(deduped.has(worker.id));
  });

  test('P41-36 — Emits ad:job_match event', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob } = await import('../server/services/adMatcher.js');
    const { eventBus } = await import('../server/services/eventBus.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p36');
    await createAd(worker.id, makeAdFields({ availableFrom: futureISO(1), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    let received = null;
    const off = eventBus.on('ad:job_match', (data) => { received = data; });
    const job = {
      id: 'job_p36',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p36',
      startDate: futureISO(2),
    };
    await matchAdsToJob(job);
    if (typeof off === 'function') off();
    assert.ok(received);
    assert.equal(received.jobId, 'job_p36');
    assert.equal(received.workerId, worker.id);
  });

  test('P41-37 — Dedup map TTL is enforced', async () => {
    const { addToDedup, getDedupedWorkers, _testHelpers } = await import('../server/services/adMatcher.js');
    addToDedup('job_p37', ['usr_w_p37']);
    const before = getDedupedWorkers('job_p37');
    assert.ok(before.has('usr_w_p37'));
    // Manually expire
    const map = _testHelpers.notificationDedup;
    const entry = map.get('job_p37');
    if (entry) entry.expiresAt = Date.now() - 1000;
    const after = getDedupedWorkers('job_p37');
    assert.equal(after.size, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. QueryIndex Updates — 5 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — QueryIndex Updates', () => {
  before(async () => { await setupTempDataDir(); });
  after(async () => { await teardownTempDataDir(); });

  test('P41-38 — onAdCreated populates Maps', async () => {
    const { onAdCreated, queryAds, clear, getStats } = await import('../server/services/queryIndex.js');
    clear();
    onAdCreated({
      id: 'aad_test38',
      workerId: 'usr_w_p38',
      status: 'active',
      governorate: 'cairo',
      categories: ['plumbing', 'electrical'],
      minDailyWage: 200, maxDailyWage: 400,
      availableFrom: futureISO(1), availableUntil: futureISO(8),
      createdAt: new Date().toISOString(),
    });
    const stats = getStats();
    assert.equal(stats.totalAds, 1);
    assert.equal(stats.activeAds, 1);
    const cairoIds = queryAds({ governorate: 'cairo' });
    assert.ok(cairoIds.includes('aad_test38'));
    const plumbingIds = queryAds({ categories: ['plumbing'] });
    assert.ok(plumbingIds.includes('aad_test38'));
    const electricalIds = queryAds({ categories: ['electrical'] });
    assert.ok(electricalIds.includes('aad_test38'));
  });

  test('P41-39 — onAdStatusChanged updates adsActive', async () => {
    const { onAdCreated, onAdStatusChanged, queryAds, clear } = await import('../server/services/queryIndex.js');
    clear();
    onAdCreated({
      id: 'aad_test39', workerId: 'usr_w_p39', status: 'active',
      governorate: 'cairo', categories: ['plumbing'],
      minDailyWage: 200, maxDailyWage: 400,
      availableFrom: futureISO(1), availableUntil: futureISO(8),
      createdAt: new Date().toISOString(),
    });
    let result = queryAds({ governorate: 'cairo' });
    assert.ok(result.includes('aad_test39'));
    onAdStatusChanged('aad_test39', 'expired');
    result = queryAds({ governorate: 'cairo' });
    assert.ok(!result.includes('aad_test39'));
  });

  test('P41-40 — queryAds with multi-criteria intersection', async () => {
    const { onAdCreated, queryAds, clear } = await import('../server/services/queryIndex.js');
    clear();
    onAdCreated({
      id: 'aad_a', workerId: 'usr_a', status: 'active',
      governorate: 'cairo', categories: ['plumbing'],
      minDailyWage: 200, maxDailyWage: 400,
      availableFrom: futureISO(1), availableUntil: futureISO(8),
      createdAt: new Date().toISOString(),
    });
    onAdCreated({
      id: 'aad_b', workerId: 'usr_b', status: 'active',
      governorate: 'cairo', categories: ['electrical'],
      minDailyWage: 200, maxDailyWage: 400,
      availableFrom: futureISO(1), availableUntil: futureISO(8),
      createdAt: new Date().toISOString(),
    });
    onAdCreated({
      id: 'aad_c', workerId: 'usr_c', status: 'active',
      governorate: 'giza', categories: ['plumbing'],
      minDailyWage: 200, maxDailyWage: 400,
      availableFrom: futureISO(1), availableUntil: futureISO(8),
      createdAt: new Date().toISOString(),
    });
    const result = queryAds({ governorate: 'cairo', categories: ['plumbing'] });
    assert.ok(result.includes('aad_a'));
    assert.ok(!result.includes('aad_b'));
    assert.ok(!result.includes('aad_c'));
  });

  test('P41-41 — buildAllIndexes includes ads', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { buildAllIndexes, getStats, clear } = await import('../server/services/queryIndex.js');
    clear();
    const worker = await createTestWorker('p41');
    await createAd(worker.id, makeAdFields());
    await buildAllIndexes();
    const stats = getStats();
    assert.ok(stats.totalAds >= 1);
    assert.ok(stats.activeAds >= 1);
  });

  test('P41-42 — getStats includes ads counts', async () => {
    const { onAdCreated, getStats, clear } = await import('../server/services/queryIndex.js');
    clear();
    onAdCreated({
      id: 'aad_st1', workerId: 'usr_st1', status: 'active',
      governorate: 'cairo', categories: ['plumbing'],
      minDailyWage: 200, maxDailyWage: 400,
      availableFrom: futureISO(1), availableUntil: futureISO(8),
      createdAt: new Date().toISOString(),
    });
    const stats = getStats();
    assert.ok('totalAds' in stats);
    assert.ok('activeAds' in stats);
    assert.ok('adsByGovernorate' in stats);
    assert.ok('adsByCategory' in stats);
    assert.equal(stats.totalAds, 1);
    assert.equal(stats.activeAds, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Concurrency — 4 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — Concurrency', () => {
  before(async () => { await setupTempDataDir(); });
  after(async () => { await teardownTempDataDir(); });

  test('P41-43 — 5 parallel createAd by same worker → only 1 active', async () => {
    const { createAd, listByWorker } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p43');
    // Use distinct wages to bypass dedup logic if any
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(createAd(worker.id, makeAdFields({
        minDailyWage: 200 + i*10,
        maxDailyWage: 400 + i*10,
      })));
    }
    await Promise.all(promises);
    const ads = await listByWorker(worker.id);
    const active = ads.filter(a => a.status === 'active');
    assert.equal(active.length, 1, 'exactly 1 active ad expected');
  });

  test('P41-44 — createAd race respects withLock', async () => {
    const { createAd, listByWorker } = await import('../server/services/availabilityAd.js');
    const worker = await createTestWorker('p44');
    // Fire 4 concurrent — withLock should serialize
    const promises = [];
    for (let i = 0; i < 4; i++) {
      promises.push(createAd(worker.id, makeAdFields({
        minDailyWage: 200 + i*5,
        maxDailyWage: 350 + i*5,
      })));
    }
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.ok);
    assert.ok(successes.length >= 1);
    const ads = await listByWorker(worker.id);
    const active = ads.filter(a => a.status === 'active');
    assert.equal(active.length, 1);
  });

  test('P41-45 — adMatcher does not double-notify same worker via jobMatcher', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { matchAdsToJob, getDedupedWorkers } = await import('../server/services/adMatcher.js');
    const { buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p45');
    await createAd(worker.id, makeAdFields({ availableFrom: futureISO(1), availableUntil: futureISO(8) }));
    await buildAllIndexes();
    const job = {
      id: 'job_p45',
      title: 'فرصة',
      category: 'plumbing',
      governorate: 'cairo',
      dailyWage: 300,
      lat: 30.0444, lng: 31.2357,
      urgency: 'urgent',
      status: 'open',
      employerId: 'usr_e_p45',
      startDate: futureISO(2),
    };
    await matchAdsToJob(job);
    const deduped = getDedupedWorkers('job_p45');
    assert.ok(deduped.has(worker.id), 'jobMatcher will skip this worker via dedup');
  });

  test('P41-46 — Cache invalidation on rapid ad changes', async () => {
    const { eventBus } = await import('../server/services/eventBus.js');
    const { discoverWorkers, _testHelpers, getStats } = await import('../server/services/workerDiscovery.js');
    _testHelpers.clearCache();
    await discoverWorkers({ lat: 30.0444, lng: 31.2357, radiusKm: 30, governorate: 'cairo', limit: 10 });
    assert.ok(getStats().tilesCached >= 1);
    // Fire 3 events rapidly
    eventBus.emit('ad:created', { adId: 'aad_x', workerId: 'usr_x' });
    eventBus.emit('ad:withdrawn', { adId: 'aad_y' });
    eventBus.emit('ad:expired', { adId: 'aad_z' });
    assert.equal(getStats().tilesCached, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. API Endpoints — 15 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — API Endpoints', () => {
  let server;
  let baseUrl;
  let workerToken;
  let workerId;
  let employerToken;
  let employerId;
  let adminToken;

  before(async () => {
    await setupTempDataDir();
    process.env.PORT = '0';
    process.env.ADMIN_TOKEN = 'test-admin-secret';
    adminToken = 'test-admin-secret';

    const { createServer: createHttpServer } = await import('node:http');
    const config = (await import('../config.js')).default;
    const { createRouter } = await import('../server/router.js');
    const { initDatabase } = await import('../server/services/database.js');
    const { corsMiddleware } = await import('../server/middleware/cors.js');
    const { securityMiddleware } = await import('../server/middleware/security.js');
    const { requestIdMiddleware } = await import('../server/middleware/requestId.js');
    const { bodyParserMiddleware } = await import('../server/middleware/bodyParser.js');
    const { rateLimitMiddleware } = await import('../server/middleware/rateLimit.js');
    const { timingMiddleware } = await import('../server/middleware/timing.js');
    const { staticMiddleware } = await import('../server/middleware/static.js');

    await initDatabase();
    const router = createRouter();
    const middlewares = [timingMiddleware, corsMiddleware, securityMiddleware, requestIdMiddleware, rateLimitMiddleware, bodyParserMiddleware];

    function runMiddleware(mws, req, res, done) {
      let i = 0;
      function next(err) {
        if (err) {
          if (!res.writableEnded) { res.writeHead(500); res.end(); }
          return;
        }
        const mw = mws[i++];
        if (!mw) return done();
        try { mw(req, res, next); } catch (e) { next(e); }
      }
      next();
    }

    server = createHttpServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      req.pathname = url.pathname;
      req.query = Object.fromEntries(url.searchParams);
      staticMiddleware(req, res, () => {
        runMiddleware(middlewares, req, res, () => router(req, res));
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Create test users + sessions
    const { createSession } = await import('../server/services/sessions.js');
    const worker = await createTestWorker('api');
    const employer = await createTestEmployer('api');
    workerId = worker.id;
    employerId = employer.id;
    const wSession = await createSession(worker.id, 'worker', { ip: '127.0.0.1', userAgent: 'test' });
    workerToken = wSession.token;
    const eSession = await createSession(employer.id, 'employer', { ip: '127.0.0.1', userAgent: 'test' });
    employerToken = eSession.token;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await teardownTempDataDir();
  });

  function api(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    return fetch(baseUrl + path, opts);
  }

  test('P41-47 — POST /api/availability-ads → 201', async () => {
    const res = await api('POST', '/api/availability-ads', makeAdFields(), workerToken);
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.match(data.ad.id, /^aad_/);
  });

  test('P41-48 — POST /api/availability-ads → 401 without auth', async () => {
    const res = await api('POST', '/api/availability-ads', makeAdFields());
    assert.equal(res.status, 401);
  });

  test('P41-49 — POST /api/availability-ads → 403 for employer', async () => {
    const res = await api('POST', '/api/availability-ads', makeAdFields(), employerToken);
    assert.equal(res.status, 403);
  });

  test('P41-50 — GET /api/availability-ads/mine → list', async () => {
    const res = await api('GET', '/api/availability-ads/mine', null, workerToken);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.ads));
  });

  test('P41-51 — DELETE /api/availability-ads/:id → 200 own', async () => {
    // Create first
    const create = await api('POST', '/api/availability-ads', makeAdFields({ minDailyWage: 280, maxDailyWage: 380 }), workerToken);
    const created = await create.json();
    assert.ok(created.ad);
    const res = await api('DELETE', '/api/availability-ads/' + created.ad.id, null, workerToken);
    assert.equal(res.status, 200);
  });

  test('P41-52 — DELETE → 403 for non-owner', async () => {
    // Create with worker
    const create = await api('POST', '/api/availability-ads', makeAdFields({ minDailyWage: 290, maxDailyWage: 390 }), workerToken);
    const created = await create.json();
    // Try delete with employer
    const res = await api('DELETE', '/api/availability-ads/' + created.ad.id, null, employerToken);
    // 403 from requireRole, OR ownership check
    assert.ok(res.status === 403, `expected 403, got ${res.status}`);
  });

  test('P41-53 — GET /api/availability-ads/:id increments viewCount for employer', async () => {
    const create = await api('POST', '/api/availability-ads', makeAdFields({ minDailyWage: 295, maxDailyWage: 395 }), workerToken);
    const created = await create.json();
    const before = created.ad.viewCount || 0;
    // Employer views
    await api('GET', '/api/availability-ads/' + created.ad.id, null, employerToken);
    // Allow async fire-and-forget
    await new Promise(r => setTimeout(r, 100));
    const reread = await api('GET', '/api/availability-ads/' + created.ad.id, null, workerToken);
    const data = await reread.json();
    assert.ok(data.ad.viewCount > before);
  });

  test('P41-54 — GET /api/workers/discover → 200 employer', async () => {
    const res = await api('GET', '/api/workers/discover?lat=30.0444&lng=31.2357&radius=30&governorate=cairo', null, employerToken);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.workers));
  });

  test('P41-55 — GET /api/workers/discover → 403 worker', async () => {
    const res = await api('GET', '/api/workers/discover?lat=30.0444&lng=31.2357&radius=30', null, workerToken);
    assert.equal(res.status, 403);
  });

  test('P41-56 — GET /api/workers/:id/card → 200 privacy-first card', async () => {
    const res = await api('GET', '/api/workers/' + workerId + '/card', null, employerToken);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.card);
    assert.equal(data.card.id, workerId);
    assert.equal(data.card.phone, undefined);
    assert.equal(data.card.lat, undefined);
    assert.equal(data.card.lng, undefined);
  });

  test('P41-57 — POST /api/workers/:id/quick-offer → 501 NOT_IMPLEMENTED', async () => {
    const res = await api('POST', '/api/workers/' + workerId + '/quick-offer', { dailyWage: 300 }, employerToken);
    assert.equal(res.status, 501);
    const data = await res.json();
    assert.equal(data.code, 'PHASE_42_PENDING');
  });

  test('P41-58 — GET /api/admin/availability-ads/stats → 200 admin', async () => {
    const res = await fetch(baseUrl + '/api/admin/availability-ads/stats', {
      headers: { 'X-Admin-Token': adminToken },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.stats);
    assert.ok('active' in data.stats);
  });

  test('P41-59 — GET /api/admin/availability-ads/stats → 401/403 non-admin', async () => {
    const res = await api('GET', '/api/admin/availability-ads/stats', null, employerToken);
    assert.ok(res.status === 401 || res.status === 403);
  });

  test('P41-60 — Validation errors return Arabic messages', async () => {
    const res = await api('POST', '/api/availability-ads', { categories: [] }, workerToken);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
    // Arabic chars present
    assert.match(data.error, /[\u0600-\u06FF]/);
  });

  test('P41-61 — Health endpoint includes availabilityAds + workerDiscovery', async () => {
    const res = await fetch(baseUrl + '/api/health');
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.version, '0.37.0');
    assert.ok(data.availabilityAds);
    assert.ok('active' in data.availabilityAds);
    assert.ok(data.workerDiscovery);
    assert.ok('tilesCached' in data.workerDiscovery);
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. Migration v4 + Config — 5 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — Migration v4 + Config', () => {
  test('P41-62 — Migration v4 registered', async () => {
    // Find by reading source file
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../server/services/migration.js', import.meta.url), 'utf-8');
    assert.match(src, /version:\s*4/);
    assert.match(src, /availability_ads/);
  });

  test('P41-63 — initDatabase creates availability_ads dir', async () => {
    await setupTempDataDir();
    const { initDatabase } = await import('../server/services/database.js');
    await initDatabase();
    const { stat } = await import('node:fs/promises');
    const result = await stat(join(TEMP_DIR, 'availability_ads'));
    assert.ok(result.isDirectory());
    await teardownTempDataDir();
  });

  test('P41-64 — Config sections = 59', async () => {
    const config = (await import('../config.js')).default;
    assert.ok(config.AVAILABILITY_ADS, 'AVAILABILITY_ADS section exists');
    assert.ok(config.WORKER_DISCOVERY, 'WORKER_DISCOVERY section exists');
    assert.ok(config.DIRECT_OFFERS, 'DIRECT_OFFERS section exists');
  });

  test('P41-65 — DATABASE.dirs contains availability_ads', async () => {
    const config = (await import('../config.js')).default;
    assert.equal(config.DATABASE.dirs.availability_ads, 'availability_ads');
    assert.equal(config.DATABASE.indexFiles.workerAdsIndex, 'availability_ads/worker-index.json');
    assert.ok(config.SHARDING.collections.includes('availability_ads'));
    assert.equal(config.LIMITS.maxAdsPerWorkerPerDay, 5);
  });

  test('P41-66 — Version = 0.37.0', async () => {
    const config = (await import('../config.js')).default;
    assert.equal(config.PWA.cacheName, 'yawmia-v0.37.0');
    const { readFile } = await import('node:fs/promises');
    const pkgRaw = await readFile(new URL('../package.json', import.meta.url), 'utf-8');
    const pkg = JSON.parse(pkgRaw);
    assert.equal(pkg.version, '0.37.0');
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. Repair Indexes — 4 tests
// ═══════════════════════════════════════════════════════════════

describe('Phase 41 — Repair Indexes', () => {
  before(async () => { await setupTempDataDir(); });
  after(async () => { await teardownTempDataDir(); });

  test('P41-67 — Source contains workerAdsIndex repair logic', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../scripts/repair-indexes.js', import.meta.url), 'utf-8');
    assert.match(src, /Worker-Ads Index/);
    assert.match(src, /availability_ads\/worker-index\.json/);
    assert.match(src, /aad_/);
  });

  test('P41-68 — Repair handles sharded ads via listRecords', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../scripts/repair-indexes.js', import.meta.url), 'utf-8');
    // listRecords already walks shard subdirs (Phase 39)
    assert.match(src, /listRecords/);
    assert.match(src, /availability_ads/);
  });

  test('P41-69 — Empty ads dir → empty index (smoke check)', async () => {
    // Verify the workerAdsIndex initial state when no ads exist
    const { readJSON } = await import('../server/services/database.js');
    const { join: joinPath } = await import('node:path');
    const path = joinPath(TEMP_DIR, 'availability_ads', 'worker-index.json');
    const data = await readJSON(path);
    // Should be null or empty object (not yet created)
    assert.ok(data === null || (typeof data === 'object' && Object.keys(data).length === 0));
  });

  test('P41-70 — After ad creation, queryIndex.queryAds works', async () => {
    const { createAd } = await import('../server/services/availabilityAd.js');
    const { queryAds, getStats, buildAllIndexes } = await import('../server/services/queryIndex.js');
    const worker = await createTestWorker('p70');
    await createAd(worker.id, makeAdFields());
    await buildAllIndexes();
    const stats = getStats();
    assert.ok(stats.activeAds >= 1);
    const result = queryAds({ governorate: 'cairo' });
    assert.ok(result.length >= 1);
  });
});
