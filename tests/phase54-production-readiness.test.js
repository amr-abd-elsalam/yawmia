import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('production readiness returns summary and does not expose secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-readiness-'));
  process.env.YAWMIA_DATA_PATH = dir;

  const oldAdmin = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'change-me-in-production';

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const readiness = await import(`../server/services/productionReadiness.js?r=${Date.now()}`);
    const result = await readiness.getProductionReadiness();

    assert.ok(result);
    assert.ok(['ready', 'warnings', 'not_ready', 'disabled'].includes(result.status));
    assert.ok(result.summary);
    assert.ok(Array.isArray(result.checks));

    const raw = JSON.stringify(result);
    assert.equal(raw.includes(process.env.ADMIN_TOKEN), false);

    const adminCheck = result.checks.find(c => c.id === 'admin_token');
    assert.ok(adminCheck);
    assert.equal(adminCheck.status, 'fail');
  } finally {
    if (oldAdmin === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = oldAdmin;

    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
