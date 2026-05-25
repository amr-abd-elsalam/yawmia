import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 61.1: predeploy check expects current 0.57.0 version/cache and latest-only scale thresholds', async () => {
  const raw = await readFile('scripts/predeploy-check.js', 'utf-8');

  assert.match(raw, /expected: '0\.57\.0'/);
  assert.match(raw, /yawmia-v0\.57\.0/);
  assert.match(raw, /verify-scale-thresholds\.js', \['--json', '--latest-only'/);
  assert.doesNotMatch(raw, /0\.56\.0/);
});
