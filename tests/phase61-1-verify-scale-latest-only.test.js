import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('Phase 61.1: verify-scale-thresholds --latest-only does not require live scan', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p611-scale-latest-'));
  const env = { ...process.env, YAWMIA_DATA_PATH: dir };

  try {
    const result = spawnSync(process.execPath, [
      'scripts/verify-scale-thresholds.js',
      '--json',
      '--latest-only',
    ], {
      env,
      encoding: 'utf-8',
      timeout: 10000,
    });

    // Missing persisted snapshot may produce non-zero only in strict/fail modes.
    // Here it should be a warning artifact, not a timeout/heavy scan.
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.latestOnly, true);
    assert.equal(parsed.summary.scanMode, 'latest-only');
    assert.equal(parsed.summary.scanDurationMs, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
