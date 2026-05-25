#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-rollback-rehearsal.js — Phase 61 Rollback Rehearsal
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--persist') args.persist = true;
    else if (arg === '--confirm') args.confirm = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--backup=')) args.backupReference = arg.slice('--backup='.length);
    else if (arg.startsWith('--snapshot=')) args.snapshotReference = arg.slice('--snapshot='.length);
  }
  return args;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/run-rollback-rehearsal.js --dry-run --json
  node scripts/run-rollback-rehearsal.js --persist --confirm
  node scripts/run-rollback-rehearsal.js --backup=./backups/yawmia-backup-... --snapshot=./migration-snapshots/test --json

Non-destructive:
  - does not restore production
  - does not mutate source data
  - does not connect to external DB/search/queue
`);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

try {
  const originalConsole = { log: console.log, warn: console.warn, error: console.error };
  if (args.json) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { runRollbackRehearsal } = await import('../server/services/rollbackRehearsal.js');

  const result = await runRollbackRehearsal({
    dryRun: !!args.dryRun,
    persist: !!args.persist || !!args.confirm,
    confirm: !!args.confirm,
    backupReference: args.backupReference || undefined,
    snapshotReference: args.snapshotReference || undefined,
  });

  if (args.json) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    const r = result.rehearsal || {};
    console.log('\n↩ Phase 61 Rollback Rehearsal\n');
    console.log(`Status: ${r.status || 'unknown'}`);
    console.log(`Source mutated: ${r.sourceDataMutated ? 'yes' : 'no'}`);
    console.log(`External DB connected: ${r.externalDbConnected ? 'yes' : 'no'}`);
    console.log(`Backup: ${r.backupReference || '-'}`);
    console.log(`Restore drill: ${r.restoreDrillReference ? r.restoreDrillReference.id : '-'}`);
    console.log(`Blockers: ${(r.blockers || []).length}`);
    console.log(`Warnings: ${(r.warnings || []).length}`);
    if (r.id && (args.persist || args.confirm)) console.log(`Report: ${r.id}`);
    console.log('');
  }

  const ok = result.ok || (!args.strict && result.rehearsal && result.rehearsal.status === 'warning');
  process.exit(ok ? 0 : 1);
} catch (err) {
  const out = {
    ok: false,
    status: 'failed',
    error: err.message,
    sourceDataMutated: false,
    externalDbConnected: false,
    generatedAt: new Date().toISOString(),
  };
  if (args.json) console.log(JSON.stringify(out, null, 2));
  else console.error(err);
  process.exit(1);
}
