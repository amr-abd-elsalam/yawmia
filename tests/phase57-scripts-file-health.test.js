import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('verify-file-health detects stale tmp and embedded base64', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-file-health-'));
  await mkdir(join(dir, 'users'), { recursive: true });
  await mkdir(join(dir, 'jobs'), { recursive: true });

  const tmpPath = join(dir, 'jobs', 'job_abc.json.old.tmp');
  await writeFile(tmpPath, 'tmp', 'utf-8');

  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(tmpPath, old, old);

  await writeFile(join(dir, 'users', 'phone-index.json'), JSON.stringify({}), 'utf-8');
  await writeFile(join(dir, 'jobs', 'index.json'), JSON.stringify({}), 'utf-8');

  const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(300 * 1024);
  await writeFile(join(dir, 'jobs', 'job_base64.json'), JSON.stringify({ id: 'job_base64', image: largeBase64 }), 'utf-8');

  const proc = spawnSync(process.execPath, ['scripts/verify-file-health.js', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, YAWMIA_DATA_PATH: dir },
    encoding: 'utf-8',
  });

  assert.equal(proc.status, 0);

  const data = JSON.parse(proc.stdout);
  assert.ok(data.staleTmp >= 1);
  assert.ok(data.embeddedBase64 >= 1);
  assert.ok(data.issues.some(i => i.type === 'stale_tmp'));
  assert.ok(data.issues.some(i => i.type === 'embedded_base64'));

  await rm(dir, { recursive: true, force: true });
});
