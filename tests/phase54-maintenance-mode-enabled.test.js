import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('maintenance mode can be enabled with env override and route policy works', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-maint-enabled-'));

  process.env.YAWMIA_DATA_PATH = dir;
  process.env.MAINTENANCE_MODE_ENABLED = 'true';
  process.env.ADMIN_TOKEN = 'admin_test_token';

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const mod = await import(`../server/services/maintenanceMode.js?m=${Date.now()}`);

    const enabled = await mod.enableMaintenanceMode('admin_test', 'اختبار صيانة');
    assert.equal(enabled.ok, true);
    assert.equal(enabled.maintenance.enabled, true);

    const writeReq = {
      method: 'POST',
      pathname: '/api/jobs',
      headers: {},
    };

    const readReq = {
      method: 'GET',
      pathname: '/api/jobs',
      headers: {},
    };

    const adminReq = {
      method: 'POST',
      pathname: '/api/jobs',
      headers: { 'x-admin-token': 'admin_test_token' },
    };

    assert.equal(mod.isRouteAllowedDuringMaintenance(writeReq), false);
    assert.equal(mod.isRouteAllowedDuringMaintenance(readReq), true);
    assert.equal(mod.isRouteAllowedDuringMaintenance(adminReq), true);

    const disabled = await mod.disableMaintenanceMode('admin_test');
    assert.equal(disabled.ok, true);
    assert.equal(disabled.maintenance.enabled, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
    delete process.env.MAINTENANCE_MODE_ENABLED;
    delete process.env.ADMIN_TOKEN;
  }
});
