import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const docs = [
  'PHASE60_EXTERNALIZATION_DECISION.md',
  'PHASE60_MIGRATION_REHEARSAL.md',
  'PHASE60_ROLLBACK_PLAN.md',
  'PHASE60_REPOSITORY_BOUNDARIES.md',
  'PHASE60_EVENT_BRIDGE_DESIGN.md',
  'PHASE60_SSE_FANOUT_DESIGN.md',
  'PHASE60_OBJECT_STORAGE_DECISION.md',
  'PHASE60_EXTERNAL_QUEUE_DECISION.md',
  'PHASE60_EXTERNAL_SEARCH_DECISION.md',
];

test('Phase 60 docs exist and preserve advisory guardrails', async () => {
  for (const doc of docs) {
    const text = await readFile(doc, 'utf-8');
    assert.ok(text.length > 100, `${doc} should not be empty`);
    assert.doesNotMatch(text, /npm install pg/i);
    assert.doesNotMatch(text, /npm install redis/i);
  }
});

test('Phase 60 externalization decision doc blocks premature migration', async () => {
  const text = await readFile('PHASE60_EXTERNALIZATION_DECISION.md', 'utf-8');

  assert.match(text, /Do not implement PostgreSQL because of a single warning/);
  assert.match(text, /Do not externalize without repeated evidence/);
  assert.match(text, /Do not run multiple writers/);
});
