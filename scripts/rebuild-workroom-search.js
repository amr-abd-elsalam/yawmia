#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-workroom-search.js — Workroom Search Rebuild CLI (Phase 53/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-workroom-search.js --jobId=job_x --dry-run --json
//   node scripts/rebuild-workroom-search.js --jobId=job_x --confirm --json
//   node scripts/rebuild-workroom-search.js --all --dry-run --json [--limit=1000]
//   node scripts/rebuild-workroom-search.js --all --confirm --json [--limit=1000]
//
// Safety:
//   - Default is dry-run.
//   - Mutation requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode rebuilds derived/rebuildable workroom search indexes.
//   - Message records remain the source of truth.
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

function toPositiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand({ jobId, all, limit }) {
  const parts = ['node scripts/rebuild-workroom-search.js', '--confirm', '--json'];
  if (jobId) parts.push(`--jobId=${jobId}`);
  if (all) parts.push('--all');
  if (all && limit) parts.push(`--limit=${limit}`);
  return parts.join(' ');
}

async function main() {
  const started = Date.now();
  const jobId = getArg('jobId', '');
  const all = process.argv.includes('--all');
  const limit = toPositiveInt(getArg('limit', '1000'), 1000, 10000);

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

  if (!jobId && !all) {
    const output = {
      ok: false,
      dryRun: DRY_RUN,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      code: 'MISSING_TARGET',
      error: 'Missing --jobId=job_x or --all',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.error('❌ Missing --jobId=job_x or --all');
    }

    process.exit(1);
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { rebuildWorkroomSearchIndex, getWorkroomSearchStats } =
    await import('../server/services/workroomSearch.js');

  let plannedJobIds = [];
  let beforeStats = null;

  if (jobId) {
    plannedJobIds = [jobId];
    beforeStats = await getWorkroomSearchStats(jobId).catch(err => ({
      enabled: true,
      status: 'unknown',
      error: err.message,
    }));
  } else {
    const { listAll } = await import('../server/services/jobs.js');
    const jobs = await listAll();
    plannedJobIds = jobs
      .filter(job => job && job.id)
      .slice(0, limit)
      .map(job => job.id);
  }

  const confirmCommand = buildConfirmCommand({ jobId, all, limit });

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      derivedArtifact: 'workroom_search_indexes',
      jobId: jobId || null,
      all,
      limit: all ? limit : null,
      plannedJobs: plannedJobIds.length,
      plannedJobIds: plannedJobIds.slice(0, 50),
      beforeStats,
      confirmCommand,
      warnings: [
        'dry-run does not rebuild or write workroom search indexes',
        'confirmed mode writes derived/rebuildable workroom search index files',
        'messages remain the source of truth',
        '--all can touch many derived index files; review plannedJobs first',
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
      console.log('\n🔎 يوميّة Workroom Search Rebuild — DRY RUN\n');
      console.log('   mutationPerformed: false');
      console.log(`   plannedJobs: ${plannedJobIds.length}`);
      if (jobId) console.log(`   jobId: ${jobId}`);
      console.log('\nTo rebuild derived indexes:');
      console.log(`   ${confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🔎 يوميّة Workroom Search Rebuild — CONFIRMED\n');
    console.log('   ⚠️ This writes derived/rebuildable workroom search index files.');
    console.log('   Messages remain the source of truth.\n');
  }

  let rebuilt = 0;
  let failed = 0;
  const results = [];
  const failures = [];

  for (let i = 0; i < plannedJobIds.length; i++) {
    const id = plannedJobIds[i];

    try {
      const result = await rebuildWorkroomSearchIndex(id);
      if (result && result.rebuilt) rebuilt++;

      results.push({
        jobId: id,
        rebuilt: !!(result && result.rebuilt),
        messageCount: result?.messageCount || 0,
        tokenCount: result?.tokenCount || 0,
        skipped: !!(result && result.skipped),
        error: result?.error || null,
      });

      if (!JSON_OUT && jobId) {
        console.log('✅ Rebuild complete');
        console.log(`   jobId: ${id}`);
        console.log(`   messages: ${result?.messageCount || 0}`);
        console.log(`   tokens: ${result?.tokenCount || 0}\n`);
      }
    } catch (err) {
      failed++;
      failures.push({ jobId: id, error: err.message });
      if (!JSON_OUT) {
        console.warn(`   ⚠️ Failed ${id}: ${err.message}`);
      }
    }

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const output = {
    ok: failed === 0,
    dryRun: false,
    confirm: true,
    mutationPerformed: rebuilt > 0,
    sourceDataMutated: false,
    derivedArtifact: 'workroom_search_indexes',
    jobId: jobId || null,
    all,
    plannedJobs: plannedJobIds.length,
    rebuilt,
    failed,
    results: results.slice(0, 200),
    failures,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
    return;
  }

  console.log('✅ Rebuild complete');
  console.log(`   jobs scanned: ${plannedJobIds.length}`);
  console.log(`   rebuilt: ${rebuilt}`);
  console.log(`   failed: ${failed}`);
  console.log(`   duration: ${output.durationMs}ms\n`);

  if (!output.ok) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Workroom search rebuild failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
