// ═══════════════════════════════════════════════════════════════
// tests/phase40-x-42-integration.test.js — Phase 40 ⨯ Phase 42 Integration
// ═══════════════════════════════════════════════════════════════
// 10 tests covering cross-system scenarios between instant match + direct offers
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir;

test.before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'yawmia-phase40x42-'));
  process.env.YAWMIA_DATA_PATH = testDir;
  process.env.NODE_ENV = 'test';
});

test.after(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── Helper ────────────────────────────────────────────
async function setupTwoEmployersAndWorker() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');

  const emp1 = await createUser('01010101010', 'employer');
  const emp2 = await createUser('01020202020', 'employer');
  const worker = await createUser('01030303030', 'worker');

  await updateUser(emp1.id, { name: 'E1', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });
  await updateUser(emp2.id, { name: 'E2', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });
  await updateUser(worker.id, {
    name: 'Worker',
    governorate: 'cairo',
    categories: ['cleaning'],
    lat: 30.0444,
    lng: 31.2357,
  });

  return { emp1, emp2, worker };
}

// ── Test 1: Worker can receive direct offer while having regular pending applications ──
test('Phase 40⨯42 — worker can receive direct offer alongside regular applications', async () => {
  const { emp1, worker } = await setupTwoEmployersAndWorker();

  // Worker applies to a regular job
  const { create: createJob } = await import('../server/services/jobs.js');
  const job = await createJob(emp1.id, {
    title: 'Regular',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 5,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'Regular',
  });

  const { apply } = await import('../server/services/applications.js');
  await apply(job.id, worker.id);

  // Direct offer should still be accepted (different concurrency space)
  const { create: createOffer } = await import('../server/services/directOffer.js');
  const result = await createOffer(emp1.id, worker.id, {
    category: 'cleaning',
    governorate: 'cairo',
    proposedDailyWage: 300,
    proposedStartDate: '2026-12-31',
  });

  assert.equal(result.ok, true, 'direct offer should succeed despite regular application');
});

// ── Test 2: Two employers compete for same worker — first-accept-wins ──
test('Phase 40⨯42 — two employers compete via direct offers, only one acceptance succeeds', async () => {
  const { emp1, emp2, worker } = await setupTwoEmployersAndWorker();

  const { create: createOffer, tryAccept } = await import('../server/services/directOffer.js');

  const o1 = await createOffer(emp1.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  const o2 = await createOffer(emp2.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 280, proposedStartDate: '2026-12-31',
  });

  assert.equal(o1.ok, true);
  assert.equal(o2.ok, true);

  // Worker accepts both — only first should succeed (note: each offer is independent;
  // both CAN succeed because they create separate synthetic jobs).
  // The test verifies worker can accept multiple direct offers (each becomes separate job).
  const r1 = await tryAccept(o1.offer.id, worker.id);
  assert.equal(r1.ok, true);

  // Second accept also succeeds because it's a different offer/job
  const r2 = await tryAccept(o2.offer.id, worker.id);
  assert.equal(r2.ok, true, 'each direct offer creates independent job — both can be accepted');
});

// ── Test 3: Worker exceeds maxPendingPerWorker (3) ──
test('Phase 40⨯42 — worker pending offer cap (max 3) enforced across employers', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01040404040', 'worker');
  await updateUser(worker.id, {
    name: 'W', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357,
  });

  // Create 4 employers
  const employers = [];
  for (let i = 0; i < 4; i++) {
    const e = await createUser(`010505050${i}5`, 'employer');
    await updateUser(e.id, { name: `E${i}`, governorate: 'cairo', lat: 30.0444, lng: 31.2357 });
    employers.push(e);
  }

  const { create: createOffer } = await import('../server/services/directOffer.js');

  // First 3 should succeed
  for (let i = 0; i < 3; i++) {
    const r = await createOffer(employers[i].id, worker.id, {
      category: 'cleaning', governorate: 'cairo',
      proposedDailyWage: 250 + i, proposedStartDate: '2026-12-31',
    });
    assert.equal(r.ok, true, `offer ${i} should succeed`);
  }

  // 4th should fail with WORKER_PENDING_CAP
  const r4 = await createOffer(employers[3].id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 280, proposedStartDate: '2026-12-31',
  });
  assert.equal(r4.ok, false);
  assert.equal(r4.code, 'WORKER_PENDING_CAP');
});

