// ═══════════════════════════════════════════════════════════════
// tests/e2e/governance-privacy-smoke.test.js
// Patch 31 — Admin Approval + Privacy Request Queue Smoke
// ═══════════════════════════════════════════════════════════════
//
// Test-only confidence layer for governance/privacy workflow surfaces.
//
// Covers:
//   - admin approval create/list/get/approve/reject lifecycle
//   - privacy request create/list/get/cancel lifecycle
//   - privacy export queue enqueue smoke
//   - privacy anonymization preview smoke
//   - privacy anonymization queue enqueue with approved approvalId
//   - queue job metadata under temp YAWMIA_DATA_PATH
//
// Safety:
//   - temp YAWMIA_DATA_PATH only
//   - no ./data mutation
//   - no server.js import
//   - no queue workers
//   - no schedulers
//   - no OTP weakening
//   - no --confirm
//   - no real anonymization execution
//   - no external services
//   - no dependencies
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.NODE_ENV = 'test';
process.env.ADMIN_TOKEN = 'test-admin-token';

async function setupTempDataPath() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-governance-privacy-smoke-'));
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
  const adminApprovals = await importFresh('../../server/services/adminApprovals.js');
  const privacyRequests = await importFresh('../../server/services/privacyRequests.js');
  const userAnonymization = await importFresh('../../server/services/userAnonymization.js');
  const opsQueue = await importFresh('../../server/services/opsQueue.js');

  return {
    database,
    users,
    adminApprovals,
    privacyRequests,
    userAnonymization,
    opsQueue,
  };
}

async function createWorker(services, suffix = '001') {
  const user = await services.users.create(`01131000${suffix}`, 'worker');

  const updated = await services.users.update(user.id, {
    name: `عامل Privacy Smoke ${suffix}`,
    governorate: 'cairo',
    categories: ['cleaning'],
    lat: 30.0444,
    lng: 31.2357,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: '1.0',
    verificationStatus: 'verified',
  });

  return updated || user;
}

test('Patch 31: admin approval lifecycle smoke covers create/list/get/approve/reject', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    // Safe: removes only this test-created temp directory under os.tmpdir(), never ./data.
    await rm(tempDir, { recursive: true, force: true });
  });

  const services = await loadServices();

  const worker = await createWorker(services, '001');
  const adminId = 'admin_token';

  const createResult = await services.adminApprovals.createApprovalRequest({
    action: 'privacy_anonymize',
    targetType: 'user',
    targetId: worker.id,
    requestedBy: adminId,
    reason: 'Patch 31 smoke approval for privacy anonymization',
    payload: {
      userId: worker.id,
      note: 'test-only approval payload',
      token: 'should be redacted',
    },
  });

  assert.equal(createResult.ok, true, createResult.error || 'approval request should be created');
  assert.ok(createResult.approval.id.startsWith('apr_'));
  assert.equal(createResult.approval.status, 'pending');
  assert.equal(createResult.approval.action, 'privacy_anonymize');
  assert.equal(createResult.approval.targetId, worker.id);
  assert.equal(createResult.approval.payload.token, '[redacted]');

  const fetched = await services.adminApprovals.getApproval(createResult.approval.id);
  assert.ok(fetched, 'created approval should be readable');
  assert.equal(fetched.id, createResult.approval.id);
  assert.equal(fetched.status, 'pending');

  const pendingList = await services.adminApprovals.listApprovals({
    status: 'pending',
    limit: 20,
    offset: 0,
  });

  assert.ok(
    pendingList.approvals.some(a => a.id === createResult.approval.id),
    'pending list should include created approval'
  );

  const approveResult = await services.adminApprovals.approveRequest(
    createResult.approval.id,
    adminId,
    'Approved for Patch 31 smoke test'
  );

  assert.equal(approveResult.ok, true, approveResult.error || 'approval should be approved');
  assert.equal(approveResult.approval.status, 'approved');
  assert.equal(approveResult.approval.approvedBy, adminId);

  const valid = await services.adminApprovals.isApprovalValid(
    createResult.approval.id,
    'privacy_anonymize',
    worker.id
  );

  assert.equal(valid, true, 'approved approval should validate for privacy_anonymize + target user');

  const mismatchValid = await services.adminApprovals.isApprovalValid(
    createResult.approval.id,
    'privacy_anonymize',
    'usr_wrong_target'
  );

  assert.equal(mismatchValid, false, 'approval should not validate for a different target');

  const rejectCandidate = await services.adminApprovals.createApprovalRequest({
    action: 'queue_repair',
    targetType: 'queue',
    targetId: 'ops_queue',
    requestedBy: adminId,
    reason: 'Patch 31 smoke rejection path',
  });

  assert.equal(rejectCandidate.ok, true, rejectCandidate.error || 'second approval should be created');

  const rejectResult = await services.adminApprovals.rejectRequest(
    rejectCandidate.approval.id,
    adminId,
    'Rejected by Patch 31 smoke test'
  );

  assert.equal(rejectResult.ok, true, rejectResult.error || 'approval should be rejected');
  assert.equal(rejectResult.approval.status, 'rejected');
  assert.equal(rejectResult.approval.rejectedBy, adminId);

  const rejectedList = await services.adminApprovals.listApprovals({
    status: 'rejected',
    limit: 20,
    offset: 0,
  });

  assert.ok(
    rejectedList.approvals.some(a => a.id === rejectCandidate.approval.id),
    'rejected list should include rejected approval'
  );
});

