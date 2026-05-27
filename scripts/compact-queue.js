#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-queue.js — Queue Compaction CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/compact-queue.js [--dry-run] [--status=completed]
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const dryRun = DRY_RUN;
  const status = getArg('status', '');

  if (!JSON_OUT) {
    console.log(`\n🧹 يوميّة Queue Compaction${dryRun ? ' (DRY RUN)' : ' (CONFIRMED)'}\n`);
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { compactQueue } = await import('../server/services/queueCompaction.js');

  const result = await compactQueue({
    dryRun,
    status: status || undefined,
  });

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok === false ? 1 : 0);
  }

  if (result.skipped) {
    console.log(`⚠️ Skipped: ${result.reason}`);
    process.exit(0);
  }

  console.log(dryRun ? '✅ Queue compaction dry-run complete. Re-run with --confirm to mutate.' : '✅ Queue compaction complete');
  console.log(`   dryRun: ${dryRun ? 'yes' : 'no'}`);
  console.log(`   archived: ${result.archive?.archived || 0}`);
  console.log(`   archive scanned: ${result.archive?.scanned || 0}`);
  console.log(`   idempotency cleaned: ${result.idempotency?.cleaned || 0}`);
  console.log(`   slow jobs: ${result.slowJobs?.count || 0}`);
  console.log(`   duration: ${result.durationMs || 0}ms\n`);
}

main().catch(err => {
  if (JSON_OUT) {
    console.log(JSON.stringify({
      ok: false,
      dryRun: DRY_RUN,
      error: err.message,
      stack: err.stack,
    }, null, 2));
  } else {
    console.error('\n❌ Queue compaction failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
