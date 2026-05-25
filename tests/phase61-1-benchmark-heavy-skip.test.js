import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: benchmark-file-paths skips heavy storage pressure scan by default', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-benchmark-'));
  const env = { ...process.env, YAWMIA_DATA_PATH: dir };

  try {
    const result = spawnSync(process.execPath, [
      'scripts/benchmark-file-paths.js',
      '--json',
      '--sample=1',
    ], {
      env,
      encoding: 'utf-8',
      timeout: 15000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);

    const parsed = JSON.parse(result.stdout);
    const row = parsed.results.find(r => r.label === 'storage pressure shallow scan');

    assert.ok(row);
    assert.equal(row.skipped, true);
    assert.match(row.skipReason, /heavy scan skipped/i);
    assert.equal(parsed.includeHeavy, false);
    assert.ok(Array.isArray(parsed.evidenceNotes));
    assert.ok(parsed.evidenceNotes.some(n => /Heavy storage pressure scan skipped/i.test(n)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
