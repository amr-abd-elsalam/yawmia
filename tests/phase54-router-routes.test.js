import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 54 production ops routes are registered in router', async () => {
  const router = await readFile('./server/router.js', 'utf-8');

  const expectedRoutes = [
    '/api/admin/production/readiness',
    '/api/admin/production/instance-mode',
    '/api/admin/production/process-locks',
    '/api/admin/production/process-locks/:name/release',
    '/api/admin/schedulers',
    '/api/admin/schedulers/:name/run',
    '/api/admin/schedulers/:name/enable',
    '/api/admin/schedulers/:name/disable',
    '/api/admin/schedulers/:name',
    '/api/admin/ops/rollups',
    '/api/admin/ops/slo',
    '/api/admin/incidents',
    '/api/admin/incidents/:id/resolve',
    '/api/admin/incidents/:id',
    '/api/admin/backups/restore-drill',
    '/api/admin/backups/restore-drills',
    '/api/admin/backups/restore-drills/:id',
    '/api/admin/maintenance',
    '/api/admin/maintenance/enable',
    '/api/admin/maintenance/disable',
  ];

  for (const route of expectedRoutes) {
    assert.match(router, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('Phase 54 routes require admin middleware', async () => {
  const router = await readFile('./server/router.js', 'utf-8');

  assert.match(router, /path:\s*'\/api\/admin\/production\/readiness',\s*middlewares:\s*\[requireAdmin\]/);
  assert.match(router, /path:\s*'\/api\/admin\/schedulers',\s*middlewares:\s*\[requireAdmin\]/);
  assert.match(router, /path:\s*'\/api\/admin\/maintenance',\s*middlewares:\s*\[requireAdmin\]/);
});
