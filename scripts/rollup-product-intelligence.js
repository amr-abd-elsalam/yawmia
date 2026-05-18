#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rollup-product-intelligence.js — Phase 56 Marketplace Intelligence Rollup CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rollup-product-intelligence.js [--day=YYYY-MM-DD]
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
  const day = getArg('day', '') || new Date().toISOString().slice(0, 10);

  console.log('\n🧠 يوميّة Marketplace Intelligence Rollup\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { captureMarketplaceIntelligenceRollup } =
    await import('../server/services/marketplaceIntelligenceRollups.js');

  const rollup = await captureMarketplaceIntelligenceRollup({
    day,
    reason: 'cli',
  });

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

main().catch(err => {
  console.error('\n❌ Marketplace intelligence rollup failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
