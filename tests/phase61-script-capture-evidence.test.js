import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

test('capture-phase61-evidence script outputs JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p61-script-evidence-'));

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['scripts/capture-phase61-evidence.js', '--json'],
      {
        env: {
          ...process.env,
          YAWMIA_DATA_PATH: dir,
          NODE_ENV: 'test',
        },
      }
    );

    const data = JSON.parse(stdout);
    assert.equal(data.ok, true);
    assert.equal(data.evidence.phase, 61);
    assert.equal(data.evidence.enabled, true);
    assert.equal(Array.isArray(data.evidence.recommendations), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
