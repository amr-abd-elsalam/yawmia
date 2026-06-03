import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = join(ROOT, 'docs', 'operations', 'SCRIPTS_CATALOG.md');

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

const PATCH12_SCRIPTS = [
  'scripts/backup.js',
  'scripts/migrate.js',
  'scripts/export-migration-snapshot.js',
  'scripts/run-migration-rehearsal.js',
  'scripts/run-rollback-rehearsal.js',
  'scripts/validate-migration-snapshot.js',
];

test('Patch 12 migration/backup/rehearsal scripts are cataloged with reality status', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.ok(
    catalog.includes('## Patch 12 Migration / Backup / Rehearsal Scripts Reality Check'),
    'catalog must include Patch 12 migration/backup/rehearsal section'
  );

  assert.ok(
    catalog.includes('## Patch 12 Migration / Backup / Rehearsal Dependency Map'),
    'catalog must include Patch 12 dependency map'
  );

  for (const scriptPath of PATCH12_SCRIPTS) {
    const idx = catalog.indexOf(`\`${scriptPath}\``);
    assert.notEqual(idx, -1, `${scriptPath} must be cataloged`);

    const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1800);

    assert.match(
      nearby,
      /Reviewed|Keep|Safe Read-Only|Manual With Caution|High|Medium|Low|Backup|Migration|Rehearsal/i,
      `${scriptPath} must have explicit Patch 12 safety classification`
    );
  }
});

