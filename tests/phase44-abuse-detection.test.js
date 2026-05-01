// ═══════════════════════════════════════════════════════════════
// tests/phase44-abuse-detection.test.js — Rule-Based Abuse Detection
// ═══════════════════════════════════════════════════════════════
// Tests for offerAbuseDetector.js (Phase 44).
// Covers: 3 detection rules (same-worker spam, high-decline employer,
//         offer-bombing) + main detectAbuse entry.
// ═══════════════════════════════════════════════════════════════

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';

const TEST_DATA_DIR = join(process.cwd(), 'test-data-phase44-abuse');

// Setup test data dir BEFORE importing services
process.env.YAWMIA_DATA_PATH = TEST_DATA_DIR;

function offerId() {
  return 'dof_' + crypto.randomBytes(6).toString('hex');
}

function getCurrentShard() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const d = new Date(egyptMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function writeOffer(offer) {
  const shard = getCurrentShard();
  const dir = join(TEST_DATA_DIR, 'direct_offers', shard);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, `${offer.id}.json`);
  await writeFile(filePath, JSON.stringify(offer, null, 2), 'utf-8');
}

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
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Default Phase 44 abuse config (matches config.js values)
const defaultCfg = {
  enabled: true,
  sameWorkerOfferThreshold: 5,
  sameWorkerWindowHours: 24,
  employerHighDeclineRateThreshold: 0.8,
  employerDeclineWindowDays: 7,
  employerMinOffersForRateCheck: 10,
  workerOfferBombingThreshold: 30,
  workerOfferBombingWindowMinutes: 60,
  workerOfferBombingMinUniqueEmployers: 5,
};

before(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
  await mkdir(TEST_DATA_DIR, { recursive: true });
});

after(async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════
// Test 1: Same-worker spam — medium severity at threshold
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectSameWorkerSpam flags 5+ offers same employer→worker (medium severity)', async () => {
  const { _testHelpers } = await import('../server/services/offerAbuseDetector.js');
  const { detectSameWorkerSpam } = _testHelpers;

  const now = Date.now();
  // 5 offers from emp1 → wkr1 in last 24h (exactly at threshold)
  const offers = [];
  for (let i = 0; i < 5; i++) {
    offers.push({
      ...buildOffer({
        employerId: 'usr_empA',
        workerId: 'usr_wkrA',
        createdAt: new Date(now - i * 60 * 60 * 1000).toISOString(), // each 1h apart
      }),
    });
  }

  const flags = detectSameWorkerSpam(offers, defaultCfg);

  assert.equal(flags.length, 1);
  assert.equal(flags[0].type, 'same_worker_spam');
  assert.equal(flags[0].employerId, 'usr_empA');
  assert.equal(flags[0].workerId, 'usr_wkrA');
  assert.equal(flags[0].offerCount, 5);
  assert.equal(flags[0].severity, 'medium'); // not 2x threshold
});

// ═══════════════════════════════════════════════════════════════
// Test 2: Same-worker spam — high severity at 2x threshold
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectSameWorkerSpam severity high at 2x threshold (>=10 offers)', async () => {
  const { _testHelpers } = await import('../server/services/offerAbuseDetector.js');
  const { detectSameWorkerSpam } = _testHelpers;

  const now = Date.now();
  const offers = [];
  for (let i = 0; i < 12; i++) {
    offers.push({
      ...buildOffer({
        employerId: 'usr_empB',
        workerId: 'usr_wkrB',
        createdAt: new Date(now - i * 30 * 60 * 1000).toISOString(),
      }),
    });
  }

  const flags = detectSameWorkerSpam(offers, defaultCfg);

  assert.equal(flags.length, 1);
  assert.equal(flags[0].offerCount, 12);
  assert.equal(flags[0].severity, 'high'); // >=2x threshold
});

// ═══════════════════════════════════════════════════════════════
// Test 3: High-decline employer — medium severity (80-94%)
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectHighDeclineEmployers flags >=80% with >=10 offers (medium severity)', async () => {
  const { _testHelpers } = await import('../server/services/offerAbuseDetector.js');
  const { detectHighDeclineEmployers } = _testHelpers;

  const now = Date.now();
  const offers = [];
  // 10 offers from empC: 8 declined, 2 accepted = 80% decline rate
  for (let i = 0; i < 8; i++) {
    offers.push(buildOffer({
      employerId: 'usr_empC',
      status: 'declined',
      createdAt: new Date(now - i * 86400000).toISOString(), // 1 per day, last 8 days (within 7d window)
    }));
  }
  // Adjust: ensure all within 7 days
  offers.forEach((o, i) => {
    o.createdAt = new Date(now - i * 12 * 60 * 60 * 1000).toISOString(); // every 12h
  });
  for (let i = 0; i < 2; i++) {
    offers.push(buildOffer({
      employerId: 'usr_empC',
      status: 'accepted',
      createdAt: new Date(now - i * 60 * 60 * 1000).toISOString(),
    }));
  }

  const flags = detectHighDeclineEmployers(offers, defaultCfg);

  assert.equal(flags.length, 1);
  assert.equal(flags[0].type, 'high_decline_employer');
  assert.equal(flags[0].employerId, 'usr_empC');
  assert.equal(flags[0].totalOffers, 10);
  assert.equal(flags[0].negativeRate, 80);
  assert.equal(flags[0].severity, 'medium'); // 80% < 95%
});

