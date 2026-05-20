import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('verify-marketplace-intelligence --json outputs pure JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-verify-mpi-'));

  const proc = spawnSync(process.execPath, ['scripts/verify-marketplace-intelligence.js', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, YAWMIA_DATA_PATH: dir },
    encoding: 'utf-8',
  });

  const data = JSON.parse(proc.stdout);

  assert.equal(typeof data.ok, 'boolean');
  assert.ok(Array.isArray(data.checks));
  assert.ok(data.checks.some(c => c.name === 'marketplace rollup freshness'));

  await rm(dir, { recursive: true, force: true });
});
