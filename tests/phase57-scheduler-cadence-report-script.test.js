import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('scheduler-cadence-report outputs JSON report', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-sch-script-'));

  const proc = spawnSync(process.execPath, ['scripts/scheduler-cadence-report.js', '--json'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, YAWMIA_DATA_PATH: dir },
    encoding: 'utf-8',
  });

  assert.equal(proc.status === 0 || proc.status === 1, true);

  const data = JSON.parse(proc.stdout);
  assert.equal(data.enabled, true);
  assert.ok(Array.isArray(data.schedulers));
  assert.ok(data.schedulers.some(s => s.name === 'marketplace_intelligence_daily'));

  await rm(dir, { recursive: true, force: true });
});
