import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildNotificationAction,
  sanitizeActionUrl,
  isAllowedActionUrl,
  attachAction,
  getDefaultAction,
} from '../server/services/notificationActions.js';

test('Phase 53 notification actions: maps application_accepted to workroom URL', () => {
  const action = buildNotificationAction('application_accepted', { jobId: 'job_abc123' }, 'worker');

  assert.equal(action.type, 'job_workroom');
  assert.equal(action.url, '/job.html?id=job_abc123#workroom');
  assert.equal(action.entityType, 'job');
  assert.equal(action.entityId, 'job_abc123');
});

test('Phase 53 notification actions: maps new_message to workroom messages URL', () => {
  const action = buildNotificationAction('new_message', { jobId: 'job_abc123', messageId: 'msg_1' }, 'worker');

  assert.equal(action.type, 'workroom_messages');
  assert.equal(action.url, '/job.html?id=job_abc123#workroom-messages');
});

test('Phase 53 notification actions: maps verification_reviewed to profile verification section', () => {
  const action = buildNotificationAction('verification_reviewed', { verificationId: 'vrf_1' }, 'worker');

  assert.equal(action.type, 'verification');
  assert.equal(action.url, '/profile.html#verification-section');
});

test('Phase 53 notification actions: maps job_alert_match to job detail', () => {
  const action = buildNotificationAction('job_alert_match', { jobId: 'job_abc123' }, 'worker');

  assert.equal(action.type, 'job_detail');
  assert.equal(action.url, '/job.html?id=job_abc123');
});

test('Phase 53 notification actions: direct_offer falls back to dashboard with entity id', () => {
  const action = buildNotificationAction('direct_offer', { offerId: 'dof_abc123' }, 'worker');

  assert.equal(action.type, 'direct_offer');
  assert.equal(action.url, '/dashboard.html');
  assert.equal(action.entityType, 'direct_offer');
  assert.equal(action.entityId, 'dof_abc123');
});

test('Phase 53 notification actions: unsafe absolute URLs are rejected', () => {
  assert.equal(isAllowedActionUrl('https://evil.example.com'), false);
  assert.equal(isAllowedActionUrl('http://evil.example.com'), false);
  assert.equal(isAllowedActionUrl('//evil.example.com'), false);
  assert.equal(sanitizeActionUrl('https://evil.example.com'), '/dashboard.html');
});

test('Phase 53 notification actions: javascript/data URLs are rejected', () => {
  assert.equal(isAllowedActionUrl('javascript:alert(1)'), false);
  assert.equal(isAllowedActionUrl('data:text/html,hello'), false);
  assert.equal(sanitizeActionUrl('javascript:alert(1)'), '/dashboard.html');
});

test('Phase 53 notification actions: path traversal is rejected', () => {
  assert.equal(isAllowedActionUrl('/job.html?id=../secret'), false);
  assert.equal(isAllowedActionUrl('/profile.html#../x'), false);
  assert.equal(sanitizeActionUrl('/job.html?id=../secret'), '/dashboard.html');
});

test('Phase 53 notification actions: missing meta falls back safely', () => {
  const action = buildNotificationAction('payment_created', {}, 'employer');

  assert.equal(action.url, '/job.html');
  // If no jobId is available, sanitized buildUrl returns /job.html which is allowed.
  assert.equal(action.entityType, 'job');
  assert.equal(action.entityId, null);
});

test('Phase 53 notification actions: unknown type returns default action', () => {
  const action = buildNotificationAction('unknown_type', {}, 'worker');
  assert.deepEqual(action, getDefaultAction());
});

test('Phase 53 notification actions: attachAction keeps old notification shape additive', () => {
  const ntf = {
    id: 'ntf_x',
    userId: 'usr_x',
    type: 'new_message',
    message: 'رسالة جديدة',
    meta: { jobId: 'job_x' },
    read: false,
    createdAt: new Date().toISOString(),
    readAt: null,
  };

  const out = attachAction(ntf, 'worker');

  assert.equal(out.id, ntf.id);
  assert.equal(out.message, ntf.message);
  assert.equal(out.action.url, '/job.html?id=job_x#workroom-messages');
});

test('Phase 53 notification actions: attachAction sanitizes existing action override', () => {
  const ntf = {
    id: 'ntf_x',
    type: 'custom',
    meta: {},
    action: {
      type: 'custom',
      url: 'https://evil.example.com',
      entityType: null,
      entityId: null,
    },
  };

  const out = attachAction(ntf, 'worker');
  assert.equal(out.action.url, '/dashboard.html');
});
