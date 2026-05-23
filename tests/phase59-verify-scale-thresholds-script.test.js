import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function runNode(args, env) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 60000,
  });
}

test('verify-scale-thresholds.js --json outputs valid JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-verify-thresholds-'));

  try {
    const proc = runNode(['scripts/verify-scale-thresholds.js', '--json'], {
      YAWMIA_DATA_PATH: dir,
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);

    const parsed = JSON.parse(proc.stdout);
    assert.equal(typeof parsed.ok, 'boolean');
    assert.ok(parsed.status);
    assert.ok(parsed.summary);
    assert.ok(Array.isArray(parsed.warnings));
    assert.ok(Array.isArray(parsed.criticals));
    assert.ok(Array.isArray(parsed.recommendations));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verify-scale-thresholds.js --json --strict remains valid JSON even when exiting non-zero', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-verify-strict-'));

  try {
    const proc = runNode(['scripts/verify-scale-thresholds.js', '--json', '--strict'], {
      YAWMIA_DATA_PATH: dir,
    });

    // In an empty temp dataset, this should normally pass.
    // If deployment config creates warnings/criticals, the key assertion is JSON validity.
    const parsed = JSON.parse(proc.stdout);
    assert.equal(typeof parsed.ok, 'boolean');
    assert.ok(parsed.generatedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scale threshold service can produce critical result for strict checks without huge fixtures', async () => {
  const {
    evaluateQueuePressure,
  } = await import('../server/services/scaleThresholds.js');

  const result = evaluateQueuePressure({
    byStatus: {
      pending: 6000,
      running: 1,
      'dead-letter': 60,
    },
    summary: {
      lastUpdatedAt: new Date().toISOString(),
    },
  }, {
    pendingWarning: 1000,
    pendingCritical: 5000,
    runningWarning: 100,
    runningCritical: 500,
    deadLetterWarning: 10,
    deadLetterCritical: 50,
    staleSummaryWarningMinutes: 30,
    staleSummaryCriticalHours: 6,
  });

  assert.equal(result.status, 'critical');
  assert.ok(result.criticals.some(c => c.code === 'QUEUE_PENDING_PRESSURE'));
  assert.ok(result.criticals.some(c => c.code === 'QUEUE_DEAD_LETTER_PRESSURE'));
});
