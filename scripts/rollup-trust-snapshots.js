#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rollup-trust-snapshots.js — Trust Rollup CLI (Phase 55/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rollup-trust-snapshots.js --dry-run --json [--month=YYYY-MM]
//   node scripts/rollup-trust-snapshots.js --confirm --json [--month=YYYY-MM]
//
// Safety:
//   - Default is dry-run.
//   - Mutation requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode writes trust rollup artifacts and may clean old trust/calibration artifacts.
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

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand(month) {
  const parts = ['node scripts/rollup-trust-snapshots.js', '--confirm', '--json'];
  if (month) parts.push(`--month=${month}`);
  return parts.join(' ');
}

async function main() {
  const started = Date.now();
  const month = getArg('month', '');

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
    createTrustSnapshotRollup,
    cleanupOldTrustSnapshots,
    cleanupOldCalibrationReports,
    getTrustRetentionStats,
  } = await import('../server/services/trustSnapshotRollups.js');

  const beforeStats = await getTrustRetentionStats().catch(err => ({
    error: err.message,
  }));

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      artifactMutated: false,
      month: month || null,
      beforeStats,
      plannedAction: 'create trust snapshot rollup and cleanup old trust/calibration artifacts',
      confirmCommand: buildConfirmCommand(month),
      warnings: [
        'dry-run does not create trust rollups',
        'dry-run does not cleanup old trust snapshots or calibration reports',
        'confirmed mode writes metrics/trust-calibration rollup artifacts and may cleanup old derived artifacts',
        'source marketplace/user data remains unchanged',
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
      console.log('\n🎯 يوميّة Trust Snapshot Rollup — DRY RUN\n');
      console.log('   mutationPerformed: false');
      console.log(`   month: ${month || 'current'}`);
      console.log('\nTo create rollup/cleanup artifacts:');
      console.log(`   ${output.confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🎯 يوميّة Trust Snapshot Rollup — CONFIRMED\n');
  }

  const rollup = await createTrustSnapshotRollup({ month: month || undefined });
  const snapshots = await cleanupOldTrustSnapshots();
  const reports = await cleanupOldCalibrationReports();

  const output = {
    ok: !rollup.skipped,
    dryRun: false,
    confirm: true,
    mutationPerformed: !rollup.skipped || (snapshots.cleaned || 0) > 0 || (reports.cleaned || 0) > 0,
    sourceDataMutated: false,
    artifactMutated: !rollup.skipped || (snapshots.cleaned || 0) > 0 || (reports.cleaned || 0) > 0,
    month: month || null,
    rollup,
    cleanup: {
      snapshots,
      reports,
    },
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
  } else {
    if (rollup.skipped) {
      console.log(`⚠️ Skipped: ${rollup.reason}`);
      process.exit(0);
    }

    console.log('✅ Trust rollup complete');
    console.log(`   month: ${rollup.rollup?.month || month || 'current'}`);
    console.log(`   snapshots: ${rollup.rollup?.snapshotCount || 0}`);
    console.log(`   avgScore: ${rollup.rollup?.avgScore || 0}`);
    console.log(`   old snapshots cleaned: ${snapshots.cleaned || 0}`);
    console.log(`   old reports cleaned: ${reports.cleaned || 0}\n`);
  }

  if (!output.ok && !rollup.skipped) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    artifactMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Trust rollup failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
