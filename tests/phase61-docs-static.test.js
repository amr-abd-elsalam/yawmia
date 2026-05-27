import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const docs = [
  './docs/phases/phase61/PHASE61_EVIDENCE_CADENCE.md',
  './docs/phases/phase61/PHASE61_DEEP_MIGRATION_REHEARSAL.md',
  './docs/phases/phase61/PHASE61_ROLLBACK_REHEARSAL_REPORT.md',
  './docs/phases/phase61/PHASE61_PILOT_CANDIDATE_DECISION.md',
  './docs/phases/phase61/PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md',
  './docs/phases/phase61/PHASE61_EVENT_BRIDGE_PILOT_PLAN.md',
  './docs/phases/phase61/PHASE61_SSE_FANOUT_PILOT_PLAN.md',
];

test('Phase 61 docs exist and contain guardrails', async () => {
  for (const path of docs) {
    const raw = await readFile(path, 'utf-8');

    assert.match(raw, /Phase 61|PHASE61|v0\.57\.0/i);
    assert.match(raw, /No externalization|لا يوجد|لا ينفذ|No external|No runtime|Pilot/i);
    assert.doesNotMatch(raw, /CREATE DATABASE|psql\s|redis:\/\/|postgres:\/\/|opensearch:\/\/|elastic:\/\/|rabbitmq:\/\//i);
  }
});

test('Evidence cadence doc includes required rules', async () => {
  const raw = await readFile('./docs/phases/phase61/PHASE61_EVIDENCE_CADENCE.md', 'utf-8');

  assert.match(raw, /No evidence history = no externalization decision/);
  assert.match(raw, /A single benchmark artifact is not a trend/);
  assert.match(raw, /A single warning is not migration evidence/);
});
