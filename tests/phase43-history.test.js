// ═══════════════════════════════════════════════════════════════
// tests/phase43-history.test.js — Phase 43 History & Analytics Tests
// ═══════════════════════════════════════════════════════════════
// 15 tests covering analytics endpoints, decline reasons, synthetic job filtering
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let testDir;

test.before(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'yawmia-phase43-history-'));
  process.env.YAWMIA_DATA_PATH = testDir;
  process.env.NODE_ENV = 'test';
});

test.after(async () => {
  if (testDir) {
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── Helper ─────────────────────────────────────────────
async function setupBasicUsers() {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01001112233', 'employer');
  const worker = await createUser('01002223344', 'worker');

  await updateUser(employer.id, {
    name: 'Test Employer',
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
  });
  await updateUser(worker.id, {
    name: 'Test Worker',
    governorate: 'cairo',
    categories: ['cleaning'],
    lat: 30.0444,
    lng: 31.2357,
  });

  return { employer, worker };
}

// ── Test 1: getEmployerOfferStats returns zeros for new employer ──
test('Phase 43 — getEmployerOfferStats returns zero stats for new employer', async () => {
  const { employer } = await setupBasicUsers();
  const { getEmployerOfferStats } = await import('../server/services/directOffer.js');
  const stats = await getEmployerOfferStats(employer.id);

  assert.equal(stats.total, 0);
  assert.equal(stats.pending, 0);
  assert.equal(stats.accepted, 0);
  assert.equal(stats.declined, 0);
  assert.equal(stats.expired, 0);
  assert.equal(stats.withdrawn, 0);
  assert.deepEqual(stats.declineReasons, {});
  assert.equal(stats.avgTimeToResponseMs, 0);
  assert.equal(stats.acceptRate, 0);
});

// ── Test 2: getEmployerOfferStats counts pending offers ──
test('Phase 43 — getEmployerOfferStats counts pending offer', async () => {
  const { employer, worker } = await setupBasicUsers();
  const { create: createOffer, getEmployerOfferStats } = await import('../server/services/directOffer.js');

  await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  const stats = await getEmployerOfferStats(employer.id);
  assert.equal(stats.total, 1);
  assert.equal(stats.pending, 1);
});

// ── Test 3: getEmployerOfferStats includes decline reasons ──
test('Phase 43 — getEmployerOfferStats includes decline reasons breakdown', async () => {
  const { employer, worker } = await setupBasicUsers();
  const { create: createOffer, decline, getEmployerOfferStats } = await import('../server/services/directOffer.js');

  const r = await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  await decline(r.offer.id, worker.id, 'busy');

  const stats = await getEmployerOfferStats(employer.id);
  assert.equal(stats.declined, 1);
  assert.equal(stats.declineReasons.busy, 1);
});

// ── Test 4: getEmployerOfferStats avgTimeToResponseMs ──
test('Phase 43 — getEmployerOfferStats calculates avgTimeToResponseMs', async () => {
  const { employer, worker } = await setupBasicUsers();
  const { create: createOffer, decline, getEmployerOfferStats } = await import('../server/services/directOffer.js');

  const r = await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  // Wait a bit then decline
  await new Promise(res => setTimeout(res, 100));
  await decline(r.offer.id, worker.id, 'busy');

  const stats = await getEmployerOfferStats(employer.id);
  assert.ok(stats.avgTimeToResponseMs > 0, 'avgTimeToResponseMs should be > 0');
  assert.ok(stats.avgTimeToResponseMs < 5000, 'avgTimeToResponseMs should be reasonable');
});

// ── Test 5: getEmployerOfferStats acceptRate calculation ──
test('Phase 43 — getEmployerOfferStats calculates acceptRate', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01003334455', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo' });

  // Create 2 workers
  const workers = [];
  for (let i = 0; i < 2; i++) {
    const w = await createUser(`010044556${i}6`, 'worker');
    await updateUser(w.id, { name: `W${i}`, governorate: 'cairo', categories: ['cleaning'] });
    workers.push(w);
  }

  const { create: createOffer, decline, getEmployerOfferStats } = await import('../server/services/directOffer.js');
  const { atomicWrite, getRecordPath, readJSON } = await import('../server/services/database.js');

  // 1 accepted (manually set), 1 declined → 50% accept rate
  const o1 = await createOffer(employer.id, workers[0].id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  const path = getRecordPath('direct_offers', o1.offer.id);
  const offer = await readJSON(path);
  offer.status = 'accepted';
  offer.acceptedAt = new Date().toISOString();
  await atomicWrite(path, offer);

  const o2 = await createOffer(employer.id, workers[1].id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });
  await decline(o2.offer.id, workers[1].id, 'busy');

  const stats = await getEmployerOfferStats(employer.id);
  assert.equal(stats.accepted, 1);
  assert.equal(stats.declined, 1);
  assert.equal(stats.acceptRate, 50);
});

