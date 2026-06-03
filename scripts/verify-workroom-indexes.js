#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-workroom-indexes.js — Workroom Search Verify CLI (Phase 55/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-workroom-indexes.js --json
//   node scripts/verify-workroom-indexes.js --jobId=job_x --json
//   node scripts/verify-workroom-indexes.js --jobId=job_x --repair --dry-run --json
//   node scripts/verify-workroom-indexes.js --jobId=job_x --repair --confirm --json
//
// Safety:
//   - Verification is read-only.
//   - Repair is dry-run by default.
//   - Repair mutation requires --confirm.
//   - --json emits machine-readable output.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const REPAIR = process.argv.includes('--repair');
const DRY_RUN = process.argv.includes('--dry-run') || (REPAIR && !CONFIRM);
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

function buildConfirmCommand(jobId) {
  return `node scripts/verify-workroom-indexes.js --jobId=${jobId} --repair --confirm --json`;
}

async function main() {
  const started = Date.now();
  const jobId = getArg('jobId', '');

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

  const {
    verifyWorkroomSearchIndex,
    verifyAllWorkroomSearchIndexes,
    repairWorkroomSearchIndex,
  } = await import('../server/services/workroomIndexHealth.js');

  let result = null;

  if (REPAIR && !jobId) {
    const output = {
      ok: false,
      dryRun: DRY_RUN,
      confirm: CONFIRM,
      repair: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      code: 'JOB_ID_REQUIRED_FOR_REPAIR',
      error: '--repair requires --jobId=job_x',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.error('❌ --repair requires --jobId=job_x');
    }

    process.exit(1);
  }

  if (jobId && REPAIR && DRY_RUN) {
    const before = await verifyWorkroomSearchIndex(jobId);

    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      repair: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      derivedArtifact: 'workroom_search_indexes',
      jobId,
      before,
      plannedAction: 'repair/rebuild one derived workroom search index',
      confirmCommand: buildConfirmCommand(jobId),
      warnings: [
        'dry-run repair does not rebuild or write workroom search index files',
        'confirmed repair writes derived/rebuildable workroom search index artifacts',
        'messages remain the source of truth',
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
      console.log('\n🔎 يوميّة Workroom Search Index Repair — DRY RUN\n');
      console.log(`   jobId: ${jobId}`);
      console.log(`   before: ${before.status || 'unknown'}`);
      console.log('   mutationPerformed: false');
      console.log('\nTo repair derived index:');
      console.log(`   ${output.confirmCommand}\n`);
    }

    return;
  }

  if (jobId && REPAIR && !DRY_RUN) {
    result = await repairWorkroomSearchIndex(jobId);

    const output = {
      ok: !!result.ok,
      dryRun: false,
      confirm: true,
      repair: true,
      mutationPerformed: true,
      sourceDataMutated: false,
      derivedArtifact: 'workroom_search_indexes',
      jobId,
      result,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log('\n🔎 يوميّة Workroom Search Index Repair — CONFIRMED\n');
      console.log(`Repair jobId: ${jobId}`);
      console.log(`Before: ${result.before?.status || 'unknown'}`);
      console.log(`After:  ${result.after?.status || 'unknown'}`);
      console.log('\n✅ Repair complete\n');
    }

    if (!result.ok) process.exit(1);
    return;
  }

  if (jobId) {
    result = await verifyWorkroomSearchIndex(jobId);

    const output = {
      ok: !(result.errors && result.errors.length > 0),
      dryRun: true,
      confirm: false,
      repair: false,
      mutationPerformed: false,
      sourceDataMutated: false,
      jobId,
      result,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log('\n🔎 يوميّة Workroom Search Index Verify\n');
      console.log(`jobId: ${jobId}`);
      console.log(`status: ${result.status}`);
      console.log(`messages: ${result.messageCount || 0}`);
      console.log(`tokens: ${result.tokenCount || 0}`);
      console.log(`warnings: ${(result.warnings || []).length}`);
      console.log(`errors: ${(result.errors || []).length}\n`);
    }

    if (!output.ok) process.exit(1);
    return;
  }

  result = await verifyAllWorkroomSearchIndexes();

  const output = {
    ok: !!result.ok,
    dryRun: true,
    confirm: false,
    repair: false,
    mutationPerformed: false,
    sourceDataMutated: false,
    result,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
  } else {
    console.log('\n🔎 يوميّة Workroom Search Index Verify\n');
    console.log(`Total: ${result.total || 0}`);
    console.log(`Healthy: ${result.healthy || 0}`);
    console.log(`Warnings: ${result.warnings || 0}`);
    console.log(`Failed: ${result.failed || 0}\n`);
  }

  if (!result.ok) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    repair: REPAIR,
    mutationPerformed: false,
    sourceDataMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Workroom index verify failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
