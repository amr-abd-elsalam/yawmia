import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

test('ops-weekly-review writes markdown output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-weekly-review-'));
  const outPath = join(dir, 'weekly.md');

  const proc = spawnSync(process.execPath, ['scripts/ops-weekly-review.js', `--out=${outPath}`], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, YAWMIA_DATA_PATH: join(dir, 'data') },
    encoding: 'utf-8',
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);

  const md = await readFile(outPath, 'utf-8');
  assert.match(md, /Weekly Ops\/Product Review/);
  assert.match(md, /Queue Review/);
  assert.match(md, /Marketplace\/Product Intelligence/);

  await rm(dir, { recursive: true, force: true });
});
