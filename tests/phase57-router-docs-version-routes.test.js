import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('router docs route includes Phase 57 version string', async () => {
  const router = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');
  assert.match(router, /version: '0\.57\.0'/);
});

test('router registers Phase 57 operational routes', async () => {
  const router = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');

  const routes = [
    '/api/admin/production/deployment-gate',
    '/api/admin/production/scheduler-cadence',
    '/api/admin/production/ops-review',
    '/api/admin/scale-hygiene/overview',
    '/api/admin/marketplace-intelligence/dashboard',
  ];

  for (const route of routes) {
    assert.match(router, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
