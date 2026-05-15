#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/run-backup-restore-drill.js — Phase 54 Restore Drill CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/run-backup-restore-drill.js [--backupPath=./backups/yawmia-backup-...]
//   node scripts/run-backup-restore-drill.js [--keep]
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const backupPath = getArg('backupPath', '') || undefined;
  const keepRestoreTarget = process.argv.includes('--keep');

  console.log('\n🧪 يوميّة Backup Restore Drill\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { runBackupRestoreDrill } = await import('../server/services/backupRestoreDrill.js');

  const result = await runBackupRestoreDrill({
    backupPath,
    keepRestoreTarget,
    reason: 'cli',
  });

  const drill = result.drill || {};

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

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Restore drill failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
