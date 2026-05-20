import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('predeploy-check outputs JSON and includes Phase 57 gates', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-predeploy-'));

  await mkdir(join(dir, 'users'), { recursive: true });
  await mkdir(join(dir, 'jobs'), { recursive: true });
  await writeFile(join(dir, 'users', 'phone-index.json'), JSON.stringify({}), 'utf-8');
  await writeFile(join(dir, 'jobs', 'index.json'), JSON.stringify({}), 'utf-8');

  const proc = spawnSync(process.execPath, ['scripts/predeploy-check.js', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      YAWMIA_DATA_PATH: dir,
      ADMIN_TOKEN: 'change-me-in-production',
    },
    encoding: 'utf-8',
  });

  // In dev this may exit non-zero only if strict conditions or critical file issues.
  // For JSON parse, stdout must be valid JSON.
  const data = JSON.parse(proc.stdout);

  assert.ok(data.summary);
  assert.ok(Array.isArray(data.checks));
  assert.ok(data.checks.some(c => c.id === 'json_health'));
  assert.ok(data.checks.some(c => c.id === 'file_health'));
  assert.ok(data.checks.some(c => c.id === 'scheduler_cadence'));
  assert.ok(data.checks.some(c => c.id.startsWith('readiness:')));

  await rm(dir, { recursive: true, force: true });
});
