import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Phase 60 scripts expose help successfully', () => {
  const scripts = [
    'scripts/validate-migration-snapshot.js',
    'scripts/run-migration-rehearsal.js',
    'scripts/capture-externalization-decision.js',
    'scripts/list-benchmark-history.js',
  ];

  for (const script of scripts) {
    const proc = spawnSync(process.execPath, [script, '--help'], {
      encoding: 'utf-8',
      env: process.env,
    });

    assert.equal(proc.status, 0, `${script} should exit 0 for --help`);
    assert.match(proc.stdout, /Usage:/);
  }
});

test('capture-externalization-decision outputs JSON', () => {
  const proc = spawnSync(process.execPath, ['scripts/capture-externalization-decision.js', '--json'], {
    encoding: 'utf-8',
    env: process.env,
  });

  assert.equal(proc.status, 0);
  const parsed = JSON.parse(proc.stdout);
  assert.equal(parsed.phase, 60);
  assert.equal(parsed.implementationAllowed, false);
});
