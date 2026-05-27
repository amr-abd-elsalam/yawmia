import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOC_PATHS = {
  'PHASE61_2_PILOT_CANDIDATE_DECISION.md': 'docs/phases/phase61-2/PHASE61_2_PILOT_CANDIDATE_DECISION.md',
  'PHASE61_2_REPOSITORY_ADAPTER_CONTRACTS.md': 'docs/phases/phase61-2/PHASE61_2_REPOSITORY_ADAPTER_CONTRACTS.md',
  'PHASE61_2_EVENT_BRIDGE_PILOT_PLAN.md': 'docs/phases/phase61-2/PHASE61_2_EVENT_BRIDGE_PILOT_PLAN.md',
  'PHASE61_2_SSE_FANOUT_PILOT_PLAN.md': 'docs/phases/phase61-2/PHASE61_2_SSE_FANOUT_PILOT_PLAN.md',
};

async function readRootFile(fileName) {
  return await readFile(join(ROOT, DOC_PATHS[fileName] || fileName), 'utf-8');
}

test('Phase 61.2 pilot decision doc keeps pilot blocked by default', async () => {
  const text = await readRootFile('PHASE61_2_PILOT_CANDIDATE_DECISION.md');

  assert.match(text, /pilotAllowed=false/);
  assert.match(text, /implementationAllowed=false/);
  assert.match(text, /No pilot/);
  assert.match(text, /No Phase 62/);
  assert.match(text, /No externalization/);
  assert.match(text, /one warning → monitor/);
  assert.match(text, /one warning → PostgreSQL/);
});

test('Phase 61.2 repository contracts doc keeps docs-only posture', async () => {
  const text = await readRootFile('PHASE61_2_REPOSITORY_ADAPTER_CONTRACTS.md');

  assert.match(text, /docsOnly=true/);
  assert.match(text, /runtimeSwitchEnabled=false/);
  assert.match(text, /externalAdapterImplemented=false/);
  assert.match(text, /fileBackedSourceOfTruth=true/);
  assert.match(text, /No Runtime Switch/);
  assert.match(text, /No external queue adapter is implemented in Phase 61\.2/);
  assert.match(text, /No external search adapter is implemented in Phase 61\.2/);
});

test('Config still declares repository contracts as docs-only and runtime switch disabled', async () => {
  const configText = await readRootFile('config.js');

  assert.match(configText, /REPOSITORY_CONTRACTS:\s*\{/);
  assert.match(configText, /docsOnly:\s*true/);
  assert.match(configText, /runtimeSwitchEnabled:\s*false/);
  assert.match(configText, /contractTestsEnabled:\s*true/);
});

test('Event bridge and SSE fanout docs are planning-only', async () => {
  const eventBridge = await readRootFile('PHASE61_2_EVENT_BRIDGE_PILOT_PLAN.md');
  const sseFanout = await readRootFile('PHASE61_2_SSE_FANOUT_PILOT_PLAN.md');

  assert.match(eventBridge, /Implementation: not justified now/);
  assert.match(eventBridge, /Do not implement/);
  assert.match(eventBridge, /Redis pub\/sub/);

  assert.match(sseFanout, /Implementation: not justified now/);
  assert.match(sseFanout, /Do not implement SSE fanout now/);
  assert.match(sseFanout, /multi-instance pilot is approved/);
});
