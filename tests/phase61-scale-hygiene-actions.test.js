import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Scale hygiene includes Phase 61 evidence/gate/rollback/repository sections', async () => {
  const raw = await readFile('./server/services/scaleHygiene.js', 'utf-8');

  const markers = [
    'phase61Evidence',
    'phase61PilotGate',
    'phase61Rollback',
    'repositoryContracts',
    'phase61_evidence',
    'phase61_pilot_gate',
    'phase61_rollback_rehearsal',
    'phase61',
    'evidenceCadence',
    'pilotGate',
    'rollbackRehearsal',
    'repositoryContracts',
  ];

  for (const marker of markers) {
    assert.ok(raw.includes(marker), `Missing scale hygiene Phase 61 marker: ${marker}`);
  }

  assert.match(raw, /node scripts\/capture-phase61-evidence\.js --persist|node scripts\/evaluate-pilot-gate\.js --json|node scripts\/run-rollback-rehearsal\.js --dry-run --json/);
});
