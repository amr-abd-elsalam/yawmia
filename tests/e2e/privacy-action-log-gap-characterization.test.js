// ═══════════════════════════════════════════════════════════════
// tests/e2e/privacy-action-log-gap-characterization.test.js
// Patch 50 — Privacy Action Log Gap Characterization
// ═══════════════════════════════════════════════════════════════
// Goal:
//   Characterize current privacy/anonymization workflow as lacking a
//   transaction-backed durable privacy_action_log.
//
// Current runtime behavior:
//   - privacy requests are file-backed records
//   - anonymization is queued through file-backed ops queue
//   - approval validity is checked before enqueue
//   - approval consumption happens later inside the queue worker
//   - userAnonymization mutates multiple collections
//   - userAnonymization emits in-memory privacy:user_anonymized event
//   - no privacy_action_log collection exists
//   - no PrivacyActionLogRepository exists in the runtime workflow
//   - no transaction manager is used
//   - no durable outbox is written for privacy events
//
// This test intentionally documents a production gap.
// It must not be interpreted as privacy compliance readiness proof.
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no ./data mutation
//   - no server.js import
//   - no router.js import
//   - no queue workers started
//   - no schedulers started
//   - no real anonymization execution
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
  return await import(`${path}?privacy-action-log-gap=${Date.now()}-${importCounter}`);
}

async function setupIsolatedDataPath(t) {
  const dataPath = await mkdtemp(join(tmpdir(), 'yawmia-privacy-action-log-gap-'));

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
  // Use canonical database module used by service internals.
  const database = await import('../../server/services/database.js');
  await database.initDatabase();

  const users = await importFresh('../../server/services/users.js');
  const privacyRequests = await importFresh('../../server/services/privacyRequests.js');
  const adminApprovals = await importFresh('../../server/services/adminApprovals.js');
  const opsQueue = await importFresh('../../server/services/opsQueue.js');

  return {
    database,
    users,
    privacyRequests,
    adminApprovals,
    opsQueue,
  };
}

