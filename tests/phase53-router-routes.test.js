import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 53 router includes profile tasks route', async () => {
  const src = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');
  assert.match(src, /path:\s*['"]\/api\/profile\/tasks['"]/);
});

test('Phase 53 router includes Workroom V2 routes', async () => {
  const src = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');

  const routes = [
    '/api/workrooms/:id/search',
    '/api/workrooms/:id/read-receipts',
    '/api/workrooms/:id/messages/:messageId/read',
    '/api/workrooms/:id/attachments',
    '/api/workrooms/:id/summary',
    '/api/workrooms/:id/pins',
    '/api/workrooms/:id/pins/:messageId',
    '/api/workrooms/:id/checklist',
    '/api/workrooms/:id/checklist/:itemId',
  ];

  for (const route of routes) {
    assert.ok(src.includes(`path: '${route}'`) || src.includes(`path: "${route}"`), route);
  }
});

test('Phase 53 router includes Trust Calibration admin routes', async () => {
  const src = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');

  const routes = [
    '/api/admin/trust/calibration/dashboard',
    '/api/admin/trust/snapshots',
    '/api/admin/trust/calibration/snapshot-batch',
    '/api/admin/trust/calibration/report',
  ];

  for (const route of routes) {
    assert.ok(src.includes(`path: '${route}'`) || src.includes(`path: "${route}"`), route);
  }
});

test('Phase 53 router includes Predictive Precision admin routes', async () => {
  const src = await readFile(new URL('../server/router.js', import.meta.url), 'utf-8');

  const routes = [
    '/api/admin/predictive-abuse/precision',
    '/api/admin/predictive-abuse/retention/run',
    '/api/admin/predictive-abuse/signals/:id/false-positive',
    '/api/admin/predictive-abuse/signals/:id/confirm',
  ];

  for (const route of routes) {
    assert.ok(src.includes(`path: '${route}'`) || src.includes(`path: "${route}"`), route);
  }
});
