#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-backup-restore-drill.js — Phase 54 Restore Drill CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/run-backup-restore-drill.js --dry-run --json [--backupPath=./backups/yawmia-backup-...] [--keep]
//   node scripts/run-backup-restore-drill.js --confirm --json [--backupPath=./backups/yawmia-backup-...] [--keep]
//
// Safety:
//   - Default is dry-run.
//   - Restore drill execution requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode copies backup data into restore drill target and writes drill report.
//   - Source production data is not mutated.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand({ backupPath, keepRestoreTarget }) {
  const parts = ['node scripts/run-backup-restore-drill.js', '--confirm', '--json'];
  if (backupPath) parts.push(`--backupPath=${backupPath}`);
  if (keepRestoreTarget) parts.push('--keep');
  return parts.join(' ');
}

async function main() {
  const started = Date.now();
  const backupPath = getArg('backupPath', '') || undefined;
  const keepRestoreTarget = process.argv.includes('--keep');

  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  if (JSON_OUT) {
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const confirmCommand = buildConfirmCommand({ backupPath, keepRestoreTarget });

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      artifactMutated: false,
      backupPath: backupPath || null,
      keepRestoreTarget,
      plannedAction: 'run backup restore drill, copy backup into temporary restore target, verify JSON/indexes/migration state, write drill report',
      confirmCommand,
      warnings: [
        'dry-run does not copy backup files or write restore drill reports',
        'confirmed mode writes drill report and may create/remove temporary restore target',
        'source production data is not mutated',
        'use --keep only when you need to inspect the restored copy manually',
      ],
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log('\n🧪 يوميّة Backup Restore Drill — DRY RUN\n');
      console.log('   mutationPerformed: false');
      console.log(`   backupPath: ${backupPath || 'latest backup auto-detect'}`);
      console.log(`   keepRestoreTarget: ${keepRestoreTarget ? 'yes' : 'no'}`);
      console.log('\nTo run restore drill:');
      console.log(`   ${confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🧪 يوميّة Backup Restore Drill — CONFIRMED\n');
  }

  const { runBackupRestoreDrill } = await import('../server/services/backupRestoreDrill.js');

  const result = await runBackupRestoreDrill({
    backupPath,
    keepRestoreTarget,
    reason: 'cli',
  });

  const drill = result.drill || {};

  const output = {
    ok: !!result.ok,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    sourceDataMutated: false,
    artifactMutated: true,
    backupPath: backupPath || null,
    keepRestoreTarget,
    result,
    drill,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
  } else {
    console.log(`Status: ${drill.status || 'unknown'}`);
    console.log(`Drill ID: ${drill.id || '-'}`);
    console.log(`Backup: ${drill.backupPath || '-'}`);
    console.log(`Duration: ${drill.durationMs || 0}ms`);

    if (drill.counts) {
      console.log(`JSON parsed: ${drill.counts.jsonParsed || 0}/${drill.counts.jsonFiles || 0}`);
      if (drill.counts.migrationState) {
        console.log(`Migration version: ${drill.counts.migrationState.version || '-'}`);
      }
    }

    if (drill.errors && drill.errors.length > 0) {
      console.log('\nErrors:');
      for (const e of drill.errors.slice(0, 20)) {
        console.log(`  - [${e.check}] ${e.filePath || ''} ${e.error || ''}`);
      }
    }

    console.log('');
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    artifactMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Restore drill failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
