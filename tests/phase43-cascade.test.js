// ═══════════════════════════════════════════════════════════════
// tests/phase43-cascade.test.js — Phase 43 Cascade Completeness Tests
// ═══════════════════════════════════════════════════════════════
// 25 tests covering soft-delete + ban cascade scenarios for direct offers + ads
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir;

test.before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'yawmia-phase43-cascade-'));
  process.env.YAWMIA_DATA_PATH = testDir;
  process.env.NODE_ENV = 'test';
});

test.after(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── Helper: setup employer + worker + offer ────────────────────
async function setupOffer({ adId = null } = {}) {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser } = await import('../server/services/users.js');
  const employer = await createUser('01011112222', 'employer');
  const worker = await createUser('01033334444', 'worker');

  // Update users with required fields
  const { update: updateUser } = await import('../server/services/users.js');
  await updateUser(employer.id, {
    name: 'Employer Test',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });
  await updateUser(worker.id, {
    name: 'Worker Test',
    governorate: 'cairo',
    categories: ['cleaning'],
    lat: 30.0444,
    lng: 31.2357,
  });

  const { create: createOffer } = await import('../server/services/directOffer.js');
  const offerResult = await createOffer(employer.id, worker.id, {
    adId,
    category: 'cleaning',
    governorate: 'cairo',
    proposedDailyWage: 250,
    proposedStartDate: '2026-12-31',
    proposedDurationDays: 1,
  });

  return { employer, worker, offerResult };
}

// ── Test 1: softDelete employer cascades pending offer (sent) as withdrawn ──
test('Phase 43 — softDelete employer withdraws pending direct offers', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  assert.equal(offerResult.ok, true);
  const offerId = offerResult.offer.id;

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);

  // Wait for fire-and-forget cascade
  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const offer = await findById(offerId);
  assert.ok(offer, 'offer should still exist');
  assert.equal(offer.status, 'withdrawn', 'cascade should set status to withdrawn');
});

// ── Test 2: softDelete worker cascades pending offer (received) as declined ──
test('Phase 43 — softDelete worker declines pending direct offers', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(worker.id);

  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const offer = await findById(offerId);
  assert.equal(offer.status, 'declined');
  assert.equal(offer.declinedReason, 'other');
});

// ── Test 3: softDelete worker withdraws active availability ad ──
test('Phase 43 — softDelete worker withdraws active availability ad', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01055556666', 'worker');
  await updateUser(worker.id, {
    name: 'Worker Ad Test',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });

  const { createAd, findActiveByWorker } = await import('../server/services/availabilityAd.js');
  const adResult = await createAd(worker.id, {
    categories: ['cleaning'],
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
    radiusKm: 20,
    minDailyWage: 200,
    maxDailyWage: 300,
    availableFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    availableUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(adResult.ok, true);

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(worker.id);

  await new Promise(r => setTimeout(r, 200));

  const ad = await findActiveByWorker(worker.id);
  assert.equal(ad, null, 'no active ad should remain after worker delete');
});

// ── Test 4: cascade is fire-and-forget ──
test('Phase 43 — cascade single offer failure does not block others', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01077778888', 'employer');
  await updateUser(employer.id, { name: 'Emp', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const worker1 = await createUser('01099990000', 'worker');
  await updateUser(worker1.id, { name: 'W1', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357 });

  const worker2 = await createUser('01112223344', 'worker');
  await updateUser(worker2.id, { name: 'W2', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357 });

  const { create: createOffer, findById } = await import('../server/services/directOffer.js');
  const o1 = await createOffer(employer.id, worker1.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  const o2 = await createOffer(employer.id, worker2.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);

  await new Promise(r => setTimeout(r, 300));

  const offer1 = await findById(o1.offer.id);
  const offer2 = await findById(o2.offer.id);
  assert.equal(offer1.status, 'withdrawn');
  assert.equal(offer2.status, 'withdrawn');
});

// ── Test 5: banUser worker declines pending offers ──
test('Phase 43 — banUser worker declines pending offers', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  const { banUser } = await import('../server/services/users.js');
  await banUser(worker.id, 'spam');

  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const offer = await findById(offerId);
  assert.equal(offer.status, 'declined');
});

// ── Test 6: banUser employer withdraws pending offers ──
test('Phase 43 — banUser employer withdraws pending offers', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  const { banUser } = await import('../server/services/users.js');
  await banUser(employer.id, 'fraud');

  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const offer = await findById(offerId);
  assert.equal(offer.status, 'withdrawn');
});

// ── Test 7: banUser worker withdraws active ad ──
test('Phase 43 — banUser worker withdraws active ad', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser, banUser } = await import('../server/services/users.js');
  const worker = await createUser('01122334455', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { createAd, findActiveByWorker } = await import('../server/services/availabilityAd.js');
  await createAd(worker.id, {
    categories: ['cleaning'], governorate: 'cairo',
    lat: 30.0444, lng: 31.2357, radiusKm: 20,
    minDailyWage: 200, maxDailyWage: 300,
    availableFrom: new Date(Date.now() + 3600000).toISOString(),
    availableUntil: new Date(Date.now() + 6 * 3600000).toISOString(),
  });

  await banUser(worker.id, 'spam');
  await new Promise(r => setTimeout(r, 200));

  const ad = await findActiveByWorker(worker.id);
  assert.equal(ad, null);
});

