import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('run-rollback-rehearsal script outputs JSON and is non-destructive', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p61-script-rollback-'));

  try {
    const result = await runNode(
      ['scripts/run-rollback-rehearsal.js', '--dry-run', '--json'],
      {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        NODE_ENV: 'test',
      }
    );

    // Missing backup/restore drill may exit 1; JSON must still be valid.
    assert.ok(result.code === 0 || result.code === 1);

    const data = JSON.parse(result.stdout);
    assert.equal(data.rehearsal.phase, 61);
    assert.equal(data.rehearsal.sourceDataMutated, false);
    assert.equal(data.rehearsal.externalDbConnected, false);
    assert.equal(Array.isArray(data.rehearsal.indexRepairPlan), true);
    assert.equal(Array.isArray(data.rehearsal.queueVerifyPlan), true);
    assert.equal(Array.isArray(data.rehearsal.smokePlan), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
