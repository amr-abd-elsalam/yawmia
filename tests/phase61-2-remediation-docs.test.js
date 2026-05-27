import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function readRootFile(fileName) {
  return await readFile(join(ROOT, fileName), 'utf-8');
}

test('Phase 61.2 remediation runbook requires dry-run before mutation', async () => {
  const text = await readRootFile('PHASE61_2_REMEDIATION_OPERATIONS.md');

  assert.match(text, /dry-run-first/);
  assert.match(text, /node scripts\/repair-queue\.js --dry-run --json/);
  assert.match(text, /node scripts\/compact-queue\.js --dry-run --json/);
  assert.match(text, /node scripts\/backup\.js/);
  assert.match(text, /node scripts\/repair-queue\.js --confirm --json/);
  assert.match(text, /Do not mutate without backup/);
  assert.match(text, /Do not mutate without explicit --confirm/);
});

test('Phase 61.2 remediation runbook forbids unsafe conclusions', async () => {
  const text = await readRootFile('PHASE61_2_REMEDIATION_OPERATIONS.md');

  assert.match(text, /Do not delete corrupt JSON blindly/);
  assert.match(text, /Do not retry all DLQ blindly/);
  assert.match(text, /Do not treat queue inflation as external queue evidence/);
  assert.match(text, /Do not treat JSON corruption as PostgreSQL evidence/);
  assert.match(text, /Do not run heavy scans inside readiness HTTP endpoints/);
});

test('Phase 61.2 rollback rehearsal doc blocks pilot without rollback evidence', async () => {
  const text = await readRootFile('PHASE61_2_ROLLBACK_REHEARSAL_REPORT.md');

  assert.match(text, /Default mode: dry-run/);
  assert.match(text, /Production restore: forbidden/);
  assert.match(text, /sourceDataMutated=false/);
  assert.match(text, /externalDbConnected=false/);
  assert.match(text, /externalQueueConnected=false/);
  assert.match(text, /externalSearchConnected=false/);
  assert.match(text, /Pilot gate must remain blocked/);
});
