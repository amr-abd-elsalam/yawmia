import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

const READ_ONLY_DIAGNOSTIC_SCRIPTS = [
  'scripts/benchmark.js',
  'scripts/export-incident-timeline.js',
  'scripts/list-benchmark-history.js',
  'scripts/validate-migration-snapshot.js',
  'scripts/find-null-json-files.js',
  'scripts/report-duplicate-records.js',
];

test('read-only diagnostic/export scripts do not use destructive filesystem operations', async () => {
  for (const scriptPath of READ_ONLY_DIAGNOSTIC_SCRIPTS) {
    const source = await readScript(scriptPath);

    assert.doesNotMatch(source, /\brm\(/, `${scriptPath} must not call rm()`);
    assert.doesNotMatch(source, /\bunlink\(/, `${scriptPath} must not call unlink()`);
    assert.doesNotMatch(source, /\brename\(/, `${scriptPath} must not call rename()`);
    assert.doesNotMatch(source, /\bdeleteJSON\(/, `${scriptPath} must not call deleteJSON()`);
    assert.doesNotMatch(source, /\bwriteIndex\(/, `${scriptPath} must not call writeIndex()`);
    assert.doesNotMatch(source, /\bretryJob\(/, `${scriptPath} must not call retryJob()`);
    assert.doesNotMatch(source, /\bcancelJob\(/, `${scriptPath} must not call cancelJob()`);
  }
});

test('benchmark.js supports --json and declares no mutation', async () => {
  const source = await readScript('scripts/benchmark.js');

  assert.match(source, /--json/, 'benchmark.js must support --json');
  assert.match(source, /mutationPerformed:\s*false/, 'benchmark.js must report mutationPerformed=false');
  assert.match(source, /sourceDataMutated:\s*false/, 'benchmark.js must report sourceDataMutated=false');
  assert.match(source, /dryRun:\s*true/, 'benchmark.js must be modeled as dry-run/read-only');
});

test('export-incident-timeline.js supports --json and declares no mutation', async () => {
  const source = await readScript('scripts/export-incident-timeline.js');

  assert.match(source, /--json/, 'export-incident-timeline.js must support --json');
  assert.match(source, /mutationPerformed:\s*false/, 'export-incident-timeline.js must report mutationPerformed=false');
  assert.match(source, /sourceDataMutated:\s*false/, 'export-incident-timeline.js must report sourceDataMutated=false');
  assert.match(source, /dryRun:\s*true/, 'export-incident-timeline.js must be modeled as dry-run/read-only');
});

test('existing read-only scripts support JSON or emit JSON output', async () => {
  const jsonScripts = [
    'scripts/list-benchmark-history.js',
    'scripts/validate-migration-snapshot.js',
    'scripts/find-null-json-files.js',
  ];

  for (const scriptPath of jsonScripts) {
    const source = await readScript(scriptPath);
    assert.match(source, /--json/, `${scriptPath} must support --json`);
  }

  const reportDuplicate = await readScript('scripts/report-duplicate-records.js');
  assert.match(
    reportDuplicate,
    /JSON\.stringify/,
    'report-duplicate-records.js must emit JSON output'
  );
});
