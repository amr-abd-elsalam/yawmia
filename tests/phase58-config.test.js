import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../config.js';

test('Phase 58 config sections exist', () => {
  assert.equal(config.ADMIN_RBAC.enabled, true);
  assert.equal(config.PRIVACY_REQUESTS.enabled, true);
  assert.equal(config.OPS_REVIEW_RECORDS.enabled, true);
  assert.equal(config.POSTMORTEMS.enabled, true);
  assert.equal(config.ADMIN_APPROVALS.enabled, true);
});

test('Phase 58 database dirs exist', () => {
  assert.equal(config.DATABASE.dirs.privacy_requests, 'privacy_requests');
  assert.equal(config.DATABASE.dirs.ops_reviews, 'ops/reviews');
  assert.equal(config.DATABASE.dirs.postmortems, 'ops/postmortems');
  assert.equal(config.DATABASE.dirs.admin_approvals, 'ops/admin-approvals');
});

test('Phase 58 RBAC roles and core capabilities exist', () => {
  assert.ok(config.ADMIN_RBAC.roles.includes('super_admin'));
  assert.ok(config.ADMIN_RBAC.roles.includes('ops_admin'));
  assert.ok(config.ADMIN_RBAC.roles.includes('trust_admin'));
  assert.ok(config.ADMIN_RBAC.roles.includes('support_admin'));
  assert.ok(config.ADMIN_RBAC.roles.includes('finance_admin'));
  assert.ok(config.ADMIN_RBAC.roles.includes('read_only_admin'));

  assert.deepEqual(config.ADMIN_RBAC.capabilities.super_admin, ['*']);
  assert.ok(config.ADMIN_RBAC.capabilities.ops_admin.includes('admin.queue.repair'));
  assert.ok(config.ADMIN_RBAC.capabilities.trust_admin.includes('admin.predictive.review'));
  assert.ok(config.ADMIN_RBAC.capabilities.finance_admin.includes('admin.payments.complete'));
  assert.ok(config.ADMIN_RBAC.capabilities.support_admin.includes('admin.users.status_limited'));
  assert.ok(config.ADMIN_RBAC.capabilities.read_only_admin.includes('admin.audit.read'));
});

test('Phase 58 dangerous actions configured', () => {
  const actions = config.ADMIN_APPROVALS.dangerousActions;
  assert.ok(actions.includes('privacy_anonymize'));
  assert.ok(actions.includes('queue_repair'));
  assert.ok(actions.includes('process_lock_force_release'));
  assert.ok(actions.includes('maintenance_enable'));
});
