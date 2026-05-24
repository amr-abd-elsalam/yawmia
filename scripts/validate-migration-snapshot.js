#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/validate-migration-snapshot.js — Phase 60 Snapshot Validation
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--snapshot=')) args.snapshot = arg.slice('--snapshot='.length);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/test
  node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/test --json
  node scripts/validate-migration-snapshot.js --snapshot=./migration-snapshots/test --strict

Phase 60:
  Validates manifest, NDJSON, counts, checksums, redaction and reference samples.
  Does not mutate source data.
  Does not connect to external DB.
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.snapshot) {
  const out = { ok: false, error: 'SNAPSHOT_REQUIRED' };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.error('Missing --snapshot=...');
    printHelp();
  }
  process.exit(1);
}

try {
  const { validateMigrationSnapshot } = await import('../server/services/migrationSnapshotValidation.js');
  const report = await validateMigrationSnapshot(args.snapshot, { strict: args.strict });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Snapshot: ${report.snapshotPath}`);
    console.log(`Status: ${report.status}`);
    console.log(`Errors: ${report.errors.length}`);
    console.log(`Warnings: ${report.warnings.length}`);
    console.log(`Duration: ${report.durationMs}ms`);

    if (report.errors.length > 0) {
      console.log('\nErrors:');
      for (const err of report.errors.slice(0, 20)) {
        console.log(`- ${err.code || 'ERROR'} ${err.collection || ''} ${err.message || ''}`);
      }
    }

    if (report.warnings.length > 0) {
      console.log('\nWarnings:');
      for (const warn of report.warnings.slice(0, 20)) {
        console.log(`- ${warn.code || 'WARNING'} ${warn.collection || ''} ${warn.message || ''}`);
      }
    }
  }

  if (!report.ok) process.exit(1);
  if (args.strict && report.warnings.length > 0) process.exit(1);
  process.exit(0);
} catch (err) {
  const out = { ok: false, error: err.message };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