test('backup.js copies data to backup artifacts and does not delete source files', async () => {
  const source = await readScript('scripts/backup.js');

  assert.match(source, /\bcp\(/, 'backup.js must copy data into backup artifact');
  assert.match(source, /DATA_DIR/, 'backup.js must define source data dir');
  assert.match(source, /BACKUP_BASE/, 'backup.js must define backup target base');

  assert.doesNotMatch(source, /\brm\(/, 'backup.js must not call rm()');
  assert.doesNotMatch(source, /\bunlink\(/, 'backup.js must not call unlink()');
  assert.doesNotMatch(source, /\brename\(/, 'backup.js must not call rename()');
  assert.doesNotMatch(source, /\bdeleteJSON\(/, 'backup.js must not call deleteJSON()');
});

test('migrate.js has dry-run mode but runs migrations by default when not dry-run', async () => {
  const source = await readScript('scripts/migrate.js');
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  assert.match(source, /--dry-run/, 'migrate.js must support --dry-run');
  assert.match(source, /runMigrations/, 'migrate.js runs migration service when not dry-run');

  assert.doesNotMatch(source, /--confirm/, 'migrate.js currently does not require --confirm');

  const idx = catalog.indexOf('`scripts/migrate.js`');
  assert.notEqual(idx, -1, 'migrate.js must be cataloged');

  const nearby = catalog.slice(Math.max(0, idx - 500), idx + 1800);
  assert.match(
    nearby,
    /High|Runs pending migrations by default|harden later|production guidance/i,
    'catalog must document migrate.js as high-risk legacy/manual migration CLI'
  );
});

test('export-migration-snapshot defaults to dry-run and requires confirm for artifact writes', async () => {
  const source = await readScript('scripts/export-migration-snapshot.js');

  assert.match(source, /--json/, 'export-migration-snapshot.js must support --json');
  assert.match(source, /--dry-run/, 'export-migration-snapshot.js must support --dry-run');
  assert.match(source, /--confirm/, 'export-migration-snapshot.js must support --confirm');
  assert.match(
    source,
    /const DRY_RUN = process\.argv\.includes\('--dry-run'\) \|\| !process\.argv\.includes\('--confirm'\)/,
    'export-migration-snapshot.js must default to dry-run when --confirm is absent'
  );

  assert.match(source, /implementationAllowed:\s*false/, 'snapshot export must keep implementationAllowed=false');
  assert.match(source, /Does NOT import into any external database/, 'snapshot export must document no external database import');
  assert.match(source, /\brm\(/, 'snapshot export uses rm only for output overwrite handling');
  assert.match(source, /OVERWRITE/, 'snapshot export overwrite behavior must be explicit');
});

test('run-migration-rehearsal is validation-only and declares no source/external mutation', async () => {
  const source = await readScript('scripts/run-migration-rehearsal.js');

  assert.match(source, /--json/, 'run-migration-rehearsal.js must support --json');
  assert.match(source, /--dry-run/, 'run-migration-rehearsal.js must support --dry-run');
  assert.match(source, /--confirm/, 'run-migration-rehearsal.js must support --confirm');
  assert.match(source, /validateMigrationSnapshot/, 'run-migration-rehearsal.js must validate snapshots');

  assert.match(source, /sourceDataMutated:\s*false/, 'run-migration-rehearsal.js must report sourceDataMutated=false');
  assert.match(source, /externalDbConnected:\s*false/, 'run-migration-rehearsal.js must report externalDbConnected=false');
  assert.match(source, /externalSearchConnected:\s*false/, 'run-migration-rehearsal.js must report externalSearchConnected=false');
  assert.match(source, /externalQueueConnected:\s*false/, 'run-migration-rehearsal.js must report externalQueueConnected=false');
});

test('run-rollback-rehearsal is non-destructive rehearsal with json support', async () => {
  const source = await readScript('scripts/run-rollback-rehearsal.js');

  assert.match(source, /--json/, 'run-rollback-rehearsal.js must support --json');
  assert.match(source, /--dry-run/, 'run-rollback-rehearsal.js must support --dry-run');
  assert.match(source, /--persist/, 'run-rollback-rehearsal.js must support --persist');
  assert.match(source, /--confirm/, 'run-rollback-rehearsal.js must support --confirm');
  assert.match(source, /runRollbackRehearsal/, 'run-rollback-rehearsal.js must delegate to rollback rehearsal service');

  assert.match(source, /does not restore production/, 'run-rollback-rehearsal.js must document no production restore');
  assert.match(source, /does not mutate source data/, 'run-rollback-rehearsal.js must document no source mutation');
  assert.match(source, /does not connect to external DB\/search\/queue/, 'run-rollback-rehearsal.js must document no external infrastructure connection');
});

test('validate-migration-snapshot remains read-only and json-capable', async () => {
  const source = await readScript('scripts/validate-migration-snapshot.js');

  assert.match(source, /--json/, 'validate-migration-snapshot.js must support --json');
  assert.match(source, /--strict/, 'validate-migration-snapshot.js must support --strict');
  assert.match(source, /--snapshot=/, 'validate-migration-snapshot.js must require --snapshot');
  assert.match(source, /validateMigrationSnapshot/, 'validate-migration-snapshot.js must call validation service');
  assert.match(source, /Does not mutate source data/, 'validate-migration-snapshot.js must document no source mutation');

  assert.doesNotMatch(source, /\brm\(/, 'validate-migration-snapshot.js must not call rm()');
  assert.doesNotMatch(source, /\bunlink\(/, 'validate-migration-snapshot.js must not call unlink()');
  assert.doesNotMatch(source, /\brename\(/, 'validate-migration-snapshot.js must not call rename()');
  assert.doesNotMatch(source, /\bdeleteJSON\(/, 'validate-migration-snapshot.js must not call deleteJSON()');
});

test('catalog documents Patch 12 known hardening gaps', async () => {
  const catalog = await readFile(CATALOG_PATH, 'utf-8');

  const expected = [
    'backup.js` should gain `--json`',
    'migrate.js` should gain `--json`',
    'export-migration-snapshot.js` should keep `--confirm` mandatory',
    'run-migration-rehearsal.js` should keep sourceDataMutated=false',
    'run-rollback-rehearsal.js` should remain non-destructive',
  ];

  for (const phrase of expected) {
    assert.ok(
      catalog.includes(phrase),
      `catalog must document Patch 12 hardening gap: ${phrase}`
    );
  }
});
