// ═══════════════════════════════════════════════════════════════
// tests/e2e/application-acceptance-transaction-boundary-characterization.test.js
// Patch 47 — Application Acceptance Transaction Boundary Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize current application acceptance workflow as multi-record,
//   transactionless, process-local-lock-dependent, and not production-safe.
//
// Current runtime behavior:
//   - applications.accept() updates the application record
//   - then calls jobs.incrementAccepted() to mutate job workersAccepted/status
//   - jobs.incrementAccepted() separately updates the jobs index if filled
//   - application:accepted and job:filled are in-memory EventBus events
//   - withLock() is process-local only
//   - no durable outbox_events collection exists
//   - no transaction manager is used
//
// This test intentionally documents a production gap.
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
  return await import(`${path}?application-acceptance-boundary=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-app-acceptance-boundary-'));

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
  // Load canonical database used by service internals.
  const database = await import('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');

  return {
    database,
    users,
    jobs,
    applications,
  };
}

async function createEmployer(services, suffix = '001') {
  const user = await services.users.create(`01047000${suffix}`, 'employer');

  const updated = await services.users.update(user.id, {
    name: `صاحب عمل Application Boundary ${suffix}`,
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
  const user = await services.users.create(`01147000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Application Boundary ${suffix}`,
    governorate: 'cairo',
    categories: ['loading', 'cleaning'],
    lat: 30.05,
    lng: 31.24,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

async function createOpenJob(services, employerId, overrides = {}) {
  return await services.jobs.create(employerId, {
    title: overrides.title || 'تحميل بضائع لاختبار قبول الطلب',
    category: overrides.category || 'loading',
    governorate: overrides.governorate || 'cairo',
    workersNeeded: overrides.workersNeeded || 1,
    dailyWage: overrides.dailyWage || 300,
    startDate: overrides.startDate || '2026-06-09',
    durationDays: overrides.durationDays || 1,
    description: overrides.description || 'فرصة لاختبار حدود معاملة قبول الطلب',
  });
}

test('application acceptance commits multiple records/indexes and emits in-memory events without transaction/outbox result', async (t) => {
  const { eventBus } = await setupIsolatedDataPath(t);
  const services = await loadServices();

  const employer = await createEmployer(services, '001');
  const worker = await createWorker(services, '101');
  const job = await createOpenJob(services, employer.id, { workersNeeded: 1 });

  const applyResult = await services.applications.apply(job.id, worker.id);
  assert.equal(applyResult.ok, true, applyResult.error || 'application should be created');

  const observedEvents = [];

  eventBus.on('application:accepted', (data) => {
    observedEvents.push({
      event: 'application:accepted',
      applicationId: data && data.applicationId,
      jobId: data && data.jobId,
      workerId: data && data.workerId,
      employerId: data && data.employerId,
    });
  });

  eventBus.on('job:filled', (data) => {
    observedEvents.push({
      event: 'job:filled',
      jobId: data && data.jobId,
      employerId: data && data.employerId,
    });
  });

  const acceptResult = await services.applications.accept(
    applyResult.application.id,
    employer.id
  );

  assert.equal(acceptResult.ok, true, acceptResult.error || 'application accept should succeed');
  assert.equal(acceptResult.application.status, 'accepted');

  const persistedApplication = await services.applications.findById(applyResult.application.id);
  assert.ok(persistedApplication, 'accepted application should be persisted');
  assert.equal(persistedApplication.status, 'accepted');
  assert.equal(persistedApplication.workerId, worker.id);
  assert.equal(persistedApplication.jobId, job.id);

  const updatedJob = await services.jobs.findById(job.id);
  assert.ok(updatedJob, 'job should still exist');
  assert.equal(updatedJob.workersAccepted, 1);
  assert.equal(updatedJob.status, 'filled');

  const jobsIndex = await services.database.readIndex('jobsIndex');
  assert.equal(
    jobsIndex[job.id].status,
    'filled',
    'jobs index is updated separately after job mutation'
  );

  const eventNames = observedEvents.map(e => e.event);
  assert.ok(
    eventNames.includes('application:accepted'),
    'application acceptance emits application:accepted through in-memory EventBus'
  );
  assert.ok(
    eventNames.includes('job:filled'),
    'application acceptance emits job:filled through in-memory EventBus when capacity is reached'
  );

  assert.equal(
    acceptResult.transactionId,
    undefined,
    'current application accept returns no transaction id'
  );

  assert.equal(
    acceptResult.outboxEventId,
    undefined,
    'current application accept returns no durable outbox event id'
  );

  assert.equal(
    acceptResult.job,
    undefined,
    'current application accept does not return a transactionally committed job+application aggregate'
  );
});

test('application acceptance source shows separate application write, job mutation, index update, and in-memory events', async () => {
  const { default: config } = await importFresh('../../config.js');

  const applicationsSource = await readFile(
    new URL('../../server/services/applications.js', import.meta.url),
    'utf-8'
  );

  const jobsSource = await readFile(
    new URL('../../server/services/jobs.js', import.meta.url),
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
    applicationsSource,
    /return withLock\(`accept-job:\$\{jobId\}`/,
    'applications.accept serializes by process-local accept-job lock'
  );

  const appWriteIdx = applicationsSource.indexOf('await atomicWrite(appPath, application);');
  const incrementIdx = applicationsSource.indexOf('const updatedJob = await incrementAccepted(application.jobId);');

  assert.ok(appWriteIdx >= 0, 'applications.accept writes application record');
  assert.ok(incrementIdx >= 0, 'applications.accept calls incrementAccepted after application write');
  assert.ok(
    appWriteIdx < incrementIdx,
    'application status is persisted before job workersAccepted/status mutation'
  );

  assert.match(
    applicationsSource,
    /eventBus\.emit\('application:accepted'/,
    'applications.accept emits in-memory application:accepted event'
  );

  assert.match(
    applicationsSource,
    /eventBus\.emit\('job:filled'/,
    'applications.accept emits in-memory job:filled event'
  );

  assert.match(
    jobsSource,
    /export async function incrementAccepted\(jobId\)/,
    'job capacity mutation is delegated to jobs.incrementAccepted'
  );

  assert.match(
    jobsSource,
    /job\.workersAccepted \+= 1;/,
    'jobs.incrementAccepted mutates workersAccepted separately'
  );

  assert.match(
    jobsSource,
    /await atomicWrite\(jobPath, job\);/,
    'jobs.incrementAccepted writes the job record separately'
  );

  assert.match(
    jobsSource,
    /jobsIndex\[jobId\]\.status = 'filled';/,
    'jobs.incrementAccepted separately updates jobs index when filled'
  );

  assert.match(
    resourceLockSource,
    /const locks = new Map\(\)/,
    'resourceLock is backed by an in-memory Map'
  );

  assert.match(
    resourceLockSource,
    /In-memory only/,
    'resourceLock source documents locks are in-memory only'
  );

  assert.match(
    eventBusSource,
    /this\._listeners = new Map\(\)/,
    'EventBus is backed by an in-memory listener map'
  );

  assert.equal(
    config.DATABASE.dirs.outbox_events,
    undefined,
    'current config has no durable outbox_events collection for application acceptance'
  );

  assert.equal(
    applicationsSource.includes('withTransaction'),
    false,
    'applications.accept currently does not use a transaction manager'
  );

  assert.equal(
    applicationsSource.includes('OutboxRepository'),
    false,
    'applications.accept currently does not write through an outbox repository'
  );
});

test('application acceptance is a core primitive consumed by direct offer, instant match, attendance, messages, payments, and ratings workflows', async () => {
  const applicationsSource = await readFile(
    new URL('../../server/services/applications.js', import.meta.url),
    'utf-8'
  );

  const directOfferSource = await readFile(
    new URL('../../server/services/directOffer.js', import.meta.url),
    'utf-8'
  );

  const instantMatchSource = await readFile(
    new URL('../../server/services/instantMatch.js', import.meta.url),
    'utf-8'
  );

  const attendanceSource = await readFile(
    new URL('../../server/services/attendance.js', import.meta.url),
    'utf-8'
  );

  const messagesSource = await readFile(
    new URL('../../server/services/messages.js', import.meta.url),
    'utf-8'
  );

  const paymentsSource = await readFile(
    new URL('../../server/services/payments.js', import.meta.url),
    'utf-8'
  );

  const ratingsSource = await readFile(
    new URL('../../server/services/ratings.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    applicationsSource,
    /export async function accept\(applicationId, employerId\)/,
    'applications.accept is the normal marketplace acceptance primitive'
  );

  assert.match(
    applicationsSource,
    /export async function instantAcceptInternal\(jobId, workerId\)/,
    'applications.instantAcceptInternal is the instant/direct synthetic acceptance primitive'
  );

  assert.match(
    directOfferSource,
    /instantAcceptInternal/,
    'direct offer acceptance depends on application acceptance internals'
  );

  assert.match(
    instantMatchSource,
    /instantAcceptInternal/,
    'instant match acceptance depends on application acceptance internals'
  );

  assert.match(
    attendanceSource,
    /isAcceptedApplicationStatus/,
    'attendance eligibility depends on accepted-equivalent application status'
  );

  assert.match(
    messagesSource,
    /isAcceptedApplicationStatus/,
    'job/workroom messaging eligibility depends on accepted-equivalent application status'
  );

  assert.match(
    paymentsSource,
    /isAcceptedApplicationStatus/,
    'payment dispute involvement checks depend on accepted-equivalent application status'
  );

  assert.match(
    ratingsSource,
    /acceptedApps|isAcceptedApplicationStatus|status === 'accepted'/,
    'rating eligibility depends on accepted application participation'
  );
});
