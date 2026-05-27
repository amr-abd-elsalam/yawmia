import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

async function listRootMarkdown() {
  const entries = await readdir(ROOT, { withFileTypes: true });
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => e.name)
    .sort();
}

test('Phase 61.3 keeps review bundles at root and organizes project docs under docs/', async () => {
  const rootMarkdown = await listRootMarkdown();

  const allowedRootMarkdown = new Set([
    'README.md',
    'CODEBASE_PART1.md',
    'CODEBASE_PART2.md',
    'CODEBASE_PART3.md',
    'CODEBASE_PART4.md',
  ]);

  const unexpected = rootMarkdown.filter(name => !allowedRootMarkdown.has(name));

  assert.deepEqual(unexpected, [], 'Only README.md and CODEBASE_PART*.md may remain at repository root');

  assert.equal(await exists(join(ROOT, 'CODEBASE_PART1.md')), true);
  assert.equal(await exists(join(ROOT, 'CODEBASE_PART2.md')), true);
  assert.equal(await exists(join(ROOT, 'CODEBASE_PART3.md')), true);
  assert.equal(await exists(join(ROOT, 'CODEBASE_PART4.md')), true);

  assert.equal(await exists(join(ROOT, 'docs')), true);
  assert.equal(await exists(join(ROOT, 'docs', 'README.md')), true);
});

test('Phase 61.3 docs index preserves no externalization and no pilot posture', async () => {
  const raw = await readFile(join(ROOT, 'docs', 'README.md'), 'utf-8');

  assert.match(raw, /file-backed JSON source of truth/);
  assert.match(raw, /advisory-only/);
  assert.match(raw, /blocked by default/);
  assert.match(raw, /No runtime externalization is enabled|Do not externalize/);
  assert.match(raw, /Do not start Phase 62/);
});

test('Phase 61.3 expected docs locations exist after organization', async () => {
  const expected = [
    'docs/design/DESIGN_RESEARCH.md',

    'docs/phases/phase60/PHASE60_AUTH_PROVIDER_STRATEGY.md',
    'docs/phases/phase60/PHASE60_AUTH_SECURITY_REVIEW.md',
    'docs/phases/phase60/PHASE60_EGYPT_SENDER_ID_RUNBOOK.md',

    'docs/phases/phase61/PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md',
    'docs/phases/phase61/PHASE61_EVENT_BRIDGE_PILOT_PLAN.md',
    'docs/phases/phase61/PHASE61_SSE_FANOUT_PILOT_PLAN.md',

    'docs/phases/phase61-2/PHASE61_2_EVIDENCE_CADENCE.md',
    'docs/phases/phase61-2/PHASE61_2_REMEDIATION_OPERATIONS.md',
    'docs/phases/phase61-2/PHASE61_2_REPOSITORY_ADAPTER_CONTRACTS.md',
    'docs/phases/phase61-2/PHASE61_2_EVENT_BRIDGE_PILOT_PLAN.md',
    'docs/phases/phase61-2/PHASE61_2_SSE_FANOUT_PILOT_PLAN.md',

    'docs/incidents/INCIDENT_RUNBOOKS.md',
    'docs/operations/OPERATIONS_RUNBOOK.md',
    'docs/privacy/PRIVACY_DATA_MAP.md',
  ];

  for (const rel of expected) {
    assert.equal(await exists(join(ROOT, rel)), true, `${rel} should exist`);
  }
});

test('Phase 61.3 moved planning docs preserve guardrail phrases', async () => {
  const eventBridge = await readFile(join(ROOT, 'docs/phases/phase61-2/PHASE61_2_EVENT_BRIDGE_PILOT_PLAN.md'), 'utf-8');
  const sseFanout = await readFile(join(ROOT, 'docs/phases/phase61-2/PHASE61_2_SSE_FANOUT_PILOT_PLAN.md'), 'utf-8');
  const repoContracts = await readFile(join(ROOT, 'docs/phases/phase61-2/PHASE61_2_REPOSITORY_ADAPTER_CONTRACTS.md'), 'utf-8');
  const authStrategy = await readFile(join(ROOT, 'docs/phases/phase60/PHASE60_AUTH_PROVIDER_STRATEGY.md'), 'utf-8');

  assert.match(eventBridge, /Do not implement EventBus bridge|Implementation is not justified now|planning only/i);
  assert.match(sseFanout, /Do not implement SSE fanout|Do not implement|planning only/i);

  assert.match(repoContracts, /docsOnly=true/);
  assert.match(repoContracts, /runtimeSwitchEnabled=false/);
  assert.match(repoContracts, /fileBackedSourceOfTruth=true|file-backed source remains source of truth/i);

  assert.match(authStrategy, /docs-first/i);
  assert.match(authStrategy, /file-backed OTP/i);
  assert.match(authStrategy, /Do not implement|does not enable/i);
});
