import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Production readiness includes Phase 61 checks', async () => {
  const raw = await readFile('./server/services/productionReadiness.js', 'utf-8');

  const expected = [
    'checkPhase61Docs',
    'checkPhase61EvidenceCadence',
    'checkPhase61PilotGate',
    'checkRepositoryContracts',
    'checkRollbackRehearsalReadiness',
    'phase61_evidence_cadence_available',
    'phase61_pilot_gate_blocks_externalization',
    'repository_contract_docs_exist',
    'latest_rollback_rehearsal_warning_if_missing',
  ];

  for (const item of expected) {
    assert.ok(raw.includes(item), `Missing Phase 61 readiness marker: ${item}`);
  }

  assert.doesNotMatch(raw, /benchmark-file-paths\.js.*spawn|measure-storage-pressure\.js.*spawn|execFile\(.*benchmark/i);
});
