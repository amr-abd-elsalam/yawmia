#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-counters.js — Counter Compaction CLI (Phase 50)
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/compact-counters.js
// Safely compacts direct-offer counter file.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🧹 يوميّة Counter Compaction\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { compactCounters } = await import('../server/services/counterCompaction.js');

  const result = await compactCounters();

  if (result.skipped) {
    console.log(`⚠️ Skipped: ${result.reason}`);
    process.exit(0);
  }

  const beforeMB = ((result.beforeSizeBytes || 0) / 1048576).toFixed(2);
  const afterMB = ((result.afterSizeBytes || 0) / 1048576).toFixed(2);

  console.log('✅ Compaction complete');
  console.log(`   Before: ${beforeMB} MB`);
  console.log(`   After:  ${afterMB} MB`);
  console.log(`   Removed platform buckets: ${result.removedPlatformBuckets || 0}`);
  console.log(`   Removed employer buckets: ${result.removedEmployerBuckets || 0}`);
  console.log(`   Removed worker buckets: ${result.removedWorkerBuckets || 0}`);
  console.log(`   Archived employers: ${result.archivedEmployers || 0}`);
  console.log(`   Archived workers: ${result.archivedWorkers || 0}`);
  console.log(`   Duration: ${result.durationMs || 0}ms\n`);
}

main().catch(err => {
  console.error('\n❌ Counter compaction failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