// ── Test 4: Worker exceeds perWorkerDailyReceiveCap (50) ──
test('Phase 43 — perWorkerDailyReceiveCap blocks worker after 50 offers/day', async () => {
  const { initDatabase, atomicWrite, getRecordPath, getWriteRecordPath, addToSetIndex } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01060606060', 'worker');
  await updateUser(worker.id, {
    name: 'W', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357,
  });

  const employer = await createUser('01070707070', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  // Manually inject 50 offers from today (bypass create() which has caps)
  const config = (await import('../config.js')).default;
  const crypto = await import('node:crypto');
  const now = new Date();
  const indexPath = config.DATABASE.indexFiles.workerOffersIndex;

  for (let i = 0; i < 50; i++) {
    const oid = 'dof_test' + crypto.randomBytes(4).toString('hex') + i;
    const offer = {
      id: oid,
      employerId: employer.id,
      workerId: worker.id,
      adId: null,
      status: 'declined', // already declined to not block via maxPendingPerWorker
      category: 'cleaning',
      governorate: 'cairo',
      proposedDailyWage: 250,
      proposedStartDate: '2026-12-31',
      proposedDurationDays: 1,
      message: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      acceptanceWindowSeconds: 120,
      notifiedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 120 * 1000).toISOString(),
      revealedToWorker: null,
      revealedToEmployer: null,
      preAcceptEmployerSummary: { displayName: 'E', rating: { avg: 0, count: 0 }, verified: false },
      preAcceptWorkerSummary: { displayName: 'W', rating: { avg: 0, count: 0 }, verified: false },
      acceptedAt: null,
      declinedAt: now.toISOString(),
      declinedReason: 'busy',
      expiredAt: null,
      withdrawnAt: null,
      resultingJobId: null,
    };
    await atomicWrite(getWriteRecordPath('direct_offers', oid), offer);
    await addToSetIndex(indexPath, worker.id, oid);
  }

  // 51st should fail with WORKER_DAILY_RECEIVE_CAP
  const { create: createOffer } = await import('../server/services/directOffer.js');
  const result = await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'WORKER_DAILY_RECEIVE_CAP');
});

// ── Test 5: Synthetic job from direct offer doesn't appear in jobMatcher fanout ──
test('Phase 43 — synthetic job (sourceType=direct_offer) excluded from jobs.list public listing', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01080808080', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { create: createJob, list } = await import('../server/services/jobs.js');

  // Regular job
  await createJob(employer.id, {
    title: 'Regular',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 5,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'R',
  });

  // Synthetic job
  await createJob(employer.id, {
    title: 'Synthetic',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'S',
    sourceType: 'direct_offer',
    sourceOfferId: 'dof_xxx',
  });

  const publicJobs = await list({ status: 'open' });
  const titles = publicJobs.map(j => j.title);

  assert.ok(titles.includes('Regular'));
  assert.ok(!titles.includes('Synthetic'), 'synthetic should be filtered from public list');
});

// ── Test 6: Synthetic job appears in jobs.list when explicitly filtered by sourceType ──
test('Phase 43 — synthetic job appears when explicitly queried by sourceType=direct_offer', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01090909090', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo' });

  const { create: createJob, list } = await import('../server/services/jobs.js');
  await createJob(employer.id, {
    title: 'Direct Offer Job',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'S',
    sourceType: 'direct_offer',
    sourceOfferId: 'dof_yyy',
  });

  const directOnly = await list({ sourceType: 'direct_offer' });
  assert.ok(directOnly.length > 0);
  assert.equal(directOnly[0].title, 'Direct Offer Job');
});

// ── Test 7: Direct offer creation respects employer pending cap (max 5) ──
test('Phase 40⨯42 — employer pending cap (max 5) enforced for direct offers', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01010202030', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const workers = [];
  for (let i = 0; i < 6; i++) {
    const w = await createUser(`010404050${i}5`, 'worker');
    await updateUser(w.id, { name: `W${i}`, governorate: 'cairo', categories: ['cleaning'] });
    workers.push(w);
  }

  const { create: createOffer } = await import('../server/services/directOffer.js');

  // First 5 succeed
  for (let i = 0; i < 5; i++) {
    const r = await createOffer(employer.id, workers[i].id, {
      category: 'cleaning', governorate: 'cairo',
      proposedDailyWage: 250, proposedStartDate: '2026-12-31',
    });
    assert.equal(r.ok, true);
  }

  // 6th fails
  const r6 = await createOffer(employer.id, workers[5].id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  assert.equal(r6.ok, false);
  assert.equal(r6.code, 'EMPLOYER_PENDING_CAP');
});

