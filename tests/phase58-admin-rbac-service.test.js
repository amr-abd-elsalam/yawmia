import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAdminRole,
  hasCapability,
  listRoleCapabilities,
  getRbacMatrix,
  isDangerousAction,
  needsApproval,
} from '../server/services/adminRbac.js';

test('super_admin has all capabilities via wildcard', () => {
  assert.equal(hasCapability('super_admin', 'admin.anything'), true);
  assert.equal(hasCapability('super_admin', 'admin.privacy.anonymize'), true);
});

test('ops_admin can repair queue but cannot review abuse', () => {
  assert.equal(hasCapability('ops_admin', 'admin.queue.repair'), true);
  assert.equal(hasCapability('ops_admin', 'admin.abuse.review'), false);
});

test('trust_admin can review predictive signals but cannot release locks', () => {
  assert.equal(hasCapability('trust_admin', 'admin.predictive.review'), true);
  assert.equal(hasCapability('trust_admin', 'admin.locks.release'), false);
});

test('finance_admin can complete payment but cannot ban user', () => {
  assert.equal(hasCapability('finance_admin', 'admin.payments.complete'), true);
  assert.equal(hasCapability('finance_admin', 'admin.users.status_limited'), false);
});

test('support_admin can read users/status limited but cannot audit export', () => {
  assert.equal(hasCapability('support_admin', 'admin.users.status_limited'), true);
  assert.equal(hasCapability('support_admin', 'admin.audit.export'), false);
});

test('read_only_admin cannot write dangerous capabilities', () => {
  assert.equal(hasCapability('read_only_admin', 'admin.read'), true);
  assert.equal(hasCapability('read_only_admin', 'admin.queue.repair'), false);
  assert.equal(hasCapability('read_only_admin', 'admin.privacy.anonymize'), false);
});

test('admin token maps to configured tokenRole', () => {
  const req = { isAdmin: true };
  assert.equal(getAdminRole(req), 'super_admin');
});

test('admin session role reads user.adminRole', () => {
  const req = { user: { role: 'admin', adminRole: 'ops_admin' } };
  assert.equal(getAdminRole(req), 'ops_admin');
});

test('RBAC matrix is public-safe and contains roles', () => {
  const matrix = getRbacMatrix();
  assert.equal(matrix.enabled, true);
  assert.ok(matrix.roles.includes('super_admin'));
  assert.ok(matrix.capabilities.super_admin.includes('*'));
});

test('dangerous action and approval requirement helpers work', () => {
  assert.equal(isDangerousAction('privacy_anonymize'), true);
  assert.equal(isDangerousAction('not_real_action'), false);

  // super_admin bypasses approval by default config.
  assert.equal(needsApproval('privacy_anonymize', 'super_admin'), false);

  // non-super dangerous action requires approval.
  assert.equal(needsApproval('privacy_anonymize', 'ops_admin'), true);
});

test('listRoleCapabilities returns copy', () => {
  const caps = listRoleCapabilities('ops_admin');
  assert.ok(caps.includes('admin.queue.repair'));

  caps.push('mutated');
  const caps2 = listRoleCapabilities('ops_admin');
  assert.equal(caps2.includes('mutated'), false);
});
