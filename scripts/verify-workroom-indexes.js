#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-workroom-indexes.js — Workroom Search Verify CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-workroom-indexes.js [--jobId=job_x] [--repair]
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
  const repair = process.argv.includes('--repair');

  console.log('\n🔎 يوميّة Workroom Search Index Verify\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const {
    verifyWorkroomSearchIndex,
    verifyAllWorkroomSearchIndexes,
    repairWorkroomSearchIndex,
  } = await import('../server/services/workroomIndexHealth.js');

  let result;

  if (jobId && repair) {
    result = await repairWorkroomSearchIndex(jobId);
    console.log(`Repair jobId: ${jobId}`);
    console.log(`Before: ${result.before?.status || 'unknown'}`);
    console.log(`After:  ${result.after?.status || 'unknown'}`);
    if (!result.ok) process.exit(1);
    console.log('\n✅ Repair complete\n');
    return;
  }

  if (jobId) {
    result = await verifyWorkroomSearchIndex(jobId);
    console.log(`jobId: ${jobId}`);
    console.log(`status: ${result.status}`);
    console.log(`messages: ${result.messageCount || 0}`);
    console.log(`tokens: ${result.tokenCount || 0}`);
    console.log(`warnings: ${(result.warnings || []).length}`);
    console.log(`errors: ${(result.errors || []).length}\n`);

    if (result.errors && result.errors.length > 0) process.exit(1);
    return;
  }

  result = await verifyAllWorkroomSearchIndexes();

  console.log(`Total: ${result.total || 0}`);
  console.log(`Healthy: ${result.healthy || 0}`);
  console.log(`Warnings: ${result.warnings || 0}`);
  console.log(`Failed: ${result.failed || 0}\n`);

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  console.error('\n❌ Workroom index verify failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
