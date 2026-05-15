import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function fakeReq(extra = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: { 'x-admin-token': process.env.ADMIN_TOKEN || 'test-admin-token' },
    socket: { remoteAddress: '127.0.0.1' },
    user: { id: 'admin_test', role: 'admin' },
    ...extra,
  };
}

function fakeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers || {};
    },
    end(payload) {
      this.body = payload || '';
    },
  };
  return res;
}

test('production ops handler returns readiness response', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-handler-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const handler = await import(`../server/handlers/productionOpsHandler.js?h=${Date.now()}`);
    const req = fakeReq();
    const res = fakeRes();

    await handler.handleProductionReadiness(req, res);

    assert.equal(res.statusCode, 200);

    const data = JSON.parse(res.body);
    assert.equal(data.ok, true);
    assert.ok(data.readiness);
    assert.ok(data.readiness.summary);
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});

test('production ops handler lists schedulers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-handler-sch-'));
  process.env.YAWMIA_DATA_PATH = dir;
  process.env.ADMIN_TOKEN = 'test-admin-token';

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const handler = await import(`../server/handlers/productionOpsHandler.js?h=${Date.now()}`);
    const req = fakeReq();
    const res = fakeRes();

    await handler.handleListSchedulers(req, res);

    assert.equal(res.statusCode, 200);

    const data = JSON.parse(res.body);
    assert.equal(data.ok, true);
    assert.ok(Array.isArray(data.schedulers));
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
