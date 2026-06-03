#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-predictive-archive-index.js — Predictive Archive Index CLI (Phase 55/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-predictive-archive-index.js --dry-run --json
//   node scripts/rebuild-predictive-archive-index.js --confirm --json
//
// Safety:
//   - Default is dry-run.
//   - Mutation requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode rebuilds a derived/rebuildable predictive archive index.
//   - Source predictive archives remain the source of truth.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand() {
  return 'node scripts/rebuild-predictive-archive-index.js --confirm --json';
}

async function main() {
  const started = Date.now();

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
    rebuildPredictiveArchiveIndex,
    getPredictiveArchiveIndexStats,
  } = await import('../server/services/predictiveArchiveIndex.js');

  const beforeStats = await getPredictiveArchiveIndexStats();

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      derivedArtifact: 'predictive_archive_index',
      beforeStats,
      plannedAction: 'rebuild predictive archive indexes from archived predictive signal files',
      confirmCommand: buildConfirmCommand(),
      warnings: [
        'dry-run does not rebuild or write predictive archive index files',
        'confirmed mode writes only derived/rebuildable predictive archive index artifacts',
        'predictive signal archive files remain the source of truth',
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
      console.log('\n🧠 يوميّة Predictive Archive Index Rebuild — DRY RUN\n');
      console.log('   mutationPerformed: false');
      console.log(`   current status: ${beforeStats.status || 'unknown'}`);
      console.log(`   archivedSignals: ${beforeStats.archivedSignals || 0}`);
      console.log(`   scannedArchives: ${beforeStats.scannedArchives || 0}`);
      console.log('\nTo rebuild derived index:');
      console.log(`   ${output.confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🧠 يوميّة Predictive Archive Index Rebuild — CONFIRMED\n');
    console.log('   ⚠️ This writes derived/rebuildable predictive archive index artifacts.');
    console.log('   Source archives remain the source of truth.\n');
  }

  let rebuildResult = null;
  let afterStats = null;

  rebuildResult = await rebuildPredictiveArchiveIndex();

  if (rebuildResult.skipped) {
    afterStats = await getPredictiveArchiveIndexStats();

    const output = {
      ok: true,
      dryRun: false,
      confirm: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      skipped: true,
      reason: rebuildResult.reason,
      beforeStats,
      afterStats,
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.log(`⚠️ Skipped: ${rebuildResult.reason}\n`);
    }

    return;
  }

  afterStats = await getPredictiveArchiveIndexStats();

  const output = {
    ok: true,
    dryRun: false,
    confirm: true,
    mutationPerformed: true,
    sourceDataMutated: false,
    derivedArtifact: 'predictive_archive_index',
    beforeStats,
    rebuildResult,
    afterStats,
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

  console.log('✅ Predictive archive index rebuilt');
  console.log(`   archivedSignals: ${rebuildResult.archivedSignals || 0}`);
  console.log(`   scannedArchives: ${rebuildResult.scannedArchives || 0}`);
  console.log(`   riskTypes: ${rebuildResult.riskTypeCount || 0}`);
  console.log(`   statuses: ${rebuildResult.statusCount || 0}`);
  console.log(`   months: ${rebuildResult.monthCount || 0}`);
  console.log(`   duration: ${rebuildResult.durationMs || 0}ms`);
  console.log(`   status: ${afterStats.status}\n`);
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
    console.error('\n❌ Predictive archive index rebuild failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
