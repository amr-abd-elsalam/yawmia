#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/compact-predictive-signals.js — Predictive Signal Retention CLI (Phase 53/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/compact-predictive-signals.js --dry-run --json [--force]
//   node scripts/compact-predictive-signals.js --confirm --json [--force]
//
// Safety:
//   - Default is dry-run.
//   - Mutation requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode archives old resolved predictive signals.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');
const FORCE = process.argv.includes('--force');

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand() {
  const parts = ['node scripts/compact-predictive-signals.js', '--confirm', '--json'];
  if (FORCE) parts.push('--force');
  return parts.join(' ');
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

  const { runPredictiveSignalRetention, getPredictivePrecisionStats } =
    await import('../server/services/predictiveSignalRetention.js');

  const before = await getPredictivePrecisionStats();

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      force: FORCE,
      mutationPerformed: false,
      sourceDataMutated: false,
      artifactMutated: false,
      before,
      plannedAction: 'archive old resolved predictive signals according to retention policy',
      confirmCommand: buildConfirmCommand(),
      warnings: [
        'dry-run does not archive or mutate predictive signal files',
        'confirmed mode calls runPredictiveSignalRetention()',
        'review precision stats before confirmed retention',
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
      console.log(`\n🧹 يوميّة Predictive Signal Retention — DRY RUN${FORCE ? ' (FORCE)' : ''}\n`);
      console.log('Before:');
      console.log(`   total: ${before.total || 0}`);
      console.log(`   active: ${before.byStatus?.active || 0}`);
      console.log(`   confirmed: ${before.byStatus?.confirmed || 0}`);
      console.log(`   false_positive: ${before.byStatus?.false_positive || 0}`);
      console.log('\nNo data was changed.');
      console.log('\nTo apply retention:');
      console.log(`  ${output.confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log(`\n🧹 يوميّة Predictive Signal Retention — CONFIRMED${FORCE ? ' (FORCE)' : ''}\n`);
  }

  const result = await runPredictiveSignalRetention({
    force: FORCE,
    reason: 'cli',
  });

  const after = await getPredictivePrecisionStats();

  const output = {
    ok: !!result.ok,
    dryRun: false,
    confirm: true,
    force: FORCE,
    mutationPerformed: (result.archived || 0) > 0,
    sourceDataMutated: false,
    artifactMutated: (result.archived || 0) > 0,
    before,
    result,
    after,
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
  } else {
    if (!result.ok) {
      console.error('\n❌ Retention failed:', result.error || result.code);
      process.exit(1);
    }

    console.log('\n✅ Retention complete');
    console.log(`   scanned: ${result.scanned || 0}`);
    console.log(`   archived: ${result.archived || 0}`);
    console.log(`   skipped: ${result.skipped || 0}`);
    console.log(`   failed: ${result.failed || 0}`);
    console.log(`   duration: ${result.durationMs || 0}ms\n`);

    console.log('After:');
    console.log(`   total: ${after.total || 0}`);
    console.log(`   active: ${after.byStatus?.active || 0}`);
    console.log(`   confirmed: ${after.byStatus?.confirmed || 0}`);
    console.log(`   false_positive: ${after.byStatus?.false_positive || 0}\n`);
  }

  if (!output.ok) process.exit(1);
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    force: FORCE,
    mutationPerformed: false,
    sourceDataMutated: false,
    artifactMutated: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Predictive signal retention failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
