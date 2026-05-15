#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-workroom-search.js — Workroom Search Rebuild CLI (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-workroom-search.js --jobId=job_x
//   node scripts/rebuild-workroom-search.js --all
// Rebuilds per-job Workroom message search indexes.
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
  const all = process.argv.includes('--all');

  console.log('\n🔎 يوميّة Workroom Search Rebuild\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { rebuildWorkroomSearchIndex } = await import('../server/services/workroomSearch.js');

  if (!jobId && !all) {
    console.error('❌ Missing --jobId=job_x or --all');
    process.exit(1);
  }

  if (jobId) {
    const result = await rebuildWorkroomSearchIndex(jobId);
    console.log('✅ Rebuild complete');
    console.log(`   jobId: ${jobId}`);
    console.log(`   messages: ${result.messageCount || 0}`);
    console.log(`   tokens: ${result.tokenCount || 0}\n`);
    return;
  }

  const { listAll } = await import('../server/services/jobs.js');
  const jobs = await listAll();

  let rebuilt = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    try {
      const result = await rebuildWorkroomSearchIndex(job.id);
      if (result && result.rebuilt) rebuilt++;
    } catch (err) {
      failed++;
      console.warn(`   ⚠️ Failed ${job.id}: ${err.message}`);
    }

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  console.log('✅ Rebuild complete');
  console.log(`   jobs scanned: ${jobs.length}`);
  console.log(`   rebuilt: ${rebuilt}`);
  console.log(`   failed: ${failed}\n`);
}

main().catch(err => {
  console.error('\n❌ Workroom search rebuild failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
