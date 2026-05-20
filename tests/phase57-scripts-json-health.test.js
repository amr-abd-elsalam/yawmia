import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('verify-data-json detects invalid and zero-byte JSON', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-json-scan-'));
  await mkdir(join(dir, 'jobs'), { recursive: true });

  await writeFile(join(dir, 'jobs', 'job_bad.json'), '{ invalid json', 'utf-8');
  await writeFile(join(dir, 'jobs', 'job_empty.json'), '', 'utf-8');
  await writeFile(join(dir, 'jobs', 'job_ok.json'), JSON.stringify({ id: 'job_ok' }), 'utf-8');

  const proc = spawnSync(process.execPath, ['scripts/verify-data-json.js', '--collection=jobs', '--json', '--strict'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, YAWMIA_DATA_PATH: dir },
    encoding: 'utf-8',
  });

  assert.equal(proc.status, 1);

  const data = JSON.parse(proc.stdout);
  assert.equal(data.invalid, 1);
  assert.equal(data.zeroByte, 1);
  assert.ok(data.critical >= 1);

  await rm(dir, { recursive: true, force: true });
});