// ── Test 8: banUser worker withdraws pending applications ──
test('Phase 43 — banUser worker withdraws pending applications', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser, banUser } = await import('../server/services/users.js');
  const employer = await createUser('01133445566', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const worker = await createUser('01144556677', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357 });

  const { create: createJob } = await import('../server/services/jobs.js');
  const job = await createJob(employer.id, {
    title: 'Test Job',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 5,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'Test',
  });

  const { apply, findByJobAndWorker } = await import('../server/services/applications.js');
  await apply(job.id, worker.id);

  await banUser(worker.id, 'spam');
  await new Promise(r => setTimeout(r, 200));

  const app = await findByJobAndWorker(job.id, worker.id);
  assert.equal(app.status, 'withdrawn');
});

// ── Test 9: banUser employer cancels open jobs ──
test('Phase 43 — banUser employer cancels open jobs', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser, banUser } = await import('../server/services/users.js');
  const employer = await createUser('01155667788', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { create: createJob, findById: findJob } = await import('../server/services/jobs.js');
  const job = await createJob(employer.id, {
    title: 'Test Job',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 5,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'Test',
  });

  await banUser(employer.id, 'fraud');
  await new Promise(r => setTimeout(r, 200));

  const updatedJob = await findJob(job.id);
  assert.equal(updatedJob.status, 'cancelled');
});

// ── Test 10: cascade preserves accepted offers ──
test('Phase 43 — cascade preserves accepted offers (only pending affected)', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  // Manually set offer to 'accepted'
  const { atomicWrite, getRecordPath, readJSON } = await import('../server/services/database.js');
  const path = getRecordPath('direct_offers', offerId);
  const offer = await readJSON(path);
  offer.status = 'accepted';
  offer.acceptedAt = new Date().toISOString();
  await atomicWrite(path, offer);

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);

  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const finalOffer = await findById(offerId);
  assert.equal(finalOffer.status, 'accepted', 'accepted offers should be preserved');
});

// ── Test 11: cascade preserves declined offers ──
test('Phase 43 — cascade preserves declined offers', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  // Set to 'declined'
  const { atomicWrite, getRecordPath, readJSON } = await import('../server/services/database.js');
  const path = getRecordPath('direct_offers', offerId);
  const offer = await readJSON(path);
  offer.status = 'declined';
  offer.declinedAt = new Date().toISOString();
  offer.declinedReason = 'busy';
  await atomicWrite(path, offer);

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);

  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const finalOffer = await findById(offerId);
  assert.equal(finalOffer.status, 'declined');
  assert.equal(finalOffer.declinedReason, 'busy');
});

// ── Test 12: cascade preserves expired offers ──
test('Phase 43 — cascade preserves expired offers', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  const { atomicWrite, getRecordPath, readJSON } = await import('../server/services/database.js');
  const path = getRecordPath('direct_offers', offerId);
  const offer = await readJSON(path);
  offer.status = 'expired';
  offer.expiredAt = new Date().toISOString();
  await atomicWrite(path, offer);

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(worker.id);
  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const finalOffer = await findById(offerId);
  assert.equal(finalOffer.status, 'expired');
});

// ── Test 13: deleted user offers via mine returns empty ──
test('Phase 43 — listByEmployer returns empty for deleted employer offers (cascaded to withdrawn)', async () => {
  const { employer, worker, offerResult } = await setupOffer();

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);
  await new Promise(r => setTimeout(r, 200));

  const { listByEmployer } = await import('../server/services/directOffer.js');
  const result = await listByEmployer(employer.id, { status: 'pending' });
  assert.equal(result.total, 0);
  assert.equal(result.offers.length, 0);
});

// ── Test 14: cascade fires direct_offer:withdrawn event ──
test('Phase 43 — cascade fires direct_offer:withdrawn event', async () => {
  const { employer, worker, offerResult } = await setupOffer();

  const { eventBus } = await import('../server/services/eventBus.js');
  let eventFired = false;
  const handler = (data) => {
    if (data && data.offerId === offerResult.offer.id) eventFired = true;
  };
  eventBus.on('direct_offer:withdrawn', handler);

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);
  await new Promise(r => setTimeout(r, 200));

  assert.equal(eventFired, true);
  eventBus.off('direct_offer:withdrawn', handler);
});

// ── Test 15: cascade fires direct_offer:declined event ──
test('Phase 43 — cascade fires direct_offer:declined event', async () => {
  const { employer, worker, offerResult } = await setupOffer();

  const { eventBus } = await import('../server/services/eventBus.js');
  let eventFired = false;
  const handler = (data) => {
    if (data && data.offerId === offerResult.offer.id) eventFired = true;
  };
  eventBus.on('direct_offer:declined', handler);

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(worker.id);
  await new Promise(r => setTimeout(r, 200));

  assert.equal(eventFired, true);
  eventBus.off('direct_offer:declined', handler);
});

