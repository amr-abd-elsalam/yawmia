import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

const DERIVED_REBUILD_SCRIPTS = [
  'scripts/rebuild-predictive-archive-index.js',
  'scripts/rebuild-search-relevance.js',
  'scripts/rebuild-workroom-search.js',
];

test('derived rebuild scripts support --json, --dry-run, --confirm and default to dry-run', async () => {
  for (const scriptPath of DERIVED_REBUILD_SCRIPTS) {
    const source = await readScript(scriptPath);

    assert.match(source, /--json/, `${scriptPath} must support --json`);
    assert.match(source, /--dry-run/, `${scriptPath} must support --dry-run`);
    assert.match(source, /--confirm/, `${scriptPath} must support --confirm`);

    assert.match(
      source,
      /const DRY_RUN = process\.argv\.includes\('--dry-run'\)\s*\|\|\s*!CONFIRM/,
      `${scriptPath} must default to dry-run when --confirm is absent`
    );

    assert.match(source, /mutationPerformed/, `${scriptPath} must expose mutationPerformed`);
    assert.match(source, /sourceDataMutated:\s*false/, `${scriptPath} must declare no source data mutation`);
    assert.match(source, /confirmCommand/, `${scriptPath} must expose confirmCommand guidance`);
  }
});

test('rebuild-predictive-archive-index only calls rebuild in confirmed mode', async () => {
  const source = await readScript('scripts/rebuild-predictive-archive-index.js');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'predictive archive rebuild must return before mutation in dry-run mode'
  );

  assert.match(
    source,
    /rebuildResult = await rebuildPredictiveArchiveIndex\(\)/,
    'predictive archive rebuild must call service in confirmed path'
  );
});

test('rebuild-workroom-search only rebuilds indexes in confirmed mode', async () => {
  const source = await readScript('scripts/rebuild-workroom-search.js');

  assert.match(source, /--all/, 'workroom search rebuild must document --all');
  assert.match(source, /plannedJobs/, 'workroom search dry-run must expose plannedJobs');
  assert.match(source, /confirmCommand/, 'workroom search dry-run must expose confirmCommand');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'workroom search rebuild must return before mutation in dry-run mode'
  );

  assert.match(
    source,
    /await rebuildWorkroomSearchIndex\(id\)/,
    'workroom search rebuild must call rebuild service in confirmed path'
  );
});

test('rebuild-search-relevance documents process-local in-memory behavior', async () => {
  const source = await readScript('scripts/rebuild-search-relevance.js');

  assert.match(source, /process-local in-memory indexes/i);
  assert.match(source, /does not update an already-running server process/i);
  assert.match(source, /persistentArtifactMutated:\s*false/);
  assert.match(source, /processLocalMutationPerformed/);
});

test('verify-workroom-indexes remains read-only by default and gates repair behind --confirm', async () => {
  const source = await readScript('scripts/verify-workroom-indexes.js');

  assert.match(source, /--json/, 'verify-workroom-indexes must support --json');
  assert.match(source, /--repair/, 'verify-workroom-indexes must support --repair');
  assert.match(source, /--confirm/, 'repair mode must support --confirm');

  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\)\s*\|\|\s*\(REPAIR && !CONFIRM\)/,
    'repair mode must default to dry-run unless --confirm is present'
  );

  assert.match(source, /mutationPerformed/, 'verify-workroom-indexes must expose mutationPerformed');
  assert.match(source, /sourceDataMutated:\s*false/, 'verify-workroom-indexes must declare no source data mutation');
  assert.match(source, /confirmCommand/, 'repair dry-run must expose confirmCommand guidance');

  assert.match(
    source,
    /if \(jobId && REPAIR && DRY_RUN\)[\s\S]+return;/,
    'repair dry-run must return before mutation'
  );

  assert.match(
    source,
    /if \(jobId && REPAIR && !DRY_RUN\)[\s\S]+repairWorkroomSearchIndex\(jobId\)/,
    'repair service must only be called in confirmed repair path'
  );
});