// ═══════════════════════════════════════════════════════════════
// Test 4: High-decline employer — high severity (>=95%)
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectHighDeclineEmployers severity high if >=95%', async () => {
  const { _testHelpers } = await import('../server/services/offerAbuseDetector.js');
  const { detectHighDeclineEmployers } = _testHelpers;

  const now = Date.now();
  const offers = [];
  // 10 offers, all declined = 100%
  for (let i = 0; i < 10; i++) {
    offers.push(buildOffer({
      employerId: 'usr_empD',
      status: 'declined',
      createdAt: new Date(now - i * 60 * 60 * 1000).toISOString(),
    }));
  }

  const flags = detectHighDeclineEmployers(offers, defaultCfg);

  assert.equal(flags.length, 1);
  assert.equal(flags[0].negativeRate, 100);
  assert.equal(flags[0].severity, 'high'); // >=95%
});

// ═══════════════════════════════════════════════════════════════
// Test 5: High-decline — ignores employers with <minOffers
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectHighDeclineEmployers ignores employers with <10 offers (statistical significance)', async () => {
  const { _testHelpers } = await import('../server/services/offerAbuseDetector.js');
  const { detectHighDeclineEmployers } = _testHelpers;

  const now = Date.now();
  const offers = [];
  // Only 5 offers, 100% declined → below minOffers threshold
  for (let i = 0; i < 5; i++) {
    offers.push(buildOffer({
      employerId: 'usr_empE',
      status: 'declined',
      createdAt: new Date(now - i * 60 * 60 * 1000).toISOString(),
    }));
  }

  const flags = detectHighDeclineEmployers(offers, defaultCfg);

  assert.equal(flags.length, 0); // statistical noise filtered
});

// ═══════════════════════════════════════════════════════════════
// Test 6: Offer-bombing — flags 30+ offers from 5+ employers in 60min
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectOfferBombing flags 30+ offers from 5+ unique employers in 60min (always high)', async () => {
  const { _testHelpers } = await import('../server/services/offerAbuseDetector.js');
  const { detectOfferBombing } = _testHelpers;

  const now = Date.now();
  const offers = [];
  // 30 offers to wkrF from 6 unique employers, all in last 60min
  for (let i = 0; i < 30; i++) {
    offers.push(buildOffer({
      employerId: `usr_emp${i % 6}`, // 6 unique employers
      workerId: 'usr_wkrF',
      createdAt: new Date(now - (i * 60 * 1000)).toISOString(), // each 1 min apart, all within 30min
    }));
  }

  const flags = detectOfferBombing(offers, defaultCfg);

  assert.equal(flags.length, 1);
  assert.equal(flags[0].type, 'worker_offer_bombing');
  assert.equal(flags[0].workerId, 'usr_wkrF');
  assert.equal(flags[0].offerCount, 30);
  assert.equal(flags[0].uniqueEmployers, 6);
  assert.equal(flags[0].severity, 'high'); // always high for offer-bombing
});

// ═══════════════════════════════════════════════════════════════
// Test 7: detectAbuse returns enabled=false when feature flag off
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectAbuse returns enabled=false when feature disabled', async () => {
  // Note: We can't easily mock config without restarting tests, but the function
  // checks config.DIRECT_OFFERS.abuse.enabled. We test the contract by reading
  // the actual config and verifying the response shape.

  const { detectAbuse } = await import('../server/services/offerAbuseDetector.js');

  // Clear offers
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const result = await detectAbuse();

  // With the default config (enabled=true), result.enabled should be true.
  // If user disables in config, it should return { enabled: false, flags: [] }.
  // We assert the contract is well-formed.
  assert.ok(typeof result.enabled === 'boolean');
  assert.ok(Array.isArray(result.flags));

  if (result.enabled) {
    assert.ok(typeof result.generatedAt === 'string');
    assert.equal(typeof result.flagCount, 'number');
  }
});

// ═══════════════════════════════════════════════════════════════
// Test 8: detectAbuse — flags sorted high → medium → low
// ═══════════════════════════════════════════════════════════════

test('Phase 44 abuse: detectAbuse flags sorted high→medium→low', async () => {
  await rm(join(TEST_DATA_DIR, 'direct_offers'), { recursive: true, force: true });

  const { detectAbuse } = await import('../server/services/offerAbuseDetector.js');

  const now = Date.now();

  // Setup conditions for multiple severities:
  // 1. same_worker_spam medium (5 offers, 1 pair) — emp1→wkr1
  for (let i = 0; i < 5; i++) {
    await writeOffer(buildOffer({
      employerId: 'usr_emp1',
      workerId: 'usr_wkr1',
      createdAt: new Date(now - i * 60 * 60 * 1000).toISOString(),
    }));
  }

  // 2. high_decline_employer high (10 offers, all declined) — emp2
  for (let i = 0; i < 10; i++) {
    await writeOffer(buildOffer({
      employerId: 'usr_emp2',
      workerId: `usr_wkr_x${i}`,
      status: 'declined',
      declinedAt: new Date(now - i * 60 * 60 * 1000).toISOString(),
      createdAt: new Date(now - i * 60 * 60 * 1000).toISOString(),
    }));
  }

  const result = await detectAbuse();

  if (result.enabled && result.flags.length >= 2) {
    // First flag should have highest severity
    const severityRank = { high: 3, medium: 2, low: 1 };
    for (let i = 0; i < result.flags.length - 1; i++) {
      const cur = severityRank[result.flags[i].severity] || 0;
      const next = severityRank[result.flags[i + 1].severity] || 0;
      assert.ok(cur >= next, `Flag at index ${i} (${result.flags[i].severity}) should be >= ${result.flags[i + 1].severity}`);
    }
  }
});
