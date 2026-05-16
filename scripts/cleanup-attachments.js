#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/cleanup-attachments.js — Workroom Attachment Cleanup CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/cleanup-attachments.js [--dry-run] [--grace-hours=24]
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
  const graceHoursRaw = getArg('grace-hours', '');
  const graceHours = graceHoursRaw ? parseInt(graceHoursRaw) : undefined;

  console.log(`\n🧼 يوميّة Attachment Cleanup${dryRun ? ' (DRY RUN)' : ''}\n`);

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { cleanupOrphanAttachments } = await import('../server/services/workroomHygiene.js');

  const result = await cleanupOrphanAttachments({
    dryRun,
    graceHours,
  });

  if (result.skipped) {
    console.log(`⚠️ Skipped: ${result.reason}`);
    process.exit(0);
  }

  console.log('✅ Attachment cleanup complete');
  console.log(`   scanned: ${result.scanned || 0}`);
  console.log(`   orphan candidates: ${result.orphanCandidates || 0}`);
  console.log(`   deleted: ${result.deleted || 0}`);
  console.log(`   skipped: ${result.skipped || 0}`);
  console.log(`   failed: ${result.failed || 0}`);
  console.log(`   graceHours: ${result.graceHours || 0}\n`);
}

main().catch(err => {
  console.error('\n❌ Attachment cleanup failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
