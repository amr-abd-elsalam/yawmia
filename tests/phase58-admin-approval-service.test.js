import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTempDb() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase58-approvals-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?approvals=${Date.now()}`);
  await db.initDatabase();

  return { dir };
}

test('admin approval lifecycle: create approve consume once', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/adminApprovals.js?approvals=${Date.now()}`);

    const created = await svc.createApprovalRequest({
      action: 'privacy_anonymize',
      targetType: 'user',
      targetId: 'usr_abc',
      requestedBy: 'adm_1',
      reason: 'privacy request verified',
      payload: {
        token: 'secret-token',
        note: 'safe note',
      },
    });

    assert.equal(created.ok, true);
    assert.equal(created.approval.status, 'pending');
    assert.equal(created.approval.payload.token, '[redacted]');

    const approved = await svc.approveRequest(created.approval.id, 'adm_2', 'approved');
    assert.equal(approved.ok, true);
    assert.equal(approved.approval.status, 'approved');

    const valid = await svc.isApprovalValid(created.approval.id, 'privacy_anonymize', 'usr_abc');
    assert.equal(valid, true);

    const consumed = await svc.consumeApproval(created.approval.id, 'privacy_anonymize', 'usr_abc');
    assert.equal(consumed.ok, true);
    assert.equal(consumed.approval.status, 'consumed');

    const consumedAgain = await svc.consumeApproval(created.approval.id, 'privacy_anonymize', 'usr_abc');
    assert.equal(consumedAgain.ok, false);
    assert.equal(consumedAgain.code, 'APPROVAL_NOT_APPROVED');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('admin approval reject and wrong target/action validation', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/adminApprovals.js?approvals2=${Date.now()}`);

    const created = await svc.createApprovalRequest({
      action: 'queue_repair',
      targetType: 'queue',
      targetId: 'queue',
      requestedBy: 'adm_1',
      reason: 'repair needed',
    });

    assert.equal(created.ok, true);

    const wrongAction = await svc.consumeApproval(created.approval.id, 'privacy_anonymize', 'usr_abc');
    assert.equal(wrongAction.ok, false);

    const rejected = await svc.rejectRequest(created.approval.id, 'adm_2', 'not safe');
    assert.equal(rejected.ok, true);
    assert.equal(rejected.approval.status, 'rejected');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('expired approval is invalid', async () => {
  const { dir } = await setupTempDb();

  try {
    const svc = await import(`../server/services/adminApprovals.js?approvals3=${Date.now()}`);

    const created = await svc.createApprovalRequest({
      action: 'privacy_anonymize',
      targetType: 'user',
      targetId: 'usr_expired',
      requestedBy: 'adm_1',
      reason: 'test',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });

    assert.equal(created.ok, true);

    const approval = await svc.getApproval(created.approval.id);
    assert.equal(approval.status, 'expired');

    const valid = await svc.isApprovalValid(created.approval.id, 'privacy_anonymize', 'usr_expired');
    assert.equal(valid, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