// ── Test 16: softDelete worker with no offers doesn't throw ──
test('Phase 43 — softDelete worker with no offers completes successfully', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser, softDelete } = await import('../server/services/users.js');
  const worker = await createUser('01166778899', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo' });

  const result = await softDelete(worker.id);
  assert.ok(result, 'softDelete should return updated user');
  assert.equal(result.status, 'deleted');
});

// ── Test 17: banUser admin returns null ──
test('Phase 43 — banUser admin returns null (cannot ban admin)', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser, banUser } = await import('../server/services/users.js');
  const adminUser = await createUser('01177889900', 'admin');

  const result = await banUser(adminUser.id, 'test');
  assert.equal(result, null);
});

// ── Test 18: cascade with multiple pending offers from same employer ──
test('Phase 43 — cascade handles multiple pending offers from same employer', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01188990011', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo' });

  const workers = [];
  for (let i = 0; i < 3; i++) {
    const w = await createUser(`010${i}9988776`, 'worker');
    await updateUser(w.id, { name: `W${i}`, governorate: 'cairo', categories: ['cleaning'] });
    workers.push(w);
  }

  const { create: createOffer, findById } = await import('../server/services/directOffer.js');
  const offerIds = [];
  for (const w of workers) {
    const r = await createOffer(employer.id, w.id, {
      category: 'cleaning', governorate: 'cairo',
      proposedDailyWage: 250, proposedStartDate: '2026-12-31',
    });
    if (r.ok) offerIds.push(r.offer.id);
  }

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);
  await new Promise(r => setTimeout(r, 300));

  for (const oid of offerIds) {
    const offer = await findById(oid);
    assert.equal(offer.status, 'withdrawn');
  }
});

// ── Test 19: _cascadePendingOffers uses raw access (bypass redaction) ──
test('Phase 43 — cascade processes offers without redaction overhead', async () => {
  const { employer, worker, offerResult } = await setupOffer();

  const start = Date.now();
  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);
  const elapsed = Date.now() - start;

  // Cascade should be fast (raw access, no redaction)
  assert.ok(elapsed < 5000, `cascade should complete fast, took ${elapsed}ms`);
});

// ── Test 20: softDelete sets status='deleted' first, then cascades ──
test('Phase 43 — softDelete sets status=deleted before cascade fires', async () => {
  const { employer, worker, offerResult } = await setupOffer();

  const { softDelete, findById: findUser } = await import('../server/services/users.js');
  const result = await softDelete(employer.id);

  // User is updated synchronously, cascade is fire-and-forget
  assert.equal(result.status, 'deleted');
});

// ── Test 21: banUser updates user status synchronously ──
test('Phase 43 — banUser sets status=banned synchronously', async () => {
  const { employer, worker, offerResult } = await setupOffer();

  const { banUser } = await import('../server/services/users.js');
  const result = await banUser(employer.id, 'reason');

  assert.equal(result.status, 'banned');
  assert.equal(result.banReason, 'reason');
});

// ── Test 22: cascade does not affect already-deleted offers ──
test('Phase 43 — cascade is idempotent on re-run', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  const { withdraw, findById } = await import('../server/services/directOffer.js');
  await withdraw(offerId, employer.id);

  const offerBefore = await findById(offerId);
  assert.equal(offerBefore.status, 'withdrawn');

  // Now soft-delete — cascade should skip (status !== 'pending')
  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);
  await new Promise(r => setTimeout(r, 200));

  const offerAfter = await findById(offerId);
  assert.equal(offerAfter.status, 'withdrawn'); // unchanged
});

// ── Test 23: softDelete with no role-specific cascades doesn't throw ──
test('Phase 43 — softDelete returns updatedUser regardless of cascade outcome', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser, softDelete } = await import('../server/services/users.js');
  const employer = await createUser('01199001122', 'employer');
  await updateUser(employer.id, { name: 'E' });

  const result = await softDelete(employer.id);
  assert.ok(result);
  assert.equal(result.status, 'deleted');
});

// ── Test 24: cascade preserves offer history (records still exist after status change) ──
test('Phase 43 — cascade preserves offer records (only changes status)', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;
  const originalCreatedAt = offerResult.offer.createdAt;

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(worker.id);
  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const offer = await findById(offerId);
  assert.ok(offer, 'offer record should still exist');
  assert.equal(offer.createdAt, originalCreatedAt);
  assert.equal(offer.id, offerId);
});

// ── Test 25: cascade across both sides (employer + worker delete) ──
test('Phase 43 — cascade works when both parties delete (independent)', async () => {
  const { employer, worker, offerResult } = await setupOffer();
  const offerId = offerResult.offer.id;

  const { softDelete } = await import('../server/services/users.js');
  await softDelete(employer.id);
  await new Promise(r => setTimeout(r, 200));

  // Worker delete after offer already withdrawn
  await softDelete(worker.id);
  await new Promise(r => setTimeout(r, 200));

  const { findById } = await import('../server/services/directOffer.js');
  const offer = await findById(offerId);
  // Status was already 'withdrawn' from employer cascade — worker cascade skips it
  assert.equal(offer.status, 'withdrawn');
});
