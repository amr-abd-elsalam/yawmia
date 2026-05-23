import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('router registers Phase 59 admin routes', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  const routes = [
    '/api/admin/storage-pressure',
    '/api/admin/storage-pressure/capture',
    '/api/admin/storage-pressure/snapshots',
    '/api/admin/scale-thresholds',
    '/api/admin/scale-thresholds/verify',
    '/api/admin/externalization/readiness',
    '/api/admin/production/multi-instance-boundary',
  ];

  for (const route of routes) {
    assert.ok(router.includes(route), `router must include ${route}`);
  }
});

test('router imports storage pressure handlers', async () => {
  const router = await readFile('server/router.js', 'utf-8');

  const handlers = [
    'handleGetStoragePressure',
    'handleCaptureStoragePressure',
    'handleListStoragePressureSnapshots',
    'handleGetScaleThresholds',
    'handleVerifyScaleThresholds',
    'handleExternalizationReadiness',
    'handleMultiInstanceBoundary',
  ];

  for (const handler of handlers) {
    assert.ok(router.includes(handler), `router must import/use ${handler}`);
  }
});
