import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function mockRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    writeHead(code, headers) {
      this.statusCode = code;
      this.headers = headers || {};
    },
    end(chunk) {
      this.body = chunk || '';
    },
  };
}

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-phase55-scale-handler-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const database = await import(`../server/services/database.js?x=${Date.now()}`);
  await database.initDatabase();

  const handler = await import(`../server/handlers/scaleHygieneHandler.js?x=${Date.now()}`);

  return { dir, handler };
}

test('Phase 55: scale hygiene overview handler returns overview', async () => {
  const { dir, handler } = await setup();

  try {
    const req = { user: { id: 'admin_test' }, headers: {}, socket: {}, query: {} };
    const res = mockRes();

    await handler.handleScaleHygieneOverview(req, res);

    assert.equal(res.statusCode, 200);
    const data = JSON.parse(res.body);
    assert.equal(data.ok, true);
    assert.ok(data.overview);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
