import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('verify-repository-contracts script outputs JSON', async () => {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['scripts/verify-repository-contracts.js', '--json'],
    {
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    }
  );

  const data = JSON.parse(stdout);

  assert.equal(data.report.phase, 61);
  assert.equal(data.report.runtimeSwitchEnabled, false);
  assert.equal(data.report.fileBackedSourceOfTruth, true);
  assert.equal(data.report.externalAdapterImplemented, false);
  assert.ok(Array.isArray(data.report.matrix));
});
