import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('find-null-json-files detects JSON files containing NUL bytes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-null-json-'));
  await mkdir(join(dir, 'jobs'), { recursive: true });

  await writeFile(join(dir, 'jobs', 'job_good.json'), '{"id":"job_good"}\n', 'utf-8');
  await writeFile(join(dir, 'jobs', 'job_bad.json'), Buffer.from([0, 0, 0, 123, 125]));

  const proc = spawnSync(process.execPath, ['scripts/find-null-json-files.js', '--json'], {
    encoding: 'utf-8',
    env: { ...process.env, YAWMIA_DATA_PATH: dir },
  });

  assert.equal(proc.status, 0);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.nulFileCount, 1);
  assert.match(parsed.findings[0].path, /job_bad\.json/);
});
