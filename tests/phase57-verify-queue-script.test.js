import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('verify-queue --json outputs JSON with recommendedActions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-verify-queue-'));

  const proc = spawnSync(process.execPath, ['scripts/verify-queue.js', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, YAWMIA_DATA_PATH: dir },
    encoding: 'utf-8',
  });

  const data = JSON.parse(proc.stdout);

  assert.ok(data.status);
  assert.ok(data.details);
  assert.ok(Array.isArray(data.recommendedActions));

  await rm(dir, { recursive: true, force: true });
});
