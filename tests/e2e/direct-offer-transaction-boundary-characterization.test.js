// ═══════════════════════════════════════════════════════════════
// tests/e2e/direct-offer-transaction-boundary-characterization.test.js
// Patch 46 — Direct Offer Transaction Boundary Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize current direct offer accept workflow as multi-record,
//   transactionless, process-local-lock-dependent, and not production-safe.
//
// Current runtime behavior:
//   - directOffer.tryAccept() creates a synthetic job
//   - jobs.create() emits job:created before the full direct-offer accept
//     workflow commits
//   - applications.instantAcceptInternal() creates an application and mutates
//     the job before the offer is finally persisted as accepted
//   - startJob failure is intentionally non-fatal
//   - availability ad matching failure is intentionally non-fatal
//   - events are in-memory EventBus events, not durable outbox events
//   - withLock() is process-local only
//
// This test intentionally documents production gaps.
// It must not be interpreted as production readiness proof.
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no ./data mutation
//   - no server.js import
//   - no router.js import
//   - no queue workers
//   - no schedulers
//   - no external services
//   - no --confirm scripts
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let importCounter = 0;

async function importFresh(path) {
  importCounter++;
  return await import(`${path}?direct-offer-transaction-boundary=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-direct-offer-boundary-'));

  process.env.NODE_ENV = 'test';
  process.env.YAWMIA_DATA_PATH = dataPath;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  const { eventBus } = await import('../../server/services/eventBus.js');
  eventBus.clear();

  t.after(async () => {
    try { eventBus.clear(); } catch (_) {}
    delete process.env.YAWMIA_DATA_PATH;
    await rm(dataPath, { recursive: true, force: true });
  });

  return { dataPath, database, eventBus };
}

async function loadServices() {
  // Import the canonical database module used by service internals.
  // setupIsolatedDataPath() imports a cache-busted database module for setup,
  // but directOffer/availabilityAd import ./database.js without cache-busting.
  // For shard-aware physical deletion in characterization tests, use the same
  // canonical module as the services.
  const database = await import('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const directOffer = await importFresh('../../server/services/directOffer.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const availabilityAd = await importFresh('../../server/services/availabilityAd.js');

  return {
    database,
    users,
    directOffer,
    jobs,
    applications,
    availabilityAd,
  };
}

async function createEmployer(services, suffix = '001') {
  const user = await services.users.create(`01046000${suffix}`, 'employer');

  const updated = await services.users.update(user.id, {
    name: `صاحب عمل Boundary ${suffix}`,
    governorate: 'cairo',
    lat: 30.0444,
    lng: 31.2357,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

async function createWorker(services, suffix = '101') {
  const user = await services.users.create(`01146000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Boundary ${suffix}`,
    governorate: 'cairo',
    categories: ['cleaning', 'construction'],
    lat: 30.05,
    lng: 31.24,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

function tomorrowDateString(offsetDays = 1) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function createDirectOffer(services, employerId, workerId, overrides = {}) {
  return await services.directOffer.create(employerId, workerId, {
    adId: overrides.adId || null,
    category: overrides.category || 'cleaning',
    governorate: overrides.governorate || 'cairo',
    proposedDailyWage: overrides.proposedDailyWage || 300,
    proposedStartDate: overrides.proposedStartDate || tomorrowDateString(1),
    proposedDurationDays: overrides.proposedDurationDays || 1,
    message: overrides.message || 'عرض مباشر لاختبار حدود المعاملة',
  });
}

async function createActiveAvailabilityAd(services, workerId) {
  const availableFrom = new Date(Date.now() + 60 * 60 * 1000);
  const availableUntil = new Date(Date.now() + 8 * 60 * 60 * 1000);

  const result = await services.availabilityAd.createAd(workerId, {
    categories: ['cleaning'],
    governorate: 'cairo',
    lat: 30.05,
    lng: 31.24,
    radiusKm: 20,
    minDailyWage: 250,
    maxDailyWage: 500,
    availableFrom: availableFrom.toISOString(),
    availableUntil: availableUntil.toISOString(),
    notes: 'متاح لاختبار partial direct offer accept failure',
  });

  assert.equal(result.ok, true, result.error || 'availability ad should be created');
  return result.ad;
}

test('direct offer accept emits intermediate domain events before final direct_offer:accepted event', async (t) => {
  const { eventBus } = await setupIsolatedDataPath(t);
  const services = await loadServices();

  const employer = await createEmployer(services, '001');
  const worker = await createWorker(services, '101');

  const offerResult = await createDirectOffer(services, employer.id, worker.id, {
    message: 'عرض مباشر لاختبار ترتيب الأحداث وحدود المعاملة',
  });

  assert.equal(offerResult.ok, true, offerResult.error || 'direct offer should be created');

  const offerId = offerResult.offer.id;
  const observedEvents = [];

  eventBus.on('job:created', (data) => {
    observedEvents.push({
      event: 'job:created',
      jobId: data && data.jobId,
      employerId: data && data.employerId,
    });
  });

  eventBus.on('application:accepted', (data) => {
    observedEvents.push({
      event: 'application:accepted',
      applicationId: data && data.applicationId,
      jobId: data && data.jobId,
      workerId: data && data.workerId,
    });
  });

  eventBus.on('job:filled', (data) => {
    observedEvents.push({
      event: 'job:filled',
      jobId: data && data.jobId,
    });
  });

  eventBus.on('job:started', (data) => {
    observedEvents.push({
      event: 'job:started',
      jobId: data && data.jobId,
    });
  });

  eventBus.on('direct_offer:accepted', (data) => {
    observedEvents.push({
      event: 'direct_offer:accepted',
      offerId: data && data.offerId,
      jobId: data && data.jobId,
      workerId: data && data.workerId,
    });
  });

  const acceptResult = await services.directOffer.tryAccept(offerId, worker.id);

  assert.equal(acceptResult.ok, true, acceptResult.error || 'direct offer accept should succeed');
  assert.ok(acceptResult.jobId, 'accept should create a resulting synthetic job');

  const eventNames = observedEvents.map(e => e.event);

  assert.ok(
    eventNames.includes('job:created'),
    'accepting a direct offer creates a synthetic job and emits job:created'
  );

  assert.ok(
    eventNames.includes('application:accepted'),
    'accepting a direct offer creates an accepted application before final offer event'
  );

  assert.ok(
    eventNames.includes('direct_offer:accepted'),
    'accepting a direct offer eventually emits direct_offer:accepted'
  );

  assert.ok(
    eventNames.indexOf('job:created') < eventNames.indexOf('direct_offer:accepted'),
    'job:created is emitted before the final direct_offer:accepted event'
  );

  assert.ok(
    eventNames.indexOf('application:accepted') < eventNames.indexOf('direct_offer:accepted'),
    'application:accepted is emitted before the final direct_offer:accepted event'
  );

  const syntheticJob = await services.jobs.findById(acceptResult.jobId);
  assert.ok(syntheticJob, 'synthetic job should exist');
  assert.equal(syntheticJob.sourceType, 'direct_offer');
  assert.equal(syntheticJob.sourceOfferId, offerId);

  const applications = await services.applications.listByJob(acceptResult.jobId);
  assert.equal(applications.length, 1, 'synthetic job should have one application');
  assert.equal(applications[0].workerId, worker.id);
  assert.equal(applications[0].status, 'accepted');

  const acceptedOffer = await services.directOffer.findById(offerId);
  assert.equal(acceptedOffer.status, 'accepted');
  assert.equal(acceptedOffer.resultingJobId, acceptResult.jobId);

  assert.equal(
    acceptResult.transactionId,
    undefined,
    'current direct offer accept returns no transaction id'
  );

  assert.equal(
    acceptResult.outboxEventId,
    undefined,
    'current direct offer accept returns no durable outbox event id'
  );
});

test('availability ad matching failure is non-fatal and can leave accepted offer/job/application without matched ad state', async (t) => {
  await setupIsolatedDataPath(t);
  const services = await loadServices();

  const employer = await createEmployer(services, '002');
  const worker = await createWorker(services, '102');
  const ad = await createActiveAvailabilityAd(services, worker.id);

  const offerResult = await createDirectOffer(services, employer.id, worker.id, {
    adId: ad.id,
    proposedDailyWage: 350,
    message: 'عرض مباشر مرتبط بإعلان سيتم حذفه قبل القبول',
  });

  assert.equal(offerResult.ok, true, offerResult.error || 'direct offer with ad should be created');

  const offerId = offerResult.offer.id;

  const adPath = services.database.getRecordPath('availability_ads', ad.id);
  const deleted = await services.database.deleteJSON(adPath);

  assert.equal(deleted, true, 'test deletes only temp availability ad file to simulate partial failure');
  assert.equal(await services.availabilityAd.findById(ad.id), null);

  const acceptResult = await services.directOffer.tryAccept(offerId, worker.id);

  assert.equal(
    acceptResult.ok,
    true,
    'direct offer accept still succeeds even when linked availability ad cannot be marked as matched'
  );

  const acceptedOffer = await services.directOffer.findById(offerId);
  assert.equal(acceptedOffer.status, 'accepted');
  assert.equal(acceptedOffer.adId, ad.id);
  assert.equal(acceptedOffer.resultingJobId, acceptResult.jobId);

  const syntheticJob = await services.jobs.findById(acceptResult.jobId);
  assert.ok(syntheticJob, 'synthetic job should still be committed');
  assert.equal(syntheticJob.sourceType, 'direct_offer');

  const apps = await services.applications.listByJob(acceptResult.jobId);
  assert.equal(apps.length, 1, 'application should still be committed');
  assert.equal(apps[0].workerId, worker.id);
  assert.equal(apps[0].status, 'accepted');

  const adAfterAccept = await services.availabilityAd.findById(ad.id);
  assert.equal(
    adAfterAccept,
    null,
    'linked ad remains missing/unmatched while direct offer accept has committed other records'
  );
});

test('direct offer transaction boundary currently relies on process-local locks and in-memory events, not durable transactions/outbox', async () => {
  const { default: config } = await importFresh('../../config.js');

  const directOfferSource = await readFile(
    new URL('../../server/services/directOffer.js', import.meta.url),
    'utf-8'
  );

  const jobsSource = await readFile(
    new URL('../../server/services/jobs.js', import.meta.url),
    'utf-8'
  );

  const applicationsSource = await readFile(
    new URL('../../server/services/applications.js', import.meta.url),
    'utf-8'
  );

  const resourceLockSource = await readFile(
    new URL('../../server/services/resourceLock.js', import.meta.url),
    'utf-8'
  );

  const eventBusSource = await readFile(
    new URL('../../server/services/eventBus.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    directOfferSource,
    /withLock\(`offer:\$\{offerId\}`/,
    'direct offer accept uses a process-local resource lock'
  );

  assert.match(
    resourceLockSource,
    /const locks = new Map\(\)/,
    'resourceLock is backed by an in-memory Map'
  );

  assert.match(
    resourceLockSource,
    /In-memory only/,
    'resourceLock source documents that locks are in-memory only'
  );

  assert.match(
    eventBusSource,
    /this\._listeners = new Map\(\)/,
    'EventBus is backed by an in-memory listener map'
  );

  assert.match(
    jobsSource,
    /eventBus\.emit\('job:created'/,
    'synthetic job creation emits in-memory job:created event'
  );

  assert.match(
    applicationsSource,
    /eventBus\.emit\('application:accepted'/,
    'instant application acceptance emits in-memory application:accepted event'
  );

  assert.match(
    directOfferSource,
    /eventBus\.emit\('direct_offer:accepted'/,
    'direct offer acceptance emits in-memory direct_offer:accepted event'
  );

  assert.match(
    directOfferSource,
    /startJob failed \(non-fatal\)/,
    'startJob failure is explicitly treated as non-fatal in direct offer accept'
  );

  assert.match(
    directOfferSource,
    /Ad ensureMarkedAsMatched failed \(non-fatal\)/,
    'availability ad matching failure is explicitly treated as non-fatal'
  );

  assert.equal(
    config.DATABASE.dirs.outbox_events,
    undefined,
    'current config has no durable outbox_events collection for direct offer acceptance'
  );

  assert.equal(
    directOfferSource.includes('withTransaction'),
    false,
    'directOffer.tryAccept currently does not use a transaction manager'
  );

  assert.equal(
    directOfferSource.includes('OutboxRepository'),
    false,
    'directOffer.tryAccept currently does not write through an outbox repository'
  );
});
