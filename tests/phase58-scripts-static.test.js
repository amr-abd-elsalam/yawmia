import test from 'node:test';
import assert from 'node:assert/strict';
import { access, constants, readFile } from 'node:fs/promises';

async function exists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

test('Phase 58 scripts exist', async () => {
  const scripts = [
    'scripts/verify-admin-rbac.js',
    'scripts/verify-privacy-governance.js',
    'scripts/export-user-data.js',
    'scripts/anonymize-user-data.js',
  ];

  for (const script of scripts) {
    assert.equal(await exists(script), true, `Missing script: ${script}`);
  }
});

test('privacy anonymization script requires confirm for destructive mode', async () => {
  const raw = await readFile('scripts/anonymize-user-data.js', 'utf-8');

  assert.match(raw, /--confirm/);
  assert.match(raw, /dryRun/);
  assert.match(raw, /No data was changed/);
});

test('predeploy check invokes Phase 58 governance scripts', async () => {
  const raw = await readFile('scripts/predeploy-check.js', 'utf-8');

  assert.match(raw, /verify-admin-rbac\.js/);
  assert.match(raw, /verify-privacy-governance\.js/);
});

test('ops weekly review supports --persist', async () => {
  const raw = await readFile('scripts/ops-weekly-review.js', 'utf-8');

  assert.match(raw, /--persist/);
  assert.match(raw, /createReviewRecord/);
  assert.match(raw, /weekly_ops_review/);
});
