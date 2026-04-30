// ═══════════════════════════════════════════════════════════════
// tests/phase43-resync.test.js — Phase 43 Ad Re-Sync Hardening
// ═══════════════════════════════════════════════════════════════
// 8 tests covering ensureMarkedAsMatched + reconciliation listener
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir;

test.before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'yawmia-phase43-resync-'));
  process.env.YAWMIA_DATA_PATH = testDir;
  process.env.NODE_ENV = 'test';
});

test.after(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── Helper ────────────────────────────────────────────
async function setupAd() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01040506070', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { createAd } = await import('../server/services/availabilityAd.js');
  const adResult = await createAd(worker.id, {
    categories: ['cleaning'], governorate: 'cairo',
    lat: 30.0444, lng: 31.2357, radiusKm: 20,
    minDailyWage: 200, maxDailyWage: 300,
    availableFrom: new Date(Date.now() + 3600000).toISOString(),
    availableUntil: new Date(Date.now() + 6 * 3600000).toISOString(),
  });

  return { worker, ad: adResult.ad };
}

// ── Test 1: ensureMarkedAsMatched is idempotent — same call twice ──
test('Phase 43 — ensureMarkedAsMatched is idempotent (same job twice)', async () => {
  const { ad } = await setupAd();
  const { ensureMarkedAsMatched } = await import('../server/services/availabilityAd.js');

  const r1 = await ensureMarkedAsMatched(ad.id, 'job_xxx');
  assert.equal(r1.ok, true);
  assert.equal(r1.alreadyMatched, false);

  const r2 = await ensureMarkedAsMatched(ad.id, 'job_xxx');
  assert.equal(r2.ok, true);
  assert.equal(r2.alreadyMatched, true);
});

// ── Test 2: ensureMarkedAsMatched detects different-jobId conflict ──
test('Phase 43 — ensureMarkedAsMatched returns false on different-jobId conflict', async () => {
  const { ad } = await setupAd();
  const { ensureMarkedAsMatched } = await import('../server/services/availabilityAd.js');

  const r1 = await ensureMarkedAsMatched(ad.id, 'job_first');
  assert.equal(r1.ok, true);

  const r2 = await ensureMarkedAsMatched(ad.id, 'job_second');
  assert.equal(r2.ok, false, 'conflict detected — preserve older state');
});

// ── Test 3: ensureMarkedAsMatched returns false for non-existent ad ──
test('Phase 43 — ensureMarkedAsMatched returns false for missing ad', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { ensureMarkedAsMatched } = await import('../server/services/availabilityAd.js');
  const result = await ensureMarkedAsMatched('aad_nonexistent', 'job_xxx');
  assert.equal(result.ok, false);
});

// ── Test 4: ensureMarkedAsMatched fires ad:matched event on first match ──
test('Phase 43 — ensureMarkedAsMatched fires ad:matched event on transition', async () => {
  const { ad } = await setupAd();

  const { eventBus } = await import('../server/services/eventBus.js');
  let eventFired = false;
  let eventData = null;
  const handler = (data) => {
    if (data && data.adId === ad.id) {
      eventFired = true;
      eventData = data;
    }
  };
  eventBus.on('ad:matched', handler);

  const { ensureMarkedAsMatched } = await import('../server/services/availabilityAd.js');
  await ensureMarkedAsMatched(ad.id, 'job_evt_test');

  await new Promise(r => setTimeout(r, 50));

  assert.equal(eventFired, true);
  assert.equal(eventData.jobId, 'job_evt_test');
  eventBus.off('ad:matched', handler);
});