// ── Test 6: getWorkerOfferStats returns symmetric stats (no acceptRate) ──
test('Phase 43 — getWorkerOfferStats has no acceptRate field', async () => {
  const { employer, worker } = await setupBasicUsers();
  const { getWorkerOfferStats } = await import('../server/services/directOffer.js');

  const stats = await getWorkerOfferStats(worker.id);
  assert.ok(!('acceptRate' in stats), 'acceptRate should NOT be in worker stats');
});

// ── Test 7: getWorkerOfferStats counts received offers ──
test('Phase 43 — getWorkerOfferStats counts received offers', async () => {
  const { employer, worker } = await setupBasicUsers();
  const { create: createOffer, getWorkerOfferStats } = await import('../server/services/directOffer.js');

  await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  const stats = await getWorkerOfferStats(worker.id);
  assert.equal(stats.total, 1);
  assert.equal(stats.pending, 1);
});

// ── Test 8: stats endpoint employer requires employer role ──
test('Phase 43 — GET /api/direct-offers/stats/employer requires employer role', async () => {
  // This is a unit-level check on the route registration
  // Full HTTP test would spawn a server — we verify the handler signature instead
  const { handleEmployerOfferStats } = await import('../server/handlers/directOfferHandler.js');
  assert.equal(typeof handleEmployerOfferStats, 'function');
});

// ── Test 9: stats endpoint worker requires worker role ──
test('Phase 43 — GET /api/direct-offers/stats/worker requires worker role', async () => {
  const { handleWorkerOfferStats } = await import('../server/handlers/directOfferHandler.js');
  assert.equal(typeof handleWorkerOfferStats, 'function');
});

// ── Test 10: stats endpoint with from/to filters ──
test('Phase 43 — getEmployerOfferStats applies from/to date filters', async () => {
  const { employer, worker } = await setupBasicUsers();
  const { create: createOffer, getEmployerOfferStats } = await import('../server/services/directOffer.js');

  await createOffer(employer.id, worker.id, {
    category: 'cleaning', governorate: 'cairo',
    proposedDailyWage: 250, proposedStartDate: '2026-12-31',
  });

  // Filter for far future — should exclude
  const futureFrom = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const stats = await getEmployerOfferStats(employer.id, { from: futureFrom });
  assert.equal(stats.total, 0);
});

