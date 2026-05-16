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

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const status = getArg('status', '');

  console.log(`\n🧹 يوميّة Queue Compaction${dryRun ? ' (DRY RUN)' : ''}\n`);

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { compactQueue } = await import('../server/services/queueCompaction.js');

  const result = await compactQueue({
    dryRun,
    status: status || undefined,
  });

  if (result.skipped) {
    console.log(`⚠️ Skipped: ${result.reason}`);
    process.exit(0);
  }

  console.log('✅ Queue compaction complete');
  console.log(`   archived: ${result.archive?.archived || 0}`);
  console.log(`   archive scanned: ${result.archive?.scanned || 0}`);
  console.log(`   idempotency cleaned: ${result.idempotency?.cleaned || 0}`);
  console.log(`   slow jobs: ${result.slowJobs?.count || 0}`);
  console.log(`   duration: ${result.durationMs || 0}ms\n`);
}

main().catch(err => {
  console.error('\n❌ Queue compaction failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
