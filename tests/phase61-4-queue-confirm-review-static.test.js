// ═══════════════════════════════════════════════════════════════
// tests/phase61-4-queue-confirm-review-static.test.js
// Phase 61.4 — Queue Confirm Review + Drain Behavior Guardrails
// ═══════════════════════════════════════════════════════════════
// Guards:
// - queue confirm review document exists
// - repair/drain/compact confirm sequence is documented
// - queue-drain is explicitly documented as processDueJobs / due-job processing
// - QUEUE_SUMMARY_MISMATCH remains a blocker
// - actual segmented files are source of truth during mismatch
// - no unsafe architecture conclusions or destructive remediation
// - no new dependencies
// ═══════════════════════════════════════════════════════════════

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const DOC_PATH = 'docs/operations/QUEUE_REPAIR_CONFIRM_REVIEW_2026-05-29.md';
const PACKAGE_PATH = 'package.json';

async function read(path) {
  return await readFile(path, 'utf-8');
}

function assertIncludes(doc, phrase) {
  assert.match(
    doc,
    new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `${phrase} must be documented`
  );
}

test('Phase 61.4 queue confirm review document exists and names the active blocker', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'Queue Repair Confirm Review');
  assertIncludes(doc, 'Phase 61.4');
  assertIncludes(doc, 'QUEUE_SUMMARY_MISMATCH');
  assertIncludes(doc, 'ACTIVE BLOCKER');
});

test('Queue confirm review documents the approved repair/drain/compact confirm sequence', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'node scripts/repair-queue.js --confirm --json');
  assertIncludes(doc, 'node scripts/queue-drain.js --confirm --json');
  assertIncludes(doc, 'node scripts/compact-queue.js --confirm --json');

  assertIncludes(doc, 'repair-queue --confirm Result');
  assertIncludes(doc, 'queue-drain --confirm Result');
  assertIncludes(doc, 'compact-queue --confirm Result');
});

test('Queue confirm review documents queue-drain claiming 40 due jobs via processDueJobs', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'totalClaimed: 40');
  assertIncludes(doc, 'processDueJobs');
  assertIncludes(doc, 'queue-drain --confirm claimed 40 due jobs because it invokes processDueJobs()');
  assertIncludes(doc, 'queue-drain is not stale-running recovery only');
  assertIncludes(doc, 'manual due-job processing loop');
});

test('Queue confirm review preserves actual segmented files as source of truth', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'actual segmented queue files');
  assertIncludes(doc, 'source of truth');
  assertIncludes(doc, 'queue summary/location index as rebuildable acceleration metadata only');
  assertIncludes(doc, 'Do not treat metrics/queue/summary.json as source of truth while stale');
});

test('Queue confirm review documents active server process risk before future remediation', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, '34324 node /mnt/j/yawmia/server.js');
  assertIncludes(doc, 'Do not run queue mutation while an active Yawmia server or queue worker exists');
  assertIncludes(doc, '/mnt/j/yawmia');
});

test('Queue confirm review forbids unsafe queue mutation commands without new approval', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'Forbidden without new explicit approval');
  assertIncludes(doc, 'repair-queue.js --confirm');
  assertIncludes(doc, 'queue-drain.js --confirm');
  assertIncludes(doc, 'compact-queue.js --confirm');
  assertIncludes(doc, 'reset-dev-data.js --confirm');
  assertIncludes(doc, 'quarantine-corrupt-json.js --confirm');
});

test('Queue confirm review forbids unsafe architecture conclusions', async () => {
  const doc = await read(DOC_PATH);

  const requiredGuardrails = [
    'No External Queue',
    'No PostgreSQL',
    'No Reset',
    'No Quarantine',
    'No Pilot',
    'No Redis',
    'No external search',
    'No version rollback',
  ];

  for (const phrase of requiredGuardrails) {
    assertIncludes(doc, phrase);
  }
});

test('Queue confirm review includes dedicated stale running recovery requirements', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'Required Future Stale Running Recovery Strategy');
  assertIncludes(doc, 'scripts/recover-stale-running-jobs.js');
  assertIncludes(doc, 'not process due jobs');
  assertIncludes(doc, 'not claim fresh pending jobs');
  assertIncludes(doc, 'not run processDueJobs()');
  assertIncludes(doc, 'mutationPerformed:false');
});

test('Queue confirm review includes operator-facing clarity copy', async () => {
  const doc = await read(DOC_PATH);

  assertIncludes(doc, 'تشغيل هذا الأمر سيعالج وظائف Queue المستحقة الآن، وليس استرداد وظائف stale فقط');
  assertIncludes(doc, 'ابدأ دائمًا بـ dry-run قبل أي إصلاح');
  assertIncludes(doc, 'لا تشغّل confirm أثناء وجود server أو worker نشط');
});

test('package still has no new production dependencies except dotenv', async () => {
  const pkg = JSON.parse(await read(PACKAGE_PATH));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.ok(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
});
