import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-maint-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const db = await import(`../server/services/database.js?db=${Date.now()}`);
  await db.initDatabase();

  const mod = await import(`../server/services/maintenanceMode.js?m=${Date.now()}`);

  return { dir, mod };
}

test('maintenance mode state can be enabled and disabled', async () => {
  const { dir, mod } = await setup();

  try {
    const initial = await mod.getMaintenanceMode();
    assert.equal(initial.enabled, false);

    const enabled = await mod.enableMaintenanceMode('admin_test', 'صيانة اختبار');
    if (enabled.disabled) {
      // Feature is disabled by config default; acceptable no-op behavior.
      assert.equal(enabled.code, 'MAINTENANCE_FEATURE_DISABLED');
      return;
    }

    assert.equal(enabled.ok, true);
    assert.equal(enabled.maintenance.enabled, true);

    const active = await mod.isMaintenanceActive();
    assert.equal(active, true);

    const disabled = await mod.disableMaintenanceMode('admin_test');
    assert.equal(disabled.ok, true);
    assert.equal(disabled.maintenance.enabled, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});

test('maintenance route allow logic allows health and static routes', async () => {
  const { dir, mod } = await setup();

  try {
    assert.equal(mod.isRouteAllowedDuringMaintenance({ method: 'GET', pathname: '/api/health', headers: {} }), true);
    assert.equal(mod.isRouteAllowedDuringMaintenance({ method: 'GET', pathname: '/assets/css/style.css', headers: {} }), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
