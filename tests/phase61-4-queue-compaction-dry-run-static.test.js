// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-queue-compaction-dry-run-static.test.js
// Phase 61.4E — Queue Compaction Dry-Run Review Static Guardrails
// ═══════════════════════════════════════════════════════════════
// Ensures queue compaction dry-run evidence is documented safely:
// - dry-run only
// - no confirm
// - expired idempotency cleanup is metadata cleanup
// - summary counts remain suspect while QUEUE_SUMMARY_MISMATCH is active
// - no external queue interpretation
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(path) {
  return await readFile(path, 'utf-8');
}

test('Phase 61.4E queue compaction dry-run review document exists and records dry-run posture', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Queue Compaction Dry-Run Review/);
  assert.match(doc, /Phase 61\.4E/);
  assert.match(doc, /node scripts\/compact-queue\.js --dry-run --json/);
  assert.match(doc, /No confirm command was run/);
});

test('Phase 61.4E documents archive and idempotency dry-run results', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /archive\.scanned:\s*82/);
  assert.match(doc, /archive\.archived:\s*0/);
  assert.match(doc, /archive\.skipped:\s*82/);
  assert.match(doc, /archive\.failed:\s*0/);

  assert.match(doc, /idempotency\.scanned:\s*356/);
  assert.match(doc, /idempotency\.cleaned:\s*137/);
  assert.match(doc, /idempotency\.skipped:\s*219/);
  assert.match(doc, /idempotency\.failed:\s*0/);
});

test('Phase 61.4E documents slow jobs as separate recovery review and not blind retry', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /slowJobs\.count:\s*28/);
  assert.match(doc, /thresholdMs:\s*300000/);
  assert.match(doc, /should not be blindly retried or mutated/);
  assert.match(doc, /queue-drain\/recovery workflows/);
});

test('Phase 61.4E treats compact summary counts as suspect while queue summary mismatch is active', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /pending:\s*22572/);
  assert.match(doc, /running:\s*31046/);
  assert.match(doc, /completed:\s*31826/);

  assert.match(doc, /pending:\s*302/);
  assert.match(doc, /running:\s*28/);
  assert.match(doc, /completed:\s*82/);

  assert.match(doc, /compact-queue summary\.byStatus is affected by stale\/inflated summary metadata/);
  assert.match(doc, /Use verify-queue actualFilesByStatus as operational truth/);
});

test('Phase 61.4E keeps confirm commands behind backup and explicit approval', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /Do not run:/);
  assert.match(doc, /node scripts\/compact-queue\.js --confirm --json/);
  assert.match(doc, /node scripts\/repair-queue\.js --confirm --json/);
  assert.match(doc, /node scripts\/queue-drain\.js --confirm --json/);
  assert.match(doc, /backup/);
  assert.match(doc, /explicit approval/);
});

test('Phase 61.4E rejects externalization interpretation', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /No external queue is justified/);
  assert.match(doc, /No PostgreSQL is justified/);
  assert.match(doc, /No external search is justified/);
  assert.match(doc, /No externalization is justified/);
  assert.match(doc, /No pilot is justified/);
});

test('Phase 61.4E recommends repairing queue summary before compaction or drain mutation', async () => {
  const doc = await read('docs/operations/QUEUE_COMPACTION_DRY_RUN_REVIEW_2026-05-29.md');

  assert.match(doc, /repair queue summary\/location index from actual files/);
  assert.match(doc, /verify queue strict/);
  assert.match(doc, /compact expired idempotency records/);
  assert.match(doc, /review stale\/slow running jobs/);
  assert.match(doc, /This order avoids acting on inflated summary-derived counts/);
});
