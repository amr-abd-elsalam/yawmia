// ═══════════════════════════════════════════════════════════════
// tests/phase45-abuse-review.test.js — Phase 45 Flag Review Tests
// ═══════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import crypto from 'node:crypto';

const TEST_DATA_DIR = `/tmp/yawmia-test-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
process.env.YAWMIA_DATA_PATH = TEST_DATA_DIR;

const { initDatabase } = await import('../server/services/database.js');
const abuseFlagReview = await import('../server/services/abuseFlagReview.js');

await initDatabase();

test('Phase 45 — computeFingerprint produces consistent hash for same flag', () => {
  const flag1 = { type: 'same_worker_spam', employerId: 'e1', workerId: 'w1' };
  const flag2 = { type: 'same_worker_spam', employerId: 'e1', workerId: 'w1' };
  const fp1 = abuseFlagReview.computeFingerprint(flag1);
  const fp2 = abuseFlagReview.computeFingerprint(flag2);
  assert.equal(fp1, fp2);
  assert.equal(fp1.length, 64); // SHA256 hex
});

test('Phase 45 — computeFingerprint differs for different flag types', () => {
  const flag1 = { type: 'same_worker_spam', employerId: 'e1', workerId: 'w1' };
  const flag2 = { type: 'high_decline_employer', employerId: 'e1', workerId: 'w1' };
  assert.notEqual(abuseFlagReview.computeFingerprint(flag1), abuseFlagReview.computeFingerprint(flag2));
});

test('Phase 45 — recordReview creates new file if not exists', async () => {
  const flag = { type: 'same_worker_spam', employerId: 'e_new', workerId: 'w_new' };
  const fp = abuseFlagReview.computeFingerprint(flag);

  // Should not exist initially
  let state = await abuseFlagReview.getReviewState(fp);
  assert.equal(state, null);

  await abuseFlagReview.recordReview({
    flag, adminId: 'admin1', decision: 'dismissed', note: 'test',
  });

  state = await abuseFlagReview.getReviewState(fp);
  assert.ok(state);
  assert.equal(state.fingerprint, fp);
  assert.equal(state.reviews.length, 1);
  assert.equal(state.currentStatus, 'dismissed');
});

test('Phase 45 — recordReview appends to history if exists', async () => {
  const flag = { type: 'same_worker_spam', employerId: 'e_app', workerId: 'w_app' };
  const fp = abuseFlagReview.computeFingerprint(flag);

  await abuseFlagReview.recordReview({ flag, adminId: 'a1', decision: 'dismissed' });
  await abuseFlagReview.recordReview({ flag, adminId: 'a2', decision: 'dismissed', note: 'second review' });

  const state = await abuseFlagReview.getReviewState(fp);
  assert.equal(state.reviews.length, 2);
  assert.equal(state.occurrenceCount, 2);
});

test('Phase 45 — recordReview snoozed sets snoozeUntil', async () => {
  const flag = { type: 'high_decline_employer', employerId: 'e_snz' };
  const fp = abuseFlagReview.computeFingerprint(flag);

  const before = Date.now();
  await abuseFlagReview.recordReview({
    flag, adminId: 'a1', decision: 'snoozed', snoozeDays: 7,
  });

  const state = await abuseFlagReview.getReviewState(fp);
  assert.equal(state.currentStatus, 'snoozed');
  assert.ok(state.snoozeUntil);
  const snoozeMs = new Date(state.snoozeUntil).getTime();
  // 7 days = 604800000 ms; allow 1 second tolerance
  assert.ok(snoozeMs >= before + 7 * 86400000 - 1000);
  assert.ok(snoozeMs <= before + 7 * 86400000 + 1000);
});

test('Phase 45 — isCurrentlySnoozed returns true within window', async () => {
  const flag = { type: 'worker_offer_bombing', workerId: 'w_active_snz' };
  const fp = abuseFlagReview.computeFingerprint(flag);

  await abuseFlagReview.recordReview({
    flag, adminId: 'a1', decision: 'snoozed', snoozeDays: 7,
  });

  const snoozed = await abuseFlagReview.isCurrentlySnoozed(fp);
  assert.equal(snoozed, true);
});

test('Phase 45 — isCurrentlySnoozed lazy expiry returns false + updates state', async () => {
  const flag = { type: 'same_worker_spam', employerId: 'e_exp', workerId: 'w_exp' };
  const fp = abuseFlagReview.computeFingerprint(flag);

  // Manually create a state with expired snooze
  await abuseFlagReview.recordReview({
    flag, adminId: 'a1', decision: 'snoozed', snoozeDays: 7,
  });

  // Manually mutate snoozeUntil to past
  const state = await abuseFlagReview.getReviewState(fp);
  state.snoozeUntil = new Date(Date.now() - 1000).toISOString(); // 1s ago
  const { atomicWrite, getRecordPath } = await import('../server/services/database.js');
  await atomicWrite(getRecordPath('abuse_flag_reviews', fp), state);

  // First call should detect expiry and update
  const snoozed = await abuseFlagReview.isCurrentlySnoozed(fp);
  assert.equal(snoozed, false);

  // State should now be 'active'
  const updatedState = await abuseFlagReview.getReviewState(fp);
  assert.equal(updatedState.currentStatus, 'active');
  assert.equal(updatedState.snoozeUntil, null);
});

test('Phase 45 — detectAbuse filters snoozed flags (integration)', async () => {
  // Create raw offer data that would trigger same_worker_spam
  const { atomicWrite, getRecordPath, getCollectionPath } = await import('../server/services/database.js');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(getCollectionPath('direct_offers'), { recursive: true });

  const empId = 'emp_int_test';
  const wkrId = 'wrk_int_test';
  const now = new Date().toISOString();

  // Create 6 pending offers from same employer to same worker (triggers same_worker_spam @ threshold 5)
  for (let i = 0; i < 6; i++) {
    await atomicWrite(getRecordPath('direct_offers', `dof_int${i}`), {
      id: `dof_int${i}`,
      employerId: empId,
      workerId: wkrId,
      status: 'pending',
      createdAt: now,
    });
  }

  const offerAbuseDetector = await import('../server/services/offerAbuseDetector.js');

  // First detection — should find the flag
  const result1 = await offerAbuseDetector.detectAbuse();
  assert.ok(result1.flagCount >= 1);
  const flag = result1.flags.find(f => f.type === 'same_worker_spam' && f.employerId === empId);
  assert.ok(flag);
  assert.ok(flag.fingerprint);
  assert.ok(flag.reviewState !== undefined); // null or object

  // Snooze the flag
  await abuseFlagReview.recordReview({
    flag: { type: 'same_worker_spam', employerId: empId, workerId: wkrId },
    adminId: 'admin_test',
    decision: 'snoozed',
    snoozeDays: 7,
  });

  // Second detection — flag should be filtered out
  const result2 = await offerAbuseDetector.detectAbuse();
  const flagAfter = result2.flags.find(f => f.type === 'same_worker_spam' && f.employerId === empId);
  assert.equal(flagAfter, undefined, 'Snoozed flag should be filtered out');
});

test('Phase 45 — detectAbuse attaches fingerprint + reviewState to non-snoozed flags', async () => {
  const offerAbuseDetector = await import('../server/services/offerAbuseDetector.js');
  const result = await offerAbuseDetector.detectAbuse();

  // All flags returned should have fingerprint
  for (const f of result.flags) {
    assert.ok(f.fingerprint, 'Each flag should have fingerprint');
    assert.equal(f.fingerprint.length, 64);
    assert.ok(f.reviewState !== undefined, 'Each flag should have reviewState (null or object)');
  }
});

test('Phase 45 — recordReview decision="actioned" sets currentStatus', async () => {
  const flag = { type: 'high_decline_employer', employerId: 'e_act' };
  const fp = abuseFlagReview.computeFingerprint(flag);

  await abuseFlagReview.recordReview({
    flag, adminId: 'a1', decision: 'actioned', note: 'banned',
  });

  const state = await abuseFlagReview.getReviewState(fp);
  assert.equal(state.currentStatus, 'actioned');
  assert.equal(state.snoozeUntil, null);
});

// Cleanup
test('Phase 45 — cleanup', async () => {
  await rm(TEST_DATA_DIR, { recursive: true, force: true });
});
