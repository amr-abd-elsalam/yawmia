// ═══════════════════════════════════════════════════════════════
// tests/e2e/direct-offer-reliability-smoke.test.js
// Patch 26 — Direct Offer Reliability Expansion
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for Direct Offer lifecycle surfaces.
//
// Covers:
//   - duplicate pending guard
//   - valid/invalid decline reasons
//   - withdraw path
//   - explicit expiry path
//   - accepted reveal shape
//   - availability ad matched reconciliation
//   - synthetic job privacy/listing guard
//   - direct offer live status fanout
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no server.js import
//   - no router.js import
//   - no queue workers
//   - no schedulers
//   - no OTP weakening
//   - no real ./data mutation
//   - no external services
//   - no new dependencies
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

const TEST_TIMEOUT_MS = 2000;

async function setupTempDataPath() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-direct-offer-smoke-'));
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_TOKEN = 'test-admin-token';
  process.env.YAWMIA_DATA_PATH = dir;
  return dir;
}

async function importFresh(path) {
  return await import(`${path}?t=${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

async function loadServices() {
  const database = await importFresh('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const directOffer = await importFresh('../../server/services/directOffer.js');
  const availabilityAd = await importFresh('../../server/services/availabilityAd.js');
  const jobs = await importFresh('../../server/services/jobs.js');
  const applications = await importFresh('../../server/services/applications.js');
  const liveFeed = await importFresh('../../server/services/liveFeed.js');

  return {
    database,
    users,
    directOffer,
    availabilityAd,
    jobs,
    applications,
    liveFeed,
  };
}

function tomorrowDateString(offsetDays = 1) {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function createEmployer(services, suffix = '001') {
  const user = await services.users.create(`01026000${suffix}`, 'employer');

  const updated = await services.users.update(user.id, {
    name: `صاحب عمل Direct Offer ${suffix}`,
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
  const user = await services.users.create(`01126000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Direct Offer ${suffix}`,
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

async function createDirectOffer(services, employerId, workerId, overrides = {}) {
  return await services.directOffer.create(employerId, workerId, {
    adId: overrides.adId || null,
    category: overrides.category || 'cleaning',
    governorate: overrides.governorate || 'cairo',
    proposedDailyWage: overrides.proposedDailyWage || 300,
    proposedStartDate: overrides.proposedStartDate || tomorrowDateString(1),
    proposedDurationDays: overrides.proposedDurationDays || 1,
    message: overrides.message || 'عرض مباشر لاختبار الاعتمادية',
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
    notes: 'متاح لاختبار Direct Offer',
  });

  assert.equal(result.ok, true, result.error || 'availability ad should be created');
  return result.ad;
}

function createSseMockRes() {
  const res = new EventEmitter();

  res.statusCode = 200;
  res.headers = {};
  res.headersSent = false;
  res.writableEnded = false;
  res.destroyed = false;
  res.chunks = [];

  res.setHeader = function setHeader(key, value) {
    res.headers[String(key).toLowerCase()] = value;
  };

  res.writeHead = function writeHead(statusCode, headers = {}) {
    res.statusCode = statusCode;
    res.headersSent = true;
    for (const [key, value] of Object.entries(headers)) {
      res.headers[String(key).toLowerCase()] = value;
    }
  };

  res.write = function write(chunk) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk);
    res.chunks.push(text);
    res.emit('write', text);
    return true;
  };

  res.end = function end(chunk) {
    if (chunk !== undefined) res.write(chunk);
    res.writableEnded = true;
    res.emit('finish');
  };

  res.close = function close() {
    if (res.destroyed) return;
    res.destroyed = true;
    res.writableEnded = true;
    res.emit('close');
  };

  return res;
}

function sseText(res) {
  return res.chunks.join('');
}

function parseSseEvents(text) {
  return text
    .split('\n\n')
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const event = { event: 'message', data: '', id: null, json: null };

      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event.event = line.slice('event:'.length).trim();
        else if (line.startsWith('data:')) event.data += line.slice('data:'.length).trim();
        else if (line.startsWith('id:')) event.id = line.slice('id:'.length).trim();
      }

      try {
        event.json = event.data ? JSON.parse(event.data) : null;
      } catch (_) {
        event.json = null;
      }

      return event;
    });
}

function findSseEvent(res, eventName, predicate = () => true) {
  return parseSseEvents(sseText(res)).find(evt => evt.event === eventName && predicate(evt)) || null;
}

async function waitForSseEvent(res, eventName, predicate = () => true, timeoutMs = TEST_TIMEOUT_MS) {
  const existing = findSseEvent(res, eventName, predicate);
  if (existing) return existing;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());

    await Promise.race([
      once(res, 'write'),
      new Promise(resolve => setTimeout(resolve, Math.min(remaining, 25))),
    ]).catch(() => {});

    const evt = findSseEvent(res, eventName, predicate);
    if (evt) return evt;
  }

  assert.fail(`Timed out waiting for SSE event: ${eventName}\n\nCaptured:\n${sseText(res)}`);
}

async function cleanupRealtime(services, responses = []) {
  for (const res of responses) {
    try { res.close(); } catch (_) {}
  }

  try {
    if (services && services.liveFeed && typeof services.liveFeed.clearConnections === 'function') {
      services.liveFeed.clearConnections();
    }
  } catch (_) {}
}

test('Patch 26: direct offer guardrails cover duplicate, decline, withdraw, and explicit expiry paths', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const services = await loadServices();
  t.after(async () => {
    await cleanupRealtime(services);
  });

  const employer = await createEmployer(services, '001');
  const worker = await createWorker(services, '101');

  // ── Flow A: duplicate pending guard ───────────────────────
  const firstOffer = await createDirectOffer(services, employer.id, worker.id, {
    message: 'أول عرض مباشر لاختبار duplicate guard',
  });

  assert.equal(firstOffer.ok, true, firstOffer.error || 'first offer should be created');
  assert.ok(firstOffer.offer.id.startsWith('dof_'));

  const duplicateOffer = await createDirectOffer(services, employer.id, worker.id, {
    message: 'عرض مكرر يجب رفضه',
  });

  assert.equal(duplicateOffer.ok, false, 'duplicate pending offer should be rejected');
  assert.equal(duplicateOffer.code, 'DUPLICATE_PENDING');

  const pendingAfterDuplicate = await services.directOffer.listByEmployer(employer.id, {
    status: 'pending',
    limit: 20,
    offset: 0,
  });

  assert.equal(pendingAfterDuplicate.total, 1, 'only one pending offer should exist for the pair');

  // ── Flow B: valid decline reason ──────────────────────────
  const declineResult = await services.directOffer.decline(firstOffer.offer.id, worker.id, 'busy');

  assert.equal(declineResult.ok, true, declineResult.error || 'valid decline should succeed');

  const declinedRaw = await services.directOffer.findById(firstOffer.offer.id);
  assert.equal(declinedRaw.status, 'declined');
  assert.equal(declinedRaw.declinedReason, 'busy');

  // ── Flow B: invalid decline reason leaves offer pending ───
  const secondOffer = await createDirectOffer(services, employer.id, worker.id, {
    message: 'عرض لاختبار invalid decline reason',
  });

  assert.equal(secondOffer.ok, true, secondOffer.error || 'second offer should be created after decline');

  const invalidDecline = await services.directOffer.decline(
    secondOffer.offer.id,
    worker.id,
    'not_a_valid_reason'
  );

  assert.equal(invalidDecline.ok, false, 'invalid decline reason should fail');
  assert.equal(invalidDecline.code, 'INVALID_REASON');

  const stillPending = await services.directOffer.findById(secondOffer.offer.id);
  assert.equal(stillPending.status, 'pending', 'invalid decline should not mutate pending offer');

  // Finish second offer so later pair tests can create new pending offers.
  const validDeclineSecond = await services.directOffer.decline(secondOffer.offer.id, worker.id, 'other');
  assert.equal(validDeclineSecond.ok, true);

  // ── Flow C: withdraw path ─────────────────────────────────
  const withdrawOffer = await createDirectOffer(services, employer.id, worker.id, {
    message: 'عرض لاختبار withdraw',
  });

  assert.equal(withdrawOffer.ok, true);

  const withdrawResult = await services.directOffer.withdraw(withdrawOffer.offer.id, employer.id);
  assert.equal(withdrawResult.ok, true, withdrawResult.error || 'withdraw should succeed');

  const withdrawnRaw = await services.directOffer.findById(withdrawOffer.offer.id);
  assert.equal(withdrawnRaw.status, 'withdrawn');

  const acceptWithdrawn = await services.directOffer.tryAccept(withdrawOffer.offer.id, worker.id);
  assert.equal(acceptWithdrawn.ok, false, 'worker should not accept withdrawn offer');
  assert.equal(acceptWithdrawn.code, 'OFFER_NOT_PENDING');

  // ── Flow D: explicit expiry path ──────────────────────────
  const expiryOffer = await createDirectOffer(services, employer.id, worker.id, {
    message: 'عرض لاختبار expireOffer',
  });

  assert.equal(expiryOffer.ok, true);

  const didExpire = await services.directOffer.expireOffer(expiryOffer.offer.id);
  assert.equal(didExpire, true, 'expireOffer should mark pending offer expired');

  const expiredRaw = await services.directOffer.findById(expiryOffer.offer.id);
  assert.equal(expiredRaw.status, 'expired');

  const acceptExpired = await services.directOffer.tryAccept(expiryOffer.offer.id, worker.id);
  assert.equal(acceptExpired.ok, false, 'worker should not accept expired offer');
  assert.equal(acceptExpired.code, 'OFFER_NOT_PENDING');
});

test('Patch 26: direct offer acceptance covers reveal, ad reconciliation, synthetic job privacy, and live status fanout', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const services = await loadServices();
  t.after(async () => {
    await cleanupRealtime(services);
  });

  const employer = await createEmployer(services, '002');
  const worker = await createWorker(services, '102');
  const activeAd = await createActiveAvailabilityAd(services, worker.id);

  const offerResult = await createDirectOffer(services, employer.id, worker.id, {
    adId: activeAd.id,
    proposedDailyWage: 350,
    message: 'عرض مباشر مرتبط بإعلان إتاحة',
  });

  assert.equal(offerResult.ok, true, offerResult.error || 'linked direct offer should be created');

  const rawPendingOffer = await services.directOffer.findById(offerResult.offer.id);

  // ── Flow E: pre-accept redaction / reveal boundaries ──────
  const workerViewBeforeAccept = services.directOffer.redactOfferForViewer(rawPendingOffer, worker.id);
  assert.equal(workerViewBeforeAccept.status, 'pending');
  assert.equal(typeof workerViewBeforeAccept.employerDisplayName, 'string');
  assert.equal('employerPhone' in workerViewBeforeAccept, false, 'worker should not see employer phone before accept');
  assert.equal('revealedToWorker' in workerViewBeforeAccept, false, 'worker reveal object should not exist before accept');

  const employerViewBeforeAccept = services.directOffer.redactOfferForViewer(rawPendingOffer, employer.id);
  assert.equal(employerViewBeforeAccept.status, 'pending');
  assert.equal(employerViewBeforeAccept.workerId, worker.id);
  assert.equal(typeof employerViewBeforeAccept.workerDisplayName, 'string');
  assert.equal('workerPhone' in employerViewBeforeAccept, false, 'employer should not see worker phone before accept');
  assert.equal('revealedToEmployer' in employerViewBeforeAccept, false, 'employer reveal object should not exist before accept');

  // ── Flow F/G: accept creates synthetic job + reconciles ad ─
  const acceptResult = await services.directOffer.tryAccept(offerResult.offer.id, worker.id);

  assert.equal(acceptResult.ok, true, acceptResult.error || 'worker should accept direct offer');
  assert.ok(acceptResult.jobId, 'accepted direct offer should return resulting jobId');

  const acceptedRaw = await services.directOffer.findById(offerResult.offer.id);
  assert.equal(acceptedRaw.status, 'accepted');
  assert.equal(acceptedRaw.resultingJobId, acceptResult.jobId);
  assert.equal(acceptedRaw.revealedToWorker.employerPhone, employer.phone);
  assert.equal(acceptedRaw.revealedToEmployer.workerPhone, worker.phone);

  const workerViewAfterAccept = services.directOffer.redactOfferForViewer(acceptedRaw, worker.id);
  assert.equal(workerViewAfterAccept.status, 'accepted');
  assert.equal(workerViewAfterAccept.revealedToWorker.employerPhone, employer.phone);

  const employerViewAfterAccept = services.directOffer.redactOfferForViewer(acceptedRaw, employer.id);
  assert.equal(employerViewAfterAccept.status, 'accepted');
  assert.equal(employerViewAfterAccept.revealedToEmployer.workerPhone, worker.phone);

  const syntheticJob = await services.jobs.findById(acceptResult.jobId);
  assert.ok(syntheticJob, 'synthetic job should exist');
  assert.equal(syntheticJob.sourceType, 'direct_offer');
  assert.equal(syntheticJob.sourceOfferId, offerResult.offer.id);
  assert.equal(syntheticJob.status, 'in_progress');

  const syntheticApplications = await services.applications.listByJob(syntheticJob.id);
  assert.equal(syntheticApplications.length, 1);
  assert.equal(syntheticApplications[0].workerId, worker.id);
  assert.equal(syntheticApplications[0].status, 'accepted');

  const adAfterAccept = await services.availabilityAd.findById(activeAd.id);
  assert.equal(adAfterAccept.status, 'matched');
  assert.equal(adAfterAccept.matchedJobId, syntheticJob.id);

  const reconciliationResult = await services.availabilityAd.ensureMarkedAsMatched(activeAd.id, syntheticJob.id);
  assert.equal(reconciliationResult.ok, true);
  assert.equal(reconciliationResult.alreadyMatched, true, 'ensureMarkedAsMatched should be idempotent');

  // Synthetic direct-offer jobs are private by default in public listing.
  const publicInProgressJobs = await services.jobs.list({ status: 'in_progress' });
  assert.equal(
    publicInProgressJobs.some(job => job.id === syntheticJob.id),
    false,
    'public jobs.list should hide synthetic direct_offer jobs by default'
  );

  const explicitSyntheticJobs = await services.jobs.list({
    status: 'in_progress',
    sourceType: 'direct_offer',
  });

  assert.ok(
    explicitSyntheticJobs.some(job => job.id === syntheticJob.id),
    'jobs.list with sourceType=direct_offer should include synthetic job'
  );

  // ── Flow H: direct offer live status fanout ────────────────
  const liveFeedRes = createSseMockRes();
  services.liveFeed.registerConnection(employer.id, liveFeedRes, { governorate: 'cairo' });

  services.liveFeed.sendDirectOfferStatusToEmployer(employer.id, {
    offerId: offerResult.offer.id,
    workerId: worker.id,
    jobId: syntheticJob.id,
    status: 'accepted',
  });

  const acceptedEvent = await waitForSseEvent(
    liveFeedRes,
    'direct_offer_status',
    evt => evt.json && evt.json.offerId === offerResult.offer.id && evt.json.status === 'accepted'
  );

  assert.equal(acceptedEvent.json.jobId, syntheticJob.id);

  services.liveFeed.sendDirectOfferStatusToEmployer(employer.id, {
    offerId: 'dof_declined_patch26',
    status: 'declined',
    reason: 'busy',
  });

  const declinedEvent = await waitForSseEvent(
    liveFeedRes,
    'direct_offer_status',
    evt => evt.json && evt.json.offerId === 'dof_declined_patch26'
  );

  assert.equal(declinedEvent.json.status, 'declined');
  assert.equal(declinedEvent.json.reason, 'busy');

  services.liveFeed.sendDirectOfferStatusToEmployer(employer.id, {
    offerId: 'dof_expired_patch26',
    status: 'expired',
  });

  const expiredEvent = await waitForSseEvent(
    liveFeedRes,
    'direct_offer_status',
    evt => evt.json && evt.json.offerId === 'dof_expired_patch26'
  );

  assert.equal(expiredEvent.json.status, 'expired');

  liveFeedRes.close();
});
