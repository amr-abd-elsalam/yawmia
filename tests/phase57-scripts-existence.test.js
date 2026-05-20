import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const scripts = [
  'scripts/predeploy-check.js',
  'scripts/postdeploy-smoke.js',
  'scripts/ops-weekly-review.js',
  'scripts/verify-file-health.js',
  'scripts/verify-data-json.js',
  'scripts/scheduler-cadence-report.js',
];

test('Phase 57 scripts exist and are ESM node scripts', async () => {
  for (const rel of scripts) {
    await access(new URL('../' + rel, import.meta.url), constants.R_OK);
    const raw = await readFile(new URL('../' + rel, import.meta.url), 'utf-8');

    assert.match(raw, /#!\/usr\/bin\/env node/);
    assert.match(raw, /await import\('dotenv'\)|await import\("dotenv"\)/);
    assert.doesNotMatch(raw, /require\(/);
  }
});
