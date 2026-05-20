import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('production readiness includes Phase 57 operational checks with recommendations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-readiness57-'));
  const prevData = process.env.YAWMIA_DATA_PATH;
  const prevEnv = process.env.NODE_ENV;

  process.env.YAWMIA_DATA_PATH = dir;
  process.env.NODE_ENV = 'development';

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const readiness = await import('../server/services/productionReadiness.js');
  const result = await readiness.getProductionReadiness();

  const ids = new Set((result.checks || []).map(c => c.id));

  assert.ok(ids.has('queue_health'));
  assert.ok(ids.has('queue_no_stale_running'));
  assert.ok(ids.has('restore_drill_recent'));
  assert.ok(ids.has('marketplace_rollup_fresh'));
  assert.ok(ids.has('scheduler_no_stale'));
  assert.ok(ids.has('maintenance_not_active'));
  assert.ok(ids.has('json_health'));

  const jsonHealth = result.checks.find(c => c.id === 'json_health');
  assert.equal(jsonHealth.status, 'warn');
  assert.match(jsonHealth.recommendation, /verify-data-json/);

  process.env.YAWMIA_DATA_PATH = prevData;
  process.env.NODE_ENV = prevEnv;
  await rm(dir, { recursive: true, force: true });
});

test('development readiness does not fail solely on default admin token or missing VAPID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-readiness57-'));
  const prevData = process.env.YAWMIA_DATA_PATH;
  const prevEnv = process.env.NODE_ENV;
  const prevAdmin = process.env.ADMIN_TOKEN;
  const prevVapidPub = process.env.VAPID_PUBLIC_KEY;
  const prevVapidPriv = process.env.VAPID_PRIVATE_KEY;

  process.env.YAWMIA_DATA_PATH = dir;
  process.env.NODE_ENV = 'development';
  process.env.ADMIN_TOKEN = 'change-me-in-production';
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;

  const db = await import('../server/services/database.js');
  await db.initDatabase();

  const readiness = await import('../server/services/productionReadiness.js');
  const result = await readiness.getProductionReadiness();

  const adminCheck = result.checks.find(c => c.id === 'admin_token');
  const vapidCheck = result.checks.find(c => c.id === 'vapid_keys');

  assert.equal(adminCheck.status, 'warn');
  assert.equal(vapidCheck.status, 'warn');

  process.env.YAWMIA_DATA_PATH = prevData;
  process.env.NODE_ENV = prevEnv;
  process.env.ADMIN_TOKEN = prevAdmin;
  process.env.VAPID_PUBLIC_KEY = prevVapidPub;
  process.env.VAPID_PRIVATE_KEY = prevVapidPriv;

  await rm(dir, { recursive: true, force: true });
});
