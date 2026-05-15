import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('migration v14 is applied and recorded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p54-migration-'));
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import(`../server/services/database.js?db=${Date.now()}`);
    await db.initDatabase();

    const migration = await import(`../server/services/migration.js?m=${Date.now()}`);
    const result = await migration.runMigrations();

    assert.equal(result.current, 14);

    const raw = await readFile(join(dir, 'migration.json'), 'utf-8');
    const state = JSON.parse(raw);

    assert.equal(state.version, 14);
    assert.ok(state.migrations.some(m => m.version === 14));
  } finally {
    await rm(dir, { recursive: true, force: true });
    delete process.env.YAWMIA_DATA_PATH;
  }
});
