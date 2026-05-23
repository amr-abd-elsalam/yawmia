import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('router docs version is 0.55.0 and old docs version is absent', async () => {
  const raw = await readFile('server/router.js', 'utf-8');

  assert.ok(raw.includes("version: '0.55.0'"));
  assert.ok(!raw.includes("version: '0.54.0'"));
});

test('router docs will include Phase 59 routes because routes are registered centrally', async () => {
  const raw = await readFile('server/router.js', 'utf-8');

  const routes = [
    "path: '/api/admin/storage-pressure'",
    "path: '/api/admin/storage-pressure/capture'",
    "path: '/api/admin/storage-pressure/snapshots'",
    "path: '/api/admin/scale-thresholds'",
    "path: '/api/admin/scale-thresholds/verify'",
    "path: '/api/admin/externalization/readiness'",
    "path: '/api/admin/production/multi-instance-boundary'",
  ];

  for (const route of routes) {
    assert.ok(raw.includes(route), `Missing route registration: ${route}`);
  }

  assert.ok(raw.includes('/api/docs'), 'docs endpoint should exist');
  assert.ok(raw.includes('routes.map'), 'docs endpoint should map central routes');
});
