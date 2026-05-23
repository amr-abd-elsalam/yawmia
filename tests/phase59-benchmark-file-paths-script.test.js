import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function runNode(args, env) {
  return spawnSync(process.execPath, args, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: 120000,
  });
}

test('benchmark-file-paths.js --json outputs valid benchmark results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'yawmia-p59-benchmark-'));

  try {
    const { initDatabase } = await import('../server/services/database.js');
    const oldPath = process.env.YAWMIA_DATA_PATH;
    process.env.YAWMIA_DATA_PATH = dir;
    await initDatabase();

    await writeFile(join(dir, 'users', 'usr_bench.json'), JSON.stringify({
      id: 'usr_bench',
      phone: '01011111111',
      role: 'worker',
      status: 'active',
      createdAt: new Date().toISOString(),
    }), 'utf-8');

    await writeFile(join(dir, 'jobs', 'job_bench.json'), JSON.stringify({
      id: 'job_bench',
      employerId: 'usr_emp',
      title: 'Benchmark Job',
      category: 'general',
      governorate: 'cairo',
      status: 'open',
      workersAccepted: 0,
      workersNeeded: 1,
      dailyWage: 200,
      durationDays: 1,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }), 'utf-8');

    if (oldPath === undefined) delete process.env.YAWMIA_DATA_PATH;
    else process.env.YAWMIA_DATA_PATH = oldPath;

    const proc = runNode(['scripts/benchmark-file-paths.js', '--json', '--sample=2'], {
      YAWMIA_DATA_PATH: dir,
    });

    assert.equal(proc.status, 0, proc.stderr || proc.stdout);

    const parsed = JSON.parse(proc.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.sample, 2);
    assert.ok(Array.isArray(parsed.results));
    assert.ok(parsed.results.length > 0);

    const labels = parsed.results.map(r => r.label);
    assert.ok(labels.includes('storage pressure shallow scan'));

    for (const row of parsed.results) {
      assert.equal(typeof row.label, 'string');
      assert.equal(typeof row.count, 'number');
      assert.ok('p50Ms' in row);
      assert.ok('p95Ms' in row);
    }

    const serialized = JSON.stringify(parsed);
    assert.ok(!serialized.includes('01011111111'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
