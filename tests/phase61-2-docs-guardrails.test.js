import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOC_PATHS = {
  'PHASE61_2_EVIDENCE_CADENCE.md': 'docs/phases/phase61-2/PHASE61_2_EVIDENCE_CADENCE.md',
  'PHASE61_2_DEEP_MIGRATION_REHEARSAL.md': 'docs/phases/phase61-2/PHASE61_2_DEEP_MIGRATION_REHEARSAL.md',
};

async function readRootFile(fileName) {
  return await readFile(join(ROOT, DOC_PATHS[fileName] || fileName), 'utf-8');
}

test('Phase 61.2 evidence cadence doc exists and preserves no-externalization posture', async () => {
  const text = await readRootFile('docs/phases/phase61-2/PHASE61_2_EVIDENCE_CADENCE.md');

  assert.match(text, /Evidence Cadence → Remediation Ownership → Rehearsal Discipline → Pilot Gate Confidence/);
  assert.match(text, /Stay file-backed/);
  assert.match(text, /Do not decide pilot/);
  assert.match(text, /Do not externalize/);
  assert.match(text, /node scripts\/phase61-1-remediation-status\.js --json/);
  assert.match(text, /node scripts\/capture-phase61-evidence\.js --persist --json/);
  assert.match(text, /node scripts\/ops-weekly-review\.js --persist/);
});

test('Phase 61.2 deep migration rehearsal doc is explicitly non-mutating', async () => {
  const text = await readRootFile('docs/phases/phase61-2/PHASE61_2_DEEP_MIGRATION_REHEARSAL.md');

  assert.match(text, /sourceDataMutated=false/);
  assert.match(text, /externalDbConnected=false/);
  assert.match(text, /externalQueueConnected=false/);
  assert.match(text, /externalSearchConnected=false/);
  assert.match(text, /No external target is created/);
  assert.match(text, /does not implement/);
  assert.match(text, /PostgreSQL adapter/);
});

test('Phase 61.2 package dependency discipline remains unchanged', async () => {
  const pkg = JSON.parse(await readRootFile('package.json'));

  assert.deepEqual(Object.keys(pkg.dependencies || {}), ['dotenv']);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.version, '0.57.0');
});
