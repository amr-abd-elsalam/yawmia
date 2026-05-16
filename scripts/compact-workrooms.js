#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-workrooms.js — Workroom Hygiene CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/compact-workrooms.js [--jobId=job_x]
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
  const jobId = getArg('jobId', '');

  console.log('\n🧹 يوميّة Workroom Hygiene\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { compactWorkroom, compactAllWorkrooms } = await import('../server/services/workroomHygiene.js');

  const result = jobId
    ? await compactWorkroom(jobId)
    : await compactAllWorkrooms();

  if (result.skipped) {
    console.log(`⚠️ Skipped: ${result.reason}`);
    process.exit(0);
  }

  console.log('✅ Workroom compaction complete');

  if (jobId) {
    console.log(`   jobId: ${jobId}`);
    console.log(`   receipts removed: ${result.receipts?.removed || 0}`);
    console.log(`   pins removed: ${result.pins?.removed || 0}`);
    console.log(`   checklist removed: ${result.checklist?.removed || 0}`);
  } else {
    console.log(`   scanned: ${result.scanned || 0}`);
    console.log(`   compacted: ${result.compacted || 0}`);
    console.log(`   failed: ${result.failed || 0}`);
    console.log(`   duration: ${result.durationMs || 0}ms`);
  }

  console.log('');
}

main().catch(err => {
  console.error('\n❌ Workroom compaction failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
