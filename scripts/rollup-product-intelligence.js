#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rollup-product-intelligence.js — Phase 56 Marketplace Intelligence Rollup CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rollup-product-intelligence.js --dry-run --json [--day=YYYY-MM-DD]
//   node scripts/rollup-product-intelligence.js --confirm --json [--day=YYYY-MM-DD]
//
// Safety:
//   - Default is dry-run.
//   - Mutation requires --confirm.
//   - --json emits machine-readable output.
//   - Confirmed mode writes marketplace/product intelligence rollup artifacts.
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

function buildConfirmCommand(day) {
  return `node scripts/rollup-product-intelligence.js --confirm --json --day=${day}`;
}

async function main() {
  const started = Date.now();
  const day = getArg('day', '') || new Date().toISOString().slice(0, 10);

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
    captureMarketplaceIntelligenceRollup,
    getMarketplaceIntelligenceDashboard,
  } = await import('../server/services/marketplaceIntelligenceRollups.js');

  if (DRY_RUN) {
    const dashboard = await getMarketplaceIntelligenceDashboard({
      day,
      noCapture: true,
    }).catch(err => ({
      enabled: false,
      degraded: true,
      error: err.message,
    }));

    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      artifactMutated: false,
      day,
      dashboardSummary: dashboard.summary || null,
      degraded: !!dashboard.degraded,
      plannedAction: 'capture marketplace/product intelligence rollup artifact',
      confirmCommand: buildConfirmCommand(day),
      warnings: [
        'dry-run does not write marketplace intelligence rollup artifacts',
        'confirmed mode writes metrics/product-intelligence rollup artifacts',
        'source marketplace data remains unchanged',
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
      console.log('\n🧠 يوميّة Marketplace Intelligence Rollup — DRY RUN\n');
      console.log(`   day: ${day}`);
      console.log('   mutationPerformed: false');
      console.log('\nTo capture rollup artifact:');
      console.log(`   ${output.confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🧠 يوميّة Marketplace Intelligence Rollup — CONFIRMED\n');
  }

  const rollup = await captureMarketplaceIntelligenceRollup({
    day,
    reason: 'cli',
  });

  const output = {
    ok: !rollup.skipped,
    dryRun: false,
    confirm: true,
    mutationPerformed: !rollup.skipped,
    sourceDataMutated: false,
    artifactMutated: !rollup.skipped,
    day,
    rollup,
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

    console.log('✅ Rollup complete');
    console.log(`   id: ${rollup.id}`);
    console.log(`   day: ${rollup.day}`);
    console.log(`   duration: ${rollup.durationMs || 0}ms`);
    console.log(`   warnings: ${rollup.health?.warningCount || 0}`);
    console.log(`   searches: ${rollup.search?.totals?.searches || 0}`);
    console.log(`   zeroResults: ${rollup.search?.totals?.zeroResults || 0}`);
    console.log(`   paymentDisputes: ${rollup.paymentDisputes?.totals?.disputes || 0}`);
    console.log('');
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
    console.error('\n❌ Marketplace intelligence rollup failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
