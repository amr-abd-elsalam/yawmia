import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

async function readScript(scriptPath) {
  return await readFile(join(ROOT, scriptPath), 'utf-8');
}

const ROLLUP_RETENTION_RESTORE_SCRIPTS = [
  'scripts/compact-predictive-signals.js',
  'scripts/rollup-product-intelligence.js',
  'scripts/rollup-trust-snapshots.js',
  'scripts/run-trust-calibration.js',
  'scripts/run-backup-restore-drill.js',
];

test('rollup/retention/restore scripts support --json, --dry-run, --confirm and default to dry-run', async () => {
  for (const scriptPath of ROLLUP_RETENTION_RESTORE_SCRIPTS) {
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

test('compact-predictive-signals only runs retention in confirmed mode', async () => {
  const source = await readScript('scripts/compact-predictive-signals.js');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'compact-predictive-signals must return before mutation in dry-run mode'
  );

  assert.match(
    source,
    /runPredictiveSignalRetention\(/,
    'compact-predictive-signals confirmed mode must call retention service'
  );
});

test('rollup-product-intelligence dry-run does not capture rollup artifact', async () => {
  const source = await readScript('scripts/rollup-product-intelligence.js');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'rollup-product-intelligence must return before capture in dry-run mode'
  );

  assert.match(
    source,
    /captureMarketplaceIntelligenceRollup\(/,
    'rollup-product-intelligence confirmed mode must call capture service'
  );
});

test('rollup-trust-snapshots dry-run does not create rollup or cleanup artifacts', async () => {
  const source = await readScript('scripts/rollup-trust-snapshots.js');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'rollup-trust-snapshots must return before mutation in dry-run mode'
  );

  assert.match(source, /createTrustSnapshotRollup\(/);
  assert.match(source, /cleanupOldTrustSnapshots\(/);
  assert.match(source, /cleanupOldCalibrationReports\(/);
});

test('run-trust-calibration gates snapshots/report persistence behind --confirm', async () => {
  const source = await readScript('scripts/run-trust-calibration.js');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'run-trust-calibration must return before artifact creation in dry-run mode'
  );

  assert.match(source, /createSnapshotsForActiveUsers\(/);
  assert.match(source, /generateCalibrationReport\(/);
  assert.match(source, /persist:\s*true/);
});

test('run-backup-restore-drill requires confirm before executing restore drill', async () => {
  const source = await readScript('scripts/run-backup-restore-drill.js');

  assert.match(
    source,
    /if \(DRY_RUN\)[\s\S]+return;/,
    'run-backup-restore-drill must return before running drill in dry-run mode'
  );

  assert.match(source, /runBackupRestoreDrill\(/);
  assert.match(source, /source production data is not mutated/i);
});