test('Patch 31: privacy request lifecycle queues export/anonymize jobs under temp data path', async (t) => {
  const tempDir = await setupTempDataPath();

  t.after(async () => {
    // Safe: removes only this test-created temp directory under os.tmpdir(), never ./data.
    await rm(tempDir, { recursive: true, force: true });
  });

  const services = await loadServices();

  const worker = await createWorker(services, '002');
  const adminId = 'admin_token';

  // ── Privacy export request lifecycle + queue enqueue ──────
  const exportRequestResult = await services.privacyRequests.createPrivacyRequest({
    type: 'user_data_export',
    userId: worker.id,
    requestedBy: adminId,
    reason: 'Patch 31 smoke export request',
  });

  assert.equal(exportRequestResult.ok, true, exportRequestResult.error || 'privacy export request should be created');
  assert.ok(exportRequestResult.request.id.startsWith('prq_'));
  assert.equal(exportRequestResult.request.type, 'user_data_export');
  assert.equal(exportRequestResult.request.status, 'requested');
  assert.equal(exportRequestResult.request.userId, worker.id);

  const fetchedExportRequest = await services.privacyRequests.getPrivacyRequest(exportRequestResult.request.id);
  assert.ok(fetchedExportRequest, 'created privacy export request should be readable');
  assert.equal(fetchedExportRequest.id, exportRequestResult.request.id);

  const requestList = await services.privacyRequests.listPrivacyRequests({
    userId: worker.id,
    limit: 20,
    offset: 0,
  });

  assert.ok(
    requestList.requests.some(r => r.id === exportRequestResult.request.id),
    'privacy request list should include created export request'
  );

  const queuedExport = await services.privacyRequests.queuePrivacyExport(
    exportRequestResult.request.id,
    adminId
  );

  assert.equal(queuedExport.ok, true, queuedExport.error || 'privacy export should enqueue queue job');
  assert.ok(queuedExport.queueJob.id.startsWith('q_'));
  assert.equal(queuedExport.queueJob.type, 'privacy_user_data_export');
  assert.equal(queuedExport.queueJob.status, 'pending');
  assert.equal(queuedExport.queueJob.payload.requestId, exportRequestResult.request.id);
  assert.equal(queuedExport.queueJob.payload.userId, worker.id);

  const exportRequestAfterQueue = await services.privacyRequests.getPrivacyRequest(exportRequestResult.request.id);
  assert.equal(exportRequestAfterQueue.status, 'queued');
  assert.equal(exportRequestAfterQueue.queueJobId, queuedExport.queueJob.id);

  const exportQueueJob = await services.opsQueue.getJob(queuedExport.queueJob.id);
  assert.ok(exportQueueJob, 'queued privacy export job should be readable from queue storage');
  assert.equal(exportQueueJob.type, 'privacy_user_data_export');
  assert.equal(exportQueueJob.status, 'pending');
  assert.equal(exportQueueJob.createdBy, adminId);

  const exportQueueList = await services.opsQueue.listJobs({
    type: 'privacy_user_data_export',
    status: 'pending',
    limit: 20,
    offset: 0,
  });

  assert.ok(
    exportQueueList.jobs.some(j => j.id === queuedExport.queueJob.id),
    'queue list should include pending privacy export job'
  );

  // ── Cancel path on a separate request ─────────────────────
  const cancelRequestResult = await services.privacyRequests.createPrivacyRequest({
    type: 'user_data_export',
    userId: worker.id,
    requestedBy: adminId,
    reason: 'Patch 31 smoke cancel request',
  });

  assert.equal(cancelRequestResult.ok, true);

  const cancelResult = await services.privacyRequests.cancelPrivacyRequest(
    cancelRequestResult.request.id,
    adminId
  );

  assert.equal(cancelResult.ok, true, cancelResult.error || 'privacy request should be cancellable');
  assert.equal(cancelResult.request.status, 'cancelled');
  assert.equal(cancelResult.request.cancelledBy, adminId);

  // ── Privacy anonymization preview + approved queue enqueue ─
  const anonymizeRequestResult = await services.privacyRequests.createPrivacyRequest({
    type: 'user_anonymization',
    userId: worker.id,
    requestedBy: adminId,
    reason: 'Patch 31 smoke anonymization request',
  });

  assert.equal(anonymizeRequestResult.ok, true, anonymizeRequestResult.error || 'anonymization request should be created');
  assert.equal(anonymizeRequestResult.request.type, 'user_anonymization');
  assert.equal(anonymizeRequestResult.request.status, 'requested');

  const preview = await services.userAnonymization.previewUserAnonymization(worker.id, {
    requestId: anonymizeRequestResult.request.id,
  });

  assert.equal(preview.ok, true, preview.error || 'anonymization preview should succeed');
  assert.equal(preview.userId, worker.id);
  assert.equal(preview.dryRun, true);
  assert.equal(preview.destructive, true);
  assert.ok(preview.anonId.startsWith('anon_'));
  assert.equal(typeof preview.counts, 'object');

  const approvalResult = await services.adminApprovals.createApprovalRequest({
    action: 'privacy_anonymize',
    targetType: 'user',
    targetId: worker.id,
    requestedBy: adminId,
    reason: 'Patch 31 approved anonymization queue smoke',
    payload: {
      requestId: anonymizeRequestResult.request.id,
      userId: worker.id,
    },
  });

  assert.equal(approvalResult.ok, true, approvalResult.error || 'privacy anonymize approval should be created');

  const approved = await services.adminApprovals.approveRequest(
    approvalResult.approval.id,
    adminId,
    'Approved for queue enqueue smoke only; queue worker is not started'
  );

  assert.equal(approved.ok, true, approved.error || 'privacy anonymize approval should be approved');
  assert.equal(approved.approval.status, 'approved');

  const validApproval = await services.adminApprovals.isApprovalValid(
    approvalResult.approval.id,
    'privacy_anonymize',
    worker.id
  );

  assert.equal(validApproval, true, 'approved privacy anonymize approval should validate');

  const queuedAnonymization = await services.privacyRequests.queueUserAnonymization(
    anonymizeRequestResult.request.id,
    adminId,
    approvalResult.approval.id
  );

  assert.equal(queuedAnonymization.ok, true, queuedAnonymization.error || 'privacy anonymization should enqueue queue job');
  assert.ok(queuedAnonymization.queueJob.id.startsWith('q_'));
  assert.equal(queuedAnonymization.queueJob.type, 'privacy_user_anonymization');
  assert.equal(queuedAnonymization.queueJob.status, 'pending');
  assert.equal(queuedAnonymization.queueJob.payload.requestId, anonymizeRequestResult.request.id);
  assert.equal(queuedAnonymization.queueJob.payload.userId, worker.id);
  assert.equal(queuedAnonymization.queueJob.payload.approvalId, approvalResult.approval.id);
  assert.equal(queuedAnonymization.queueJob.payload.options.confirm, true);

  const anonymizeRequestAfterQueue = await services.privacyRequests.getPrivacyRequest(anonymizeRequestResult.request.id);
  assert.equal(anonymizeRequestAfterQueue.status, 'queued');
  assert.equal(anonymizeRequestAfterQueue.queueJobId, queuedAnonymization.queueJob.id);
  assert.equal(anonymizeRequestAfterQueue.approvalId, approvalResult.approval.id);

  const anonymizeQueueJob = await services.opsQueue.getJob(queuedAnonymization.queueJob.id);
  assert.ok(anonymizeQueueJob, 'queued privacy anonymization job should be readable from queue storage');
  assert.equal(anonymizeQueueJob.type, 'privacy_user_anonymization');
  assert.equal(anonymizeQueueJob.status, 'pending');
  assert.equal(anonymizeQueueJob.createdBy, adminId);

  const anonymizeQueueList = await services.opsQueue.listJobs({
    type: 'privacy_user_anonymization',
    status: 'pending',
    limit: 20,
    offset: 0,
  });

  assert.ok(
    anonymizeQueueList.jobs.some(j => j.id === queuedAnonymization.queueJob.id),
    'queue list should include pending privacy anonymization job'
  );

  const queueStats = await services.opsQueue.getQueueStats();
  assert.equal(queueStats.enabled, true);
  assert.ok(
    (queueStats.byStatus?.pending || 0) >= 2,
    'queue stats should reflect pending privacy export/anonymization jobs'
  );
});
