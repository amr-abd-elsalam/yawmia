// ═══════════════════════════════════════════════════════════════
// tests/phase45-soft-warnings.test.js — Phase 45 Soft Warning Handler Tests
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import crypto from 'node:crypto';

const TEST_DATA_DIR = `/tmp/yawmia-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
process.env.YAWMIA_DATA_PATH = TEST_DATA_DIR;
process.env.ADMIN_TOKEN = 'test_admin_token_phase45';

const { initDatabase, atomicWrite, getRecordPath } = await import('../server/services/database.js');
const abuseFlagReview = await import('../server/services/abuseFlagReview.js');
const { create: createUser } = await import('../server/services/users.js');
const { handleSendAbuseWarning } = await import('../server/handlers/adminHandler.js');
const { listByUser: listNotifications } = await import('../server/services/notifications.js');
const { listActions } = await import('../server/services/auditLog.js');

await initDatabase();

// Mock res object
function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    writableEnded: false,
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; return this; },
    end(data) { this.body = data; this.writableEnded = true; return this; },
  };
  return res;
}

test('Phase 45 — handleSendAbuseWarning creates admin_warning notification', async () => {
  // Create test user (employer)
  const user = await createUser('01012345601', 'employer');

  // Create flag review state
  const flag = { type: 'same_worker_spam', employerId: user.id, workerId: 'w_target' };
  const fp = abuseFlagReview.computeFingerprint(flag);
  await abuseFlagReview.recordReview({
    flag, adminId: 'init_admin', decision: 'dismissed',
  });

  // Mock req
  const req = {
    params: { id: fp },
    body: { message: 'يرجى الالتزام بسياسة المنصة' },
    user: { id: 'admin_test_user' },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
  const res = mockRes();

  await handleSendAbuseWarning(req, res);
  assert.equal(res.statusCode, 200);

  const responseData = JSON.parse(res.body);
  assert.equal(responseData.ok, true);
  assert.equal(responseData.targetUserId, user.id);

  // Verify notification was created
  const notifs = await listNotifications(user.id);
  const warning = notifs.items.find(n => n.type === 'admin_warning');
  assert.ok(warning, 'admin_warning notification should exist');
  assert.ok(warning.message.includes('سياسة'));
});

test('Phase 45 — Warning recorded in flag review history with decision="warning"', async () => {
  const user = await createUser('01012345602', 'employer');
  const flag = { type: 'high_decline_employer', employerId: user.id };
  const fp = abuseFlagReview.computeFingerprint(flag);

  // Init review state
  await abuseFlagReview.recordReview({ flag, adminId: 'a1', decision: 'dismissed' });

  const req = {
    params: { id: fp },
    body: { message: 'تنبيه: نسبة الرفض عالية' },
    user: { id: 'admin_test' },
    headers: {},
    socket: {},
  };
  const res = mockRes();

  await handleSendAbuseWarning(req, res);
  assert.equal(res.statusCode, 200);

  // Verify recorded in flag review
  const state = await abuseFlagReview.getReviewState(fp);
  const warningReview = state.reviews.find(r => r.decision === 'warning');
  assert.ok(warningReview);
  assert.ok(warningReview.note.includes('نسبة الرفض'));
  // currentStatus should NOT change to 'warning' (warning is informational, not state-changing)
  assert.notEqual(state.currentStatus, 'warning');
});

test('Phase 45 — Audit log captures abuse_warning_sent action', async () => {
  const user = await createUser('01012345603', 'employer');
  const flag = { type: 'same_worker_spam', employerId: user.id, workerId: 'w_audit' };
  const fp = abuseFlagReview.computeFingerprint(flag);
  await abuseFlagReview.recordReview({ flag, adminId: 'a1', decision: 'dismissed' });

  const req = {
    params: { id: fp },
    body: { message: 'audit test message' },
    user: { id: 'admin_audit' },
    headers: { 'x-forwarded-for': '10.0.0.1' },
    socket: {},
  };
  const res = mockRes();

  await handleSendAbuseWarning(req, res);
  assert.equal(res.statusCode, 200);

  // Allow audit log to flush (fire-and-forget)
  await new Promise(r => setTimeout(r, 100));

  const audit = await listActions({ action: 'abuse_warning_sent', limit: 10 });
  const entry = audit.actions.find(a => a.targetId === user.id);
  assert.ok(entry, 'Audit entry should exist');
  assert.equal(entry.adminId, 'admin_audit');
});

test('Phase 45 — Rate limit enforced (max warnings per user per week)', async () => {
  const user = await createUser('01012345604', 'employer');
  const flag = { type: 'same_worker_spam', employerId: user.id, workerId: 'w_rate' };
  const fp = abuseFlagReview.computeFingerprint(flag);
  await abuseFlagReview.recordReview({ flag, adminId: 'a1', decision: 'dismissed' });

  // Send 3 warnings (max)
  for (let i = 0; i < 3; i++) {
    const req = {
      params: { id: fp },
      body: { message: `warning ${i + 1}` },
      user: { id: 'admin_rl' },
      headers: {},
      socket: {},
    };
    const res = mockRes();
    await handleSendAbuseWarning(req, res);
    assert.equal(res.statusCode, 200, `Warning ${i + 1} should succeed`);
  }

  // 4th warning should be rate-limited
  const req4 = {
    params: { id: fp },
    body: { message: 'warning 4 (should fail)' },
    user: { id: 'admin_rl' },
    headers: {},
    socket: {},
  };
  const res4 = mockRes();
  await handleSendAbuseWarning(req4, res4);
  assert.equal(res4.statusCode, 429);
  const data = JSON.parse(res4.body);
  assert.equal(data.code, 'WARNING_RATE_LIMITED');
});

test('Phase 45 — Invalid message length rejected', async () => {
  const user = await createUser('01012345605', 'employer');
  const flag = { type: 'high_decline_employer', employerId: user.id };
  const fp = abuseFlagReview.computeFingerprint(flag);
  await abuseFlagReview.recordReview({ flag, adminId: 'a1', decision: 'dismissed' });

  // Too short
  let req = {
    params: { id: fp },
    body: { message: 'ab' },
    user: { id: 'admin' },
    headers: {}, socket: {},
  };
  let res = mockRes();
  await handleSendAbuseWarning(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(JSON.parse(res.body).code, 'INVALID_MESSAGE');

  // Too long
  req = {
    params: { id: fp },
    body: { message: 'x'.repeat(501) },
    user: { id: 'admin' },
    headers: {}, socket: {},
  };
  res = mockRes();
  await handleSendAbuseWarning(req, res);
  assert.equal(res.statusCode, 400);
});

// Cleanup
test('Phase 45 — cleanup', async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});
