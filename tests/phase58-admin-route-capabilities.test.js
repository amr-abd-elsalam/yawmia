import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('dangerous admin routes use least-privilege capabilities', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  const matrix = [
    {
      route: "/api/admin/users/:id/status",
      capability: "requireCapability('admin.users.status_limited')",
    },
    {
      route: "/api/admin/payments/:id/complete",
      capability: "requireCapability('admin.payments.complete')",
    },
    {
      route: "/api/admin/production/process-locks/:name/release",
      capability: "requireCapability('admin.locks.release')",
    },
    {
      route: "/api/admin/maintenance/enable",
      capability: "requireCapability('admin.maintenance.toggle')",
    },
    {
      route: "/api/admin/queue/repair",
      capability: "requireCapability('admin.queue.repair')",
    },
    {
      route: "/api/admin/schedulers/:name/disable",
      capability: "requireCapability('admin.schedulers.toggle')",
    },
    {
      route: "/api/admin/audit-log/export",
      capability: "requireCapability('admin.audit.export')",
    },
    {
      route: "/api/admin/privacy/requests/:id/anonymize",
      capability: "requireCapability('admin.privacy.anonymize')",
    },
  ];

  for (const row of matrix) {
    assert.ok(router.includes(row.route), `Missing route: ${row.route}`);
    assert.ok(router.includes(row.capability), `Missing capability for ${row.route}: ${row.capability}`);
  }
});

test('governance routes are not protected by broad requireAdmin only', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  const governanceCapabilities = [
    "requireCapability('admin.read')",
    "requireCapability('admin.approvals.write')",
    "requireCapability('admin.privacy.read')",
    "requireCapability('admin.privacy.write')",
    "requireCapability('admin.privacy.export')",
    "requireCapability('admin.privacy.anonymize')",
    "requireCapability('admin.ops.review')",
    "requireCapability('admin.postmortems.write')",
  ];

  for (const cap of governanceCapabilities) {
    assert.ok(router.includes(cap), `Missing governance capability: ${cap}`);
  }
});
