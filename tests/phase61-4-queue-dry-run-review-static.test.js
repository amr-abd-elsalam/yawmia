// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-queue-dry-run-review-static.test.js
// Phase 61.4C — Queue Dry-Run Review Static Guardrails
// ═══════════════════════════════════════════════════════════════
// Ensures queue dry-run evidence is documented as operational adoption,
// not externalization, not data mutation, and not repair confirmation.
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4C queue dry-run review document exists and records no mutation', async () => {
  const doc = await read('docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Queue Dry-Run Review/);
  assert.match(doc, /Phase 61\.4C/);
  assert.match(doc, /dryRun:\s*true/);
  assert.match(doc, /mutationPerformed:\s*false/);
  assert.match(doc, /No confirm command was run/);
});

test('Phase 61.4C queue dry-run review documents summary mismatch as repairable acceleration metadata', async () => {
  const doc = await read('docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /QUEUE_SUMMARY_MISMATCH/);
  assert.match(doc, /summary counts are far higher than actual segmented files/);
  assert.match(doc, /Queue summary\/location index is repairable acceleration/);
  assert.match(doc, /Actual segmented queue files are source of truth/);
});

test('Phase 61.4C queue dry-run review preserves no-externalization interpretation', async () => {
  const doc = await read('docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /No external queue is justified/);
  assert.match(doc, /No PostgreSQL is justified/);
  assert.match(doc, /No external search is justified/);
  assert.match(doc, /No pilot is justified/);
});

test('Phase 61.4C queue dry-run review records stale running and idempotency cleanup as dry-run-first', async () => {
  const doc = await read('docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /stale running jobs:\s*2/);
  assert.match(doc, /expired idempotency/i);
  assert.match(doc, /node scripts\/queue-drain\.js --dry-run --json/);
  assert.match(doc, /node scripts\/compact-queue\.js --dry-run --json/);
});

test('Phase 61.4C queue dry-run review keeps confirm commands behind explicit approval', async () => {
  const doc = await read('docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Backup before any mutation/);
  assert.match(doc, /Only after explicit approval/);
  assert.match(doc, /node scripts\/repair-queue\.js --confirm --json/);
  assert.match(doc, /Do not run confirm commands yet/);
});

test('Phase 61.4C queue dry-run review recommends hardening before confirm repair', async () => {
  const doc = await read('docs/operations/QUEUE_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Recommended Hardening Before Confirm Repair/);
  assert.match(doc, /canonical queue record path/);
  assert.match(doc, /ghost queue record paths/);
  assert.match(doc, /proposed summary rewrite counts/);
  assert.match(doc, /mutationPerformed: false in dry-run/);
});
