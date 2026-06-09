// ═══════════════════════════════════════════════════════════════
// tests/e2e/outbox-event-durability-gap-characterization.test.js
// Patch 49 — Outbox Event Durability Gap Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize current business-critical domain events as in-memory
//   EventBus emissions with no durable outbox_events collection.
//
// Current runtime behavior:
//   - core services call eventBus.emit(...) directly
//   - EventBus stores listeners in an in-memory Map
//   - late subscribers do not replay already-emitted events
//   - eventBus.clear() drops all subscriptions
//   - domain mutations and event delivery are not transactionally coupled
//   - no outbox_events collection/table exists in config
//   - core services do not use OutboxRepository or withTransaction
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
  return await import(`${path}?outbox-event-durability-gap=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-outbox-gap-'));

  process.env.NODE_ENV = 'test';
  process.env.YAWMIA_DATA_PATH = dataPath;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  // Use canonical EventBus because services import ./eventBus.js without cache busting.
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
  // Use canonical database module used by service internals.
  const database = await import('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const payments = await importFresh('../../server/services/payments.js');

  return {
    database,
    users,
    jobs,
    applications,
    payments,
  };
}

async function createEmployer(services, suffix = '001') {
  const user = await services.users.create(`01048000${suffix}`, 'employer');

  const updated = await services.users.update(user.id, {
    name: `صاحب عمل Outbox Gap ${suffix}`,
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
  const user = await services.users.create(`01148000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Outbox Gap ${suffix}`,
    governorate: 'cairo',
    categories: ['loading'],
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
    title: overrides.title || 'فرصة لاختبار durable outbox gap',
    category: overrides.category || 'loading',
    governorate: overrides.governorate || 'cairo',
    workersNeeded: overrides.workersNeeded || 1,
    dailyWage: overrides.dailyWage || 300,
    startDate: overrides.startDate || '2026-06-09',
    durationDays: overrides.durationDays || 1,
    description: overrides.description || 'اختبار فجوة durability للأحداث',
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('EventBus is in-memory only: emitted events are not durable and late subscribers cannot replay them', async (t) => {
  const { database, eventBus } = await setupIsolatedDataPath(t);
  const { default: config } = await importFresh('../../config.js');

  assert.equal(
    config.DATABASE.dirs.outbox_events,
    undefined,
    'current config has no outbox_events collection'
  );

  assert.throws(
    () => database.getCollectionPath('outbox_events'),
    /Unknown collection: outbox_events/,
    'database has no outbox_events collection path'
  );

  const received = [];
  const unsubscribe = eventBus.on('outbox_gap:test_event', (data) => {
    received.push(data);
  });

  eventBus.emit('outbox_gap:test_event', { id: 'evt_1', value: 1 });

  assert.deepEqual(
    received,
    [{ id: 'evt_1', value: 1 }],
    'active subscribers receive in-memory EventBus emissions'
  );

  unsubscribe();

  eventBus.emit('outbox_gap:test_event', { id: 'evt_2', value: 2 });

  const lateReceived = [];
  eventBus.on('outbox_gap:test_event', (data) => {
    lateReceived.push(data);
  });

  assert.deepEqual(
    lateReceived,
    [],
    'late subscribers do not replay events emitted before subscription'
  );

  eventBus.clear();

  eventBus.emit('outbox_gap:test_event', { id: 'evt_3', value: 3 });

  assert.deepEqual(
    lateReceived,
    [],
    'eventBus.clear drops subscriptions and there is no durable dispatcher/replay source'
  );
});

test('application acceptance commits domain state but only emits non-durable in-memory events', async (t) => {
  const { database, eventBus } = await setupIsolatedDataPath(t);
  const services = await loadServices();

  const employer = await createEmployer(services, '001');
  const worker = await createWorker(services, '101');
  const job = await createOpenJob(services, employer.id, { workersNeeded: 1 });

  const applyResult = await services.applications.apply(job.id, worker.id);
  assert.equal(applyResult.ok, true, applyResult.error || 'application should be created');

  const observedEvents = [];
  eventBus.on('application:accepted', (data) => {
    observedEvents.push({ event: 'application:accepted', data });
  });
  eventBus.on('job:filled', (data) => {
    observedEvents.push({ event: 'job:filled', data });
  });

  const acceptResult = await services.applications.accept(
    applyResult.application.id,
    employer.id
  );

  assert.equal(acceptResult.ok, true, acceptResult.error || 'application accept should succeed');

  const persistedApplication = await services.applications.findById(applyResult.application.id);
  const persistedJob = await services.jobs.findById(job.id);

  assert.equal(persistedApplication.status, 'accepted');
  assert.equal(persistedJob.status, 'filled');
  assert.equal(persistedJob.workersAccepted, 1);

  assert.ok(
    observedEvents.some(e => e.event === 'application:accepted'),
    'application acceptance emits application:accepted to active in-memory listeners'
  );
  assert.ok(
    observedEvents.some(e => e.event === 'job:filled'),
    'application acceptance emits job:filled to active in-memory listeners'
  );

  assert.throws(
    () => database.getCollectionPath('outbox_events'),
    /Unknown collection: outbox_events/,
    'no durable outbox collection exists after committed application acceptance'
  );

  const replayedEvents = [];
  eventBus.on('application:accepted', (data) => {
    replayedEvents.push(data);
  });

  assert.deepEqual(
    replayedEvents,
    [],
    'new listeners cannot replay previously emitted application:accepted events'
  );

  assert.equal(
    acceptResult.outboxEventId,
    undefined,
    'application acceptance returns no durable outbox event identity'
  );
});

test('job completion and payment creation rely on EventBus emissions without durable outbox coupling', async (t) => {
  const { database, eventBus } = await setupIsolatedDataPath(t);
  const services = await loadServices();

  const employer = await createEmployer(services, '002');
  const worker = await createWorker(services, '102');
  const job = await createOpenJob(services, employer.id, { workersNeeded: 1 });

  const appResult = await services.applications.apply(job.id, worker.id);
  assert.equal(appResult.ok, true);

  const acceptResult = await services.applications.accept(appResult.application.id, employer.id);
  assert.equal(acceptResult.ok, true);

  const startResult = await services.jobs.startJob(job.id, employer.id);
  assert.equal(startResult.ok, true);
  assert.equal(startResult.job.status, 'in_progress');

  const observedEvents = [];
  eventBus.on('job:completed', (data) => {
    observedEvents.push({ event: 'job:completed', data });
  });
  eventBus.on('payment:created', (data) => {
    observedEvents.push({ event: 'payment:created', data });
  });

  const completeResult = await services.jobs.completeJob(job.id, employer.id);

  assert.equal(completeResult.ok, true);
  assert.equal(completeResult.job.status, 'completed');

  // Give the fire-and-forget payment side-effect time to emit payment:created.
  await wait(100);

  const payments = await services.payments.listByJob(job.id);
  assert.equal(payments.length, 1, 'payment projection is eventually created as file-backed state');

  assert.ok(
    observedEvents.some(e => e.event === 'job:completed'),
    'job completion emits job:completed to active in-memory listeners'
  );

  assert.ok(
    observedEvents.some(e => e.event === 'payment:created'),
    'payment creation emits payment:created to active in-memory listeners'
  );

  assert.throws(
    () => database.getCollectionPath('outbox_events'),
    /Unknown collection: outbox_events/,
    'job/payment workflow commits without durable outbox_events collection'
  );

  assert.equal(
    completeResult.outboxEventId,
    undefined,
    'completeJob returns no durable outbox event identity'
  );

  assert.equal(
    payments[0].outboxEventId,
    undefined,
    'payment projection stores no durable outbox event identity'
  );
});

test('core domain services emit business-critical events directly and do not use OutboxRepository or withTransaction', async () => {
  const { default: config } = await importFresh('../../config.js');

  const eventBusSource = await readFile(
    new URL('../../server/services/eventBus.js', import.meta.url),
    'utf-8'
  );

  const applicationsSource = await readFile(
    new URL('../../server/services/applications.js', import.meta.url),
    'utf-8'
  );

  const jobsSource = await readFile(
    new URL('../../server/services/jobs.js', import.meta.url),
    'utf-8'
  );

  const directOfferSource = await readFile(
    new URL('../../server/services/directOffer.js', import.meta.url),
    'utf-8'
  );

  const paymentsSource = await readFile(
    new URL('../../server/services/payments.js', import.meta.url),
    'utf-8'
  );

  const notificationsSource = await readFile(
    new URL('../../server/services/notifications.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    eventBusSource,
    /this\._listeners = new Map\(\)/,
    'EventBus is backed by an in-memory listener map'
  );

  assert.match(
    eventBusSource,
    /emit\(event, data\)/,
    'EventBus emits directly to current in-process listeners'
  );

  assert.match(
    applicationsSource,
    /eventBus\.emit\('application:accepted'/,
    'applications.accept emits application:accepted directly'
  );

  assert.match(
    applicationsSource,
    /eventBus\.emit\('job:filled'/,
    'applications.accept emits job:filled directly'
  );

  assert.match(
    jobsSource,
    /eventBus\.emit\('job:created'/,
    'jobs.create emits job:created directly'
  );

  assert.match(
    jobsSource,
    /eventBus\.emit\('job:completed'/,
    'jobs.completeJob emits job:completed directly'
  );

  assert.match(
    directOfferSource,
    /eventBus\.emit\('direct_offer:accepted'/,
    'directOffer.tryAccept emits direct_offer:accepted directly'
  );

  assert.match(
    paymentsSource,
    /eventBus\.emit\('payment:created'/,
    'payments.createPayment emits payment:created directly'
  );

  assert.match(
    paymentsSource,
    /eventBus\.emit\('payment:completed'/,
    'payments.completePayment emits payment:completed directly'
  );

  assert.match(
    paymentsSource,
    /eventBus\.emit\('payment:disputed'/,
    'payments.disputePayment emits payment:disputed directly'
  );

  assert.match(
    notificationsSource,
    /eventBus\.emit\('notification:created'/,
    'notifications.createNotification emits notification:created directly'
  );

  for (const [name, source] of [
    ['applications', applicationsSource],
    ['jobs', jobsSource],
    ['directOffer', directOfferSource],
    ['payments', paymentsSource],
    ['notifications', notificationsSource],
  ]) {
    assert.equal(
      source.includes('OutboxRepository'),
      false,
      `${name} service does not use OutboxRepository`
    );

    assert.equal(
      source.includes('withTransaction'),
      false,
      `${name} service does not use withTransaction for event persistence`
    );

    assert.equal(
      source.includes('outbox_events'),
      false,
      `${name} service does not write an outbox_events record`
    );
  }

  assert.equal(
    config.DATABASE.dirs.outbox_events,
    undefined,
    'current config has no durable outbox_events collection/table'
  );
});
