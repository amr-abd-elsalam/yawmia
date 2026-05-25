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

test('evaluate-pilot-gate script blocks by default and emits JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p61-script-gate-'));

  try {
    const result = await runNode(
      ['scripts/evaluate-pilot-gate.js', '--json'],
      {
        ...process.env,
        YAWMIA_DATA_PATH: dir,
        NODE_ENV: 'test',
      }
    );

    // Pilot is expected to be blocked by default.
    assert.equal(result.code, 1);

    const data = JSON.parse(result.stdout);
    assert.equal(data.gate.phase, 61);
    assert.equal(data.gate.pilotAllowed, false);
    assert.equal(data.gate.implementationAllowed, false);
    assert.equal(Array.isArray(data.gate.blockers), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
