import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('router includes Phase 58 governance routes', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  const routes = [
    '/api/admin/rbac/matrix',
    '/api/admin/rbac/me',
    '/api/admin/approvals',
    '/api/admin/approvals/:id/approve',
    '/api/admin/approvals/:id/reject',
    '/api/admin/privacy/requests',
    '/api/admin/privacy/requests/:id',
    '/api/admin/privacy/requests/:id/export',
    '/api/admin/privacy/requests/:id/anonymize',
    '/api/admin/privacy/requests/:id/cancel',
    '/api/admin/ops/reviews',
    '/api/admin/ops/reviews/:id',
    '/api/admin/ops/reviews/:id/complete',
    '/api/admin/incidents/:id/postmortem',
    '/api/admin/postmortems/:id',
    '/api/admin/postmortems',
  ];

  for (const route of routes) {
    assert.ok(router.includes(route), `Missing route: ${route}`);
  }
});

test('router applies capability checks to dangerous routes', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  const capabilities = [
    "requireCapability('admin.users.status_limited')",
    "requireCapability('admin.payments.complete')",
    "requireCapability('admin.reports.review')",
    "requireCapability('admin.verifications.review')",
    "requireCapability('admin.locks.release')",
    "requireCapability('admin.maintenance.toggle')",
    "requireCapability('admin.queue.repair')",
    "requireCapability('admin.schedulers.toggle')",
    "requireCapability('admin.predictive.review')",
    "requireCapability('admin.trust.calibration')",
    "requireCapability('admin.audit.export')",
  ];

  for (const cap of capabilities) {
    assert.ok(router.includes(cap), `Missing capability check: ${cap}`);
  }
});

test('router docs version is 0.57.0', async () => {
  const router = await readFile('server/router.js', 'utf-8');
  assert.match(router, /version:\s*'0\.57\.0'/);
});
