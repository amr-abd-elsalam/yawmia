#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-migration-rehearsal.js — Phase 60 Migration Rehearsal
// ═══════════════════════════════════════════════════════════════
// Safe validation-only rehearsal in Phase 60.
// No external DB.
// No source mutation.
// ═══════════════════════════════════════════════════════════════

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--snapshot=')) args.snapshot = arg.slice('--snapshot='.length);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/test --dry-run --json
  node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/test --out=./migration-snapshots/rehearsals/test --confirm
  node scripts/run-migration-rehearsal.js --help

Phase 60:
  Runs a safe migration rehearsal based on snapshot validation.
  Does not mutate source data.
  Does not connect to external DB/search/queue.
`);
}

function nowIso() {
  return new Date().toISOString();
}

async function writeReport(outDir, report) {
  const abs = resolve(outDir);
  await mkdir(abs, { recursive: true });
  const filePath = join(abs, 'rehearsal-report.json');
  await writeFile(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (!args.snapshot) {
  const out = {
    ok: false,
    error: 'SNAPSHOT_REQUIRED',
    message: 'Use --snapshot=./migration-snapshots/path',
  };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.error(out.message);
    printHelp();
  }
  process.exit(1);
}

try {
  const started = Date.now();
  const snapshotPath = resolve(args.snapshot);

  const { validateMigrationSnapshot } = await import('../server/services/migrationSnapshotValidation.js');

  const validation = await validateMigrationSnapshot(snapshotPath, {
    strict: !!args.strict,
  });

  const report = {
    ok: validation.ok && (!args.strict || validation.warnings.length === 0),
    status: validation.ok
      ? (validation.warnings.length > 0 ? 'warning' : 'passed')
      : 'failed',
    phase: 60,
    version: '0.57.0',
    rehearsalType: 'snapshot_validation_only',
    dryRun: !!args.dryRun,
    confirm: !!args.confirm,
    sourceDataMutated: false,
    externalDbConnected: false,
    externalSearchConnected: false,
    externalQueueConnected: false,
    snapshotPath,
    validation,
    rollbackPlanRequired: true,
    nextSteps: validation.ok
      ? [
          'Document rehearsal in weekly ops review.',
          'Keep file-backed source of truth.',
          'Do not start external pilot without approval.',
        ]
      : [
          'Fix snapshot validation errors.',
          'Re-run validate-migration-snapshot.js.',
          'Do not proceed to pilot.',
        ],
    generatedAt: nowIso(),
    durationMs: Date.now() - started,
  };

  if (args.confirm && args.out) {
    report.reportPath = await writeReport(args.out, report);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Migration rehearsal status: ${report.status}`);
    console.log(`Snapshot: ${report.snapshotPath}`);
    console.log(`Source mutated: ${report.sourceDataMutated ? 'yes' : 'no'}`);
    console.log(`External DB connected: ${report.externalDbConnected ? 'yes' : 'no'}`);
    console.log(`Validation errors: ${validation.errors.length}`);
    console.log(`Validation warnings: ${validation.warnings.length}`);
    if (report.reportPath) console.log(`Report: ${report.reportPath}`);
  }

  process.exit(report.ok ? 0 : 1);
} catch (err) {
  const out = {
    ok: false,
    status: 'failed',
    error: err.message,
    sourceDataMutated: false,
    externalDbConnected: false,
  };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
