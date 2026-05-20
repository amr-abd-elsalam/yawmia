import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('deployment runbook references predeploy and postdeploy scripts', async () => {
  const md = await readFile(new URL('../DEPLOYMENT_RUNBOOK.md', import.meta.url), 'utf-8');

  assert.match(md, /node scripts\/predeploy-check\.js --strict/);
  assert.match(md, /node scripts\/postdeploy-smoke\.js/);
  assert.match(md, /node scripts\/backup\.js/);
  assert.match(md, /node scripts\/run-backup-restore-drill\.js/);
});

test('operations runbook references weekly review and scheduler cadence', async () => {
  const md = await readFile(new URL('../OPERATIONS_RUNBOOK.md', import.meta.url), 'utf-8');

  assert.match(md, /node scripts\/ops-weekly-review\.js/);
  assert.match(md, /node scripts\/scheduler-cadence-report\.js/);
  assert.match(md, /node scripts\/verify-file-health\.js/);
  assert.match(md, /node scripts\/verify-data-json\.js/);
});