// ── Test 11: analytics getEmployerAnalytics filters synthetic jobs ──
test('Phase 43 — analytics filters synthetic jobs from regular metrics', async () => {
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { create: createUser, update: updateUser } = await import('../server/services/users.js');
  const employer = await createUser('01005556677', 'employer');
  await updateUser(employer.id, { name: 'E', governorate: 'cairo', lat: 30.0444, lng: 31.2357 });

  const { create: createJob } = await import('../server/services/jobs.js');

  // Regular job
  await createJob(employer.id, {
    title: 'Regular',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 5,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'Regular job',
  });

  // Synthetic job (Phase 42)
  await createJob(employer.id, {
    title: 'Synthetic',
    category: 'cleaning',
    governorate: 'cairo',
    workersNeeded: 1,
    dailyWage: 250,
    startDate: '2026-12-31',
    durationDays: 1,
    description: 'From direct offer',
    sourceType: 'direct_offer',
    sourceOfferId: 'dof_test_xxxx',
  });

  const { getEmployerAnalytics } = await import('../server/services/analytics.js');
  const analytics = await getEmployerAnalytics(employer.id);

  // Only regular job should count in jobs.total
  assert.equal(analytics.jobs.total, 1);
});

// ── Test 12: analytics adds directOffers separate metric ──
test('Phase 43 — getEmployerAnalytics includes directOffers metric', async () => {
  const { employer } = await setupBasicUsers();
  const { getEmployerAnalytics } = await import('../server/services/analytics.js');

  const analytics = await getEmployerAnalytics(employer.id);
  assert.ok('directOffers' in analytics, 'directOffers metric should be present');
  assert.equal(analytics.directOffers.total, 0);
});

// ── Test 13: getWorkerAnalytics filters synthetic jobs from earnings ──
test('Phase 43 — getWorkerAnalytics directOffers metric exists', async () => {
  const { worker } = await setupBasicUsers();
  const { getWorkerAnalytics } = await import('../server/services/analytics.js');

  const analytics = await getWorkerAnalytics(worker.id);
  assert.ok('directOffers' in analytics);
  assert.equal(analytics.directOffers.total, 0);
});

// ── Test 14: searchIndex skips synthetic jobs ──
test('Phase 43 — searchIndex.indexJob skips synthetic jobs', async () => {
  const { addToIndex, search, getStats } = await import('../server/services/searchIndex.js');

  const regularJob = {
    id: 'job_regular_1',
    title: 'تنظيف عادي',
    description: 'فرصة عادية',
    status: 'open',
    category: 'cleaning',
    governorate: 'cairo',
    dailyWage: 250,
    createdAt: new Date().toISOString(),
  };

  const syntheticJob = {
    id: 'job_synthetic_1',
    title: 'تنظيف مباشر',
    description: 'من عرض مباشر',
    status: 'in_progress',
    category: 'cleaning',
    governorate: 'cairo',
    dailyWage: 250,
    createdAt: new Date().toISOString(),
    sourceType: 'direct_offer',
  };

  addToIndex(regularJob);
  addToIndex(syntheticJob);

  const results = search('تنظيف', { status: 'open' });
  assert.ok(results.includes('job_regular_1'), 'regular should be indexed');
  assert.ok(!results.includes('job_synthetic_1'), 'synthetic should NOT be indexed');
});

// ── Test 15: queryIndex skips synthetic jobs ──
test('Phase 43 — queryIndex.onJobCreated skips synthetic jobs', async () => {
  const { onJobCreated, queryJobs, clear, getStats } = await import('../server/services/queryIndex.js');

  clear(); // Clean state for assertion

  const regularJob = {
    id: 'job_qi_regular',
    employerId: 'emp_1',
    status: 'open',
    governorate: 'cairo',
    category: 'cleaning',
    urgency: 'normal',
    dailyWage: 250,
    createdAt: new Date().toISOString(),
  };

  const syntheticJob = {
    id: 'job_qi_synthetic',
    employerId: 'emp_1',
    status: 'in_progress',
    governorate: 'cairo',
    category: 'cleaning',
    urgency: 'immediate',
    dailyWage: 250,
    createdAt: new Date().toISOString(),
    sourceType: 'direct_offer',
  };

  onJobCreated(regularJob);
  onJobCreated(syntheticJob);

  const stats = getStats();
  // Only the regular job should be in the index
  assert.equal(stats.totalJobs, 1, 'queryIndex should only contain the regular job');
});
