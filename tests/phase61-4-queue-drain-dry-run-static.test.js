// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-queue-drain-dry-run-static.test.js
// Phase 61.4D — Queue Drain Dry-Run Review Static Guardrails
// ═══════════════════════════════════════════════════════════════
// Ensures queue-drain dry-run evidence is documented safely:
// - no mutation
// - summary-inflated counts are not treated as actual truth
// - no external queue interpretation
// - no confirm commands approved
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4D queue drain dry-run review document exists and records no mutation', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Queue Drain Dry-Run Review/);
  assert.match(doc, /Phase 61\.4D/);
  assert.match(doc, /dryRun:\s*true/);
  assert.match(doc, /mutationPerformed:\s*false/);
  assert.match(doc, /totalClaimed:\s*0/);
});

test('Phase 61.4D documents queue-drain summary counts as suspect while summary is stale', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /summary\.stale:\s*true/);
  assert.match(doc, /summary_actual_file_count_mismatch/);
  assert.match(doc, /Do not trust summary-derived active counts/);
  assert.match(doc, /Treat queue-drain byStatus and totalActiveRecords as suspect/);
});

test('Phase 61.4D cross-checks queue-drain inflated counts against actual segmented files', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /pending:\s*21680/);
  assert.match(doc, /running:\s*30802/);
  assert.match(doc, /completed:\s*31474/);
  assert.match(doc, /totalActiveRecords:\s*83956/);

  assert.match(doc, /pending:\s*286/);
  assert.match(doc, /running:\s*28/);
  assert.match(doc, /completed:\s*82/);
});

test('Phase 61.4D preserves actual segmented files as source of truth', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /actual segmented queue files/);
  assert.match(doc, /Use verify-queue actualFilesByStatus as operational truth/);
  assert.match(doc, /queue summary\/location index is stale or inflated/);
});

test('Phase 61.4D rejects external queue and pilot interpretation', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /No external queue is justified/);
  assert.match(doc, /No PostgreSQL is justified/);
  assert.match(doc, /No externalization is justified/);
  assert.match(doc, /No pilot is justified/);
});

test('Phase 61.4D keeps queue-drain confirm prohibited and points to compact dry-run next', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Do not run:\s*```bash\s*node scripts\/queue-drain\.js --confirm --json/s);
  assert.match(doc, /node scripts\/compact-queue\.js --dry-run --json/);
  assert.match(doc, /Do not run confirm commands/);
});

test('Phase 61.4D recommends hardening queue-drain output before recovery mutation', async () => {
  const doc = await read('docs/operations/QUEUE_DRAIN_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Hardening recommendation before any recovery mutation/);
  assert.match(doc, /whether counts are summary-derived or actual-file-derived/);
  assert.match(doc, /refuse or warn strongly when summary\.stale=true/);
  assert.match(doc, /list exact running job files considered stale/);
  assert.match(doc, /avoid presenting inflated totalActiveRecords as actual truth/);
});