async function createWorkerUser(services, suffix = '001') {
  const user = await services.users.create(`01149000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Privacy Gap ${suffix}`,
    governorate: 'cairo',
    categories: ['cleaning'],
    lat: 30.05,
    lng: 31.24,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

test('config and database have privacy_requests but no privacy_action_log collection', async (t) => {
  const { database } = await setupIsolatedDataPath(t);
  const { default: config } = await importFresh('../../config.js');

  assert.equal(
    config.DATABASE.dirs.privacy_requests,
    'privacy_requests',
    'privacy_requests collection exists'
  );

  assert.equal(
    config.DATABASE.dirs.privacy_action_log,
    undefined,
    'current config has no privacy_action_log collection'
  );

  assert.throws(
    () => database.getCollectionPath('privacy_action_log'),
    /Unknown collection: privacy_action_log/,
    'database has no privacy_action_log collection path'
  );
});

test('queueUserAnonymization queues anonymization but does not create privacy action log entries', async (t) => {
  const { database } = await setupIsolatedDataPath(t);
  const services = await loadServices();

  const user = await createWorkerUser(services, '001');

  const approvalCreate = await services.adminApprovals.createApprovalRequest({
    action: 'privacy_anonymize',
    targetType: 'user',
    targetId: user.id,
    requestedBy: 'admin_token',
    reason: 'Privacy action log gap characterization approval',
    payload: {
      userId: user.id,
      testOnly: true,
    },
  });

  assert.equal(
    approvalCreate.ok,
    true,
    approvalCreate.error || approvalCreate.code || 'approval request should be created'
  );

  const approvalResult = await services.adminApprovals.approveRequest(
    approvalCreate.approval.id,
    'admin_token',
    'Approved for characterization test only'
  );

  assert.equal(
    approvalResult.ok,
    true,
    approvalResult.error || approvalResult.code || 'approval should be approved'
  );

  const requestResult = await services.privacyRequests.createPrivacyRequest({
    type: 'user_anonymization',
    userId: user.id,
    requestedBy: 'admin_token',
    reason: 'Privacy action log gap characterization request',
    approvalId: approvalCreate.approval.id,
  });

  assert.equal(
    requestResult.ok,
    true,
    requestResult.error || requestResult.code || 'privacy request should be created'
  );

  const queueResult = await services.privacyRequests.queueUserAnonymization(
    requestResult.request.id,
    'admin_token',
    approvalCreate.approval.id
  );

  assert.equal(
    queueResult.ok,
    true,
    queueResult.error || queueResult.code || 'anonymization should be queued'
  );

  assert.equal(queueResult.request.status, 'queued');
  assert.ok(queueResult.request.queueJobId, 'queued request should store queueJobId');

  const queuedJob = await services.opsQueue.getJob(queueResult.request.queueJobId);
  assert.ok(queuedJob, 'queue job should exist');
  assert.equal(queuedJob.type, 'privacy_user_anonymization');
  assert.equal(queuedJob.payload.requestId, requestResult.request.id);
  assert.equal(queuedJob.payload.userId, user.id);
  assert.equal(queuedJob.payload.approvalId, approvalCreate.approval.id);

  const approvalAfterQueue = await services.adminApprovals.getApproval(approvalCreate.approval.id);
  assert.equal(
    approvalAfterQueue.status,
    'approved',
    'approval is checked before enqueue but not consumed during queueUserAnonymization'
  );

  assert.throws(
    () => database.getCollectionPath('privacy_action_log'),
    /Unknown collection: privacy_action_log/,
    'queueing anonymization does not create a durable privacy_action_log collection'
  );

  assert.equal(
    queueResult.request.privacyActionLogId,
    undefined,
    'privacy request stores no privacy action log identity'
  );

  assert.equal(
    queuedJob.payload.privacyActionLogId,
    undefined,
    'queued anonymization job stores no privacy action log identity'
  );
});

test('privacy request lifecycle source uses file-backed request state and in-memory events without transaction/action-log repository', async () => {
  const { default: config } = await importFresh('../../config.js');

  const privacyRequestsSource = await readFile(
    new URL('../../server/services/privacyRequests.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    privacyRequestsSource,
    /atomicWrite\(requestPath\(id\), record\)/,
    'privacy request creation writes a file-backed privacy request record'
  );

  assert.match(
    privacyRequestsSource,
    /eventBus\.emit\('privacy_request:created'/,
    'privacy request creation emits an in-memory created event'
  );

  assert.match(
    privacyRequestsSource,
    /eventBus\.emit\('privacy_request:queued'/,
    'privacy request queueing emits an in-memory queued event'
  );

  assert.match(
    privacyRequestsSource,
    /eventBus\.emit\('privacy_request:completed'/,
    'privacy request completion emits an in-memory completed event'
  );

  assert.match(
    privacyRequestsSource,
    /isApprovalValid\(approvalId \|\| record\.approvalId, 'privacy_anonymize', record\.userId\)/,
    'approval validity is checked before anonymization enqueue'
  );

  assert.match(
    privacyRequestsSource,
    /type: 'privacy_user_anonymization'/,
    'privacy anonymization is queued as an ops queue job'
  );

  assert.equal(
    privacyRequestsSource.includes('PrivacyActionLogRepository'),
    false,
    'privacyRequests service does not use PrivacyActionLogRepository'
  );

  assert.equal(
    privacyRequestsSource.includes('privacy_action_log'),
    false,
    'privacyRequests service does not write privacy_action_log records'
  );

  assert.equal(
    privacyRequestsSource.includes('withTransaction'),
    false,
    'privacyRequests service does not use a transaction manager'
  );

  assert.equal(
    privacyRequestsSource.includes('OutboxRepository'),
    false,
    'privacyRequests service does not use OutboxRepository'
  );

  assert.equal(
    config.DATABASE.dirs.privacy_action_log,
    undefined,
    'config has no privacy_action_log collection/table'
  );
});

test('queue worker consumes approval, anonymizes user, and completes request as separate non-transactional steps', async () => {
  const queueWorkersSource = await readFile(
    new URL('../../server/services/queueWorkers.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    queueWorkersSource,
    /registerJobHandler\('privacy_user_anonymization', handlePrivacyUserAnonymizationJob\)/,
    'queue worker registers privacy_user_anonymization handler'
  );

  assert.match(
    queueWorkersSource,
    /consumeApproval\(\s*payload\.approvalId,\s*'privacy_anonymize',\s*payload\.userId\s*\)/s,
    'queue worker consumes approval inside anonymization handler'
  );

  assert.match(
    queueWorkersSource,
    /anonymizer\.anonymizeUserData\(payload\.userId,/,
    'queue worker calls userAnonymization.anonymizeUserData'
  );

  assert.match(
    queueWorkersSource,
    /privacy\.completePrivacyRequest\(payload\.requestId,/,
    'queue worker completes privacy request after anonymization result'
  );

  assert.match(
    queueWorkersSource,
    /privacy\.failPrivacyRequest\(payload\.requestId,/,
    'queue worker marks privacy request failed on error'
  );

  const handlerStart = queueWorkersSource.indexOf('async function handlePrivacyUserAnonymizationJob');
  const handlerEnd = queueWorkersSource.indexOf('\nexport const _testHelpers', handlerStart);

  assert.ok(
    handlerStart >= 0,
    'queue worker source should include handlePrivacyUserAnonymizationJob'
  );

  assert.ok(
    handlerEnd > handlerStart,
    'queue worker source should expose test helpers after privacy anonymization handler'
  );

  const anonymizationHandlerSource = queueWorkersSource.slice(handlerStart, handlerEnd);

  const consumeIdx = anonymizationHandlerSource.indexOf('consumeApproval(');
  const anonymizeIdx = anonymizationHandlerSource.indexOf('anonymizer.anonymizeUserData(payload.userId');
  const completeIdx = anonymizationHandlerSource.indexOf('privacy.completePrivacyRequest(payload.requestId');

  assert.ok(consumeIdx >= 0, 'approval consumption call should exist inside anonymization handler');
  assert.ok(anonymizeIdx >= 0, 'anonymizeUserData call should exist inside anonymization handler');
  assert.ok(completeIdx >= 0, 'completePrivacyRequest call should exist inside anonymization handler');

  assert.ok(
    consumeIdx < anonymizeIdx && anonymizeIdx < completeIdx,
    'approval consumption, anonymization, and request completion happen as separate sequential steps inside the anonymization handler'
  );

  assert.equal(
    queueWorkersSource.includes('withTransaction'),
    false,
    'queue worker privacy handler does not use a transaction manager'
  );

  assert.equal(
    queueWorkersSource.includes('PrivacyActionLogRepository'),
    false,
    'queue worker privacy handler does not use PrivacyActionLogRepository'
  );

  assert.equal(
    queueWorkersSource.includes('privacy_action_log'),
    false,
    'queue worker privacy handler does not write privacy_action_log records'
  );

  assert.equal(
    queueWorkersSource.includes('OutboxRepository'),
    false,
    'queue worker privacy handler does not write durable outbox events'
  );
});

test('user anonymization mutates multiple collections and emits in-memory event without durable privacy action log', async () => {
  const userAnonymizationSource = await readFile(
    new URL('../../server/services/userAnonymization.js', import.meta.url),
    'utf-8'
  );

  assert.match(
    userAnonymizationSource,
    /destroySessions\(userId\)/,
    'anonymization destroys user sessions'
  );

  assert.match(
    userAnonymizationSource,
    /anonymizeUserRecord\(user\)/,
    'anonymization updates the user record'
  );

  assert.match(
    userAnonymizationSource,
    /anonymizeVerifications\(userId\)/,
    'anonymization scrubs verification records/images'
  );

  assert.match(
    userAnonymizationSource,
    /deleteUserNotifications\(userId\)/,
    'anonymization deletes user notifications'
  );

  assert.match(
    userAnonymizationSource,
    /scrubDirectOffers\(userId\)/,
    'anonymization scrubs direct offer identity fields'
  );

  assert.match(
    userAnonymizationSource,
    /scrubPredictiveSignals\(userId\)/,
    'anonymization scrubs predictive signal references'
  );

  assert.match(
    userAnonymizationSource,
    /eventBus\.emit\('privacy:user_anonymized'/,
    'anonymization emits privacy:user_anonymized through in-memory EventBus'
  );

  assert.match(
    userAnonymizationSource,
    /financialRecordsPreserved: true/,
    'anonymization preserves financial records but does not log a transaction-backed privacy action'
  );

  assert.match(
    userAnonymizationSource,
    /auditRecordsPreserved: true/,
    'anonymization preserves audit records but does not log a transaction-backed privacy action'
  );

  const mutationPatterns = [
    /await atomicWrite\(getRecordPath\('users'/,
    /await atomicWrite\(getRecordPath\('verifications'/,
    /await deleteJSON\(getRecordPath\('notifications'/,
    /await atomicWrite\(getRecordPath\('direct_offers'/,
    /await atomicWrite\(getRecordPath\('predictive_signals'/,
  ];

  for (const pattern of mutationPatterns) {
    assert.match(
      userAnonymizationSource,
      pattern,
      `expected anonymization source to include mutation pattern ${pattern}`
    );
  }

  assert.equal(
    userAnonymizationSource.includes('PrivacyActionLogRepository'),
    false,
    'userAnonymization service does not use PrivacyActionLogRepository'
  );

  assert.equal(
    userAnonymizationSource.includes('privacy_action_log'),
    false,
    'userAnonymization service does not write privacy_action_log records'
  );

  assert.equal(
    userAnonymizationSource.includes('withTransaction'),
    false,
    'userAnonymization service does not use a transaction manager'
  );

  assert.equal(
    userAnonymizationSource.includes('OutboxRepository'),
    false,
    'userAnonymization service does not use OutboxRepository'
  );
});