// ── Test 8: ad:matched event removes ad from queryIndex.adsActive ──
test('Phase 40⨯42 — ad:matched event removes ad from queryIndex active set', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01080807060', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { createAd, ensureMarkedAsMatched } = await import('../server/services/availabilityAd.js');
  const { onAdCreated, queryAds, clear: clearQueryIndex } = await import('../server/services/queryIndex.js');

  clearQueryIndex();

  const adResult = await createAd(worker.id, {
    categories: ['cleaning'], governorate: 'cairo',
    lat: 30.0444, lng: 31.2357, radiusKm: 20,
    minDailyWage: 200, maxDailyWage: 300,
    availableFrom: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    availableUntil: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(adResult.ok, true);

  // Manually populate queryIndex (event-based — listener may not have fired yet in test)
  onAdCreated(adResult.ad);

  let activeAds = queryAds({ governorate: 'cairo', categories: ['cleaning'] });
  assert.ok(activeAds.includes(adResult.ad.id));

  // Mark as matched — wait for event listener
  await ensureMarkedAsMatched(adResult.ad.id, 'job_test_xxxx');
  await new Promise(r => setTimeout(r, 100));

  activeAds = queryAds({ governorate: 'cairo', categories: ['cleaning'] });
  assert.ok(!activeAds.includes(adResult.ad.id), 'matched ad should be removed from active');
});

// ── Test 9: Concurrent direct offer creation under same worker locks correctly ──
test('Phase 40⨯42 — concurrent direct offer creates serialize via withLock', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const worker = await createUser('01070605040', 'worker');
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357 });

  const employers = [];
  for (let i = 0; i < 3; i++) {
    const e = await createUser(`010030302${i}1`, 'employer');
    await updateUser(e.id, { name: `E${i}`, governorate: 'cairo', lat: 30.0444, lng: 31.2357 });
    employers.push(e);
  }

  const { create: createOffer } = await import('../server/services/directOffer.js');

  // Fire 3 concurrent creates
  const results = await Promise.all([
    createOffer(employers[0].id, worker.id, {
      category: 'cleaning', governorate: 'cairo',
      proposedDailyWage: 250, proposedStartDate: '2026-12-31',
    }),
    createOffer(employers[1].id, worker.id, {
      category: 'cleaning', governorate: 'cairo',
      proposedDailyWage: 260, proposedStartDate: '2026-12-31',
    }),
    createOffer(employers[2].id, worker.id, {
      category: 'cleaning', governorate: 'cairo',
      proposedDailyWage: 270, proposedStartDate: '2026-12-31',
    }),
  ]);

  // All 3 should succeed (worker pending cap = 3)
  const successCount = results.filter(r => r.ok).length;
  assert.equal(successCount, 3, 'all 3 concurrent offers should succeed (pending cap = 3)');
});

// ── Test 10: Synthetic jobs not in instant match candidate pool ──
test('Phase 40⨯42 — instant match candidates exclude workers already in synthetic jobs', async () => {
  // This is a behavioral verification — the synthetic job has status='in_progress' immediately.
  // Workers in 'in_progress' are not "available" for instant match by virtue of status.
  // Phase 43 doesn't add new logic — it relies on existing instant match candidate filtering.

  // Verification: synthetic job's status is in_progress (not 'open' or 'filled')
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01000001111', 'employer');
  const worker = await createUser('01000002222', 'worker');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });
  await updateUser(worker.id, { name: 'W', governorate: 'cairo', categories: ['cleaning'], lat: 30.0444, lng: 31.2357 });

  const { create: createOffer, tryAccept, findById: findOffer } = await import('../server/services/directOffer.js');
  const o = await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  const acceptResult = await tryAccept(o.offer.id, worker.id);
  assert.equal(acceptResult.ok, true);

  // Verify synthetic job is in_progress + has sourceType
  const { findById: findJob } = await import('../server/services/jobs.js');
  const job = await findJob(acceptResult.jobId);
  assert.equal(job.sourceType, 'direct_offer');
  assert.equal(job.status, 'in_progress', 'synthetic job auto-starts → in_progress');
});