// ── Test 5: ensureMarkedAsMatched does NOT fire event on idempotent re-run ──
test('Phase 43 — ensureMarkedAsMatched does NOT re-emit on alreadyMatched', async () => {
  const { ad } = await setupAd();

  const { ensureMarkedAsMatched } = await import('../server/services/availabilityAd.js');
  await ensureMarkedAsMatched(ad.id, 'job_first_call');

  // Setup listener AFTER first call
  const { eventBus } = await import('../server/services/eventBus.js');
  let eventFired = false;
  const handler = () => { eventFired = true; };
  eventBus.on('ad:matched', handler);

  await ensureMarkedAsMatched(ad.id, 'job_first_call');
  await new Promise(r => setTimeout(r, 50));

  assert.equal(eventFired, false, 'idempotent re-run should NOT re-emit');
  eventBus.off('ad:matched', handler);
});

// ── Test 6: tryAccept uses ensureMarkedAsMatched (verify ad gets matched) ──
test('Phase 43 — tryAccept uses ensureMarkedAsMatched and marks ad correctly', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01030405060', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357 });

  const employer = await createUser('01020304050', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { createAd, findById: findAd } = await import('../server/services/availabilityAd.js');
  const adResult = await createAd(worker.id, {
    categories: ['cleaning'], governorate: 'cairo',
    lat: 30.0444, lng: 31.2357, radiusKm: 20,
    minDailyWage: 200, maxDailyWage: 300,
    availableFrom: new Date(Date.now() + 3600000).toISOString(),
    availableUntil: new Date(Date.now() + 6 * 3600000).toISOString(),
  });

  const { create: createOffer, tryAccept } = await import('../server/services/directOffer.js');
  const offerResult = await createOffer(employer.id, worker.id, {
    adId: adResult.ad.id,
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  const acceptResult = await tryAccept(offerResult.offer.id, worker.id);
  assert.equal(acceptResult.ok, true);

  // Wait for any pending writes
  await new Promise(r => setTimeout(r, 100));

  const ad = await findAd(adResult.ad.id);
  assert.equal(ad.status, 'matched');
  assert.equal(ad.matchedJobId, acceptResult.jobId);
});

// ── Test 7: Reconciliation listener re-syncs ad after 5s ──
test('Phase 43 — reconciliation listener triggers ensureMarkedAsMatched on direct_offer:accepted', async () => {
  const { ad, worker } = await setupAd();
  const adId = ad.id;
  const fakeJobId = 'job_reconcile_test';

  // Setup listener manually (simulate setupDirectOfferListeners behavior)
  const { eventBus } = await import('../server/services/eventBus.js');
  const { setupDirectOfferListeners } = await import('../server/services/directOffer.js');
  setupDirectOfferListeners();

  // Manually emit direct_offer:accepted
  eventBus.emit('direct_offer:accepted', {
    offerId: 'dof_test_xxx',
    employerId: 'emp_test',
    workerId: worker.id,
    jobId: fakeJobId,
    adId: adId,
  });

  // Wait > 5s for delayed reconciliation
  await new Promise(r => setTimeout(r, 5500));

  const { findById: findAd } = await import('../server/services/availabilityAd.js');
  const updatedAd = await findAd(adId);
  assert.equal(updatedAd.status, 'matched');
  assert.equal(updatedAd.matchedJobId, fakeJobId);
});

// ── Test 8: Reconciliation listener skips events without adId ──
test('Phase 43 — reconciliation listener skips events without adId', async () => {
  const { ad } = await setupAd();
  const adId = ad.id;

  const { eventBus } = await import('../server/services/eventBus.js');
  const { setupDirectOfferListeners } = await import('../server/services/directOffer.js');
  setupDirectOfferListeners();

  // Emit event without adId (offer not linked to ad)
  eventBus.emit('direct_offer:accepted', {
    offerId: 'dof_no_ad',
    employerId: 'emp_x',
    workerId: 'wrk_x',
    jobId: 'job_no_ad',
    adId: null, // ← no ad linkage
  });

  await new Promise(r => setTimeout(r, 5500));

  // Ad should remain unchanged (still active)
  const { findById: findAd } = await import('../server/services/availabilityAd.js');
  const updatedAd = await findAd(adId);
  assert.equal(updatedAd.status, 'active', 'ad without linkage should not be touched');
});
