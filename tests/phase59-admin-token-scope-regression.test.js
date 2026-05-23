import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin query token remains limited to download/export endpoints', async () => {
  const auth = await readFile('server/middleware/auth.js', 'utf-8');
  const rbac = await readFile('server/services/adminRbac.js', 'utf-8');

  assert.ok(auth.includes('queryTokenAllowed'));
  assert.ok(auth.includes("req.pathname === '/api/admin/audit-log/export'"));
  assert.ok(auth.includes("req.pathname.startsWith('/api/admin/export/')"));
  assert.ok(auth.includes("req.pathname.startsWith('/api/admin/exports/') && req.pathname.endsWith('/download')"));

  assert.ok(rbac.includes('queryTokenAllowed'));
  assert.ok(rbac.includes("req.pathname === '/api/admin/audit-log/export'"));
  assert.ok(rbac.includes("req.pathname.startsWith('/api/admin/export/')"));
  assert.ok(rbac.includes("req.pathname.startsWith('/api/admin/exports/') && req.pathname.endsWith('/download')"));

  assert.ok(!auth.includes('/api/admin/storage-pressure?token'));
  assert.ok(!rbac.includes('/api/admin/storage-pressure?token'));
});
