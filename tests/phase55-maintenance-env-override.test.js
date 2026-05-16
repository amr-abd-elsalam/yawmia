import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function mockReq(pathname, method = 'POST', headers = {}) {
  return {
    pathname,
    method,
    headers,
    query: {},
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writableEnded: false,
    writeHead(code, headers = {}) {
      this.statusCode = code;
      this.headers = headers;
    },
    end(chunk = '') {
      this.body = chunk;
      this.writableEnded = true;
    },
  };
}

test('Phase 55: MAINTENANCE_MODE_ENABLED env override activates service when config default is false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-maintenance-'));
  const prevDataPath = process.env.YAWMIA_DATA_PATH;
  const prevMaint = process.env.MAINTENANCE_MODE_ENABLED;

  process.env.YAWMIA_DATA_PATH = dir;
  process.env.MAINTENANCE_MODE_ENABLED = 'true';

  try {
    const database = await import(`../server/services/database.js?x=${Date.now()}`);
    await database.initDatabase();

    const maintenance = await import(`../server/services/maintenanceMode.js?x=${Date.now()}`);

    assert.equal(maintenance.isFeatureEnabled(), true);

    const enabled = await maintenance.enableMaintenanceMode('admin_test', 'maintenance test');
    assert.equal(enabled.ok, true);

    const state = await maintenance.getMaintenanceMode();
    assert.equal(state.featureEnabled, true);
    assert.equal(state.enabled, true);
  } finally {
    if (prevDataPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = prevDataPath;

    if (prevMaint === undefined) delete process.env.MAINTENANCE_MODE_ENABLED;
    else process.env.MAINTENANCE_MODE_ENABLED = prevMaint;

    await rm(dir, { recursive: true, force: true });
  }
});

test('Phase 55: maintenance middleware blocks write route via env override and allows health', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-maintenance-mw-'));
  const prevDataPath = process.env.YAWMIA_DATA_PATH;
  const prevMaint = process.env.MAINTENANCE_MODE_ENABLED;

  process.env.YAWMIA_DATA_PATH = dir;
  process.env.MAINTENANCE_MODE_ENABLED = 'true';

  try {
    const database = await import(`../server/services/database.js?x=${Date.now()}`);
    await database.initDatabase();

    const maintenance = await import(`../server/services/maintenanceMode.js?x=${Date.now()}`);
    const middleware = await import(`../server/middleware/maintenance.js?x=${Date.now()}`);

    await maintenance.enableMaintenanceMode('admin_test', 'maintenance test');

    const blockedReq = mockReq('/api/jobs', 'POST');
    const blockedRes = mockRes();
    let blockedNextCalled = false;

    await new Promise(resolve => {
      middleware.maintenanceMiddleware(blockedReq, blockedRes, () => {
        blockedNextCalled = true;
        resolve();
      });
      setTimeout(resolve, 50);
    });

    assert.equal(blockedNextCalled, false);
    assert.equal(blockedRes.statusCode, 503);

    const healthReq = mockReq('/api/health', 'GET');
    const healthRes = mockRes();
    let healthNextCalled = false;

    await new Promise(resolve => {
      middleware.maintenanceMiddleware(healthReq, healthRes, () => {
        healthNextCalled = true;
        resolve();
      });
      setTimeout(resolve, 50);
    });

    assert.equal(healthNextCalled, true);
    assert.equal(healthRes.statusCode, null);
  } finally {
    if (prevDataPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = prevDataPath;

    if (prevMaint === undefined) delete process.env.MAINTENANCE_MODE_ENABLED;
    else process.env.MAINTENANCE_MODE_ENABLED = prevMaint;

    await rm(dir, { recursive: true, force: true });
  }
});
