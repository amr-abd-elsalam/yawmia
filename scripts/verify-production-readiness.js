#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-production-readiness.js — Phase 54 Readiness CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-production-readiness.js
// Exits 1 when readiness status is not_ready.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🚦 يوميّة Production Readiness\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { getProductionReadiness } = await import('../server/services/productionReadiness.js');
  const result = await getProductionReadiness();

  console.log(`Status: ${result.status}`);
  console.log(`Environment: ${result.environment}`);
  console.log(`Summary: pass=${result.summary.pass}, warn=${result.summary.warn}, fail=${result.summary.fail}\n`);

  for (const c of result.checks || []) {
    const icon = c.status === 'pass' ? '✅' : (c.status === 'warn' ? '⚠️' : '❌');
    console.log(`${icon} ${c.id}: ${c.message}`);
  }

  console.log('');

  if (result.status === 'not_ready') {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Readiness check failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
