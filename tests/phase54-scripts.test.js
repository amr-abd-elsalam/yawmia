import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Phase 54 production ops scripts exist and contain expected service imports', async () => {
  const readiness = await readFile('./scripts/verify-production-readiness.js', 'utf-8');
  const restore = await readFile('./scripts/run-backup-restore-drill.js', 'utf-8');
  const incident = await readFile('./scripts/export-incident-timeline.js', 'utf-8');

  assert.match(readiness, /getProductionReadiness/);
  assert.match(restore, /runBackupRestoreDrill/);
  assert.match(incident, /listIncidents/);
  assert.match(incident, /getIncident/);
});
