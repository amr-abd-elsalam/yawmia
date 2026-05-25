import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: scale hygiene lightweight overview returns fast without heavy scans', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-scalehygiene-'));
  const previous = process.env.YAWMIA_DATA_PATH;
  process.env.YAWMIA_DATA_PATH = dir;

  try {
    const db = await import('../server/services/database.js?' + Date.now());
    await db.initDatabase();

    const mod = await import('../server/services/scaleHygiene.js?' + Date.now());

    const started = Date.now();
    const overview = await mod.getScaleHygieneOverview({ lightweight: true });
    const durationMs = Date.now() - started;

    assert.equal(overview.enabled, true);
    assert.equal(overview.lightweight, true);
    assert.ok(durationMs < 2000, `expected lightweight overview <2s, got ${durationMs}ms`);
    assert.equal(overview.audit.skipped, true);
    assert.equal(overview.workrooms.skipped, true);
    assert.equal(overview.trust.skipped, true);
  } finally {
    if (previous === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
