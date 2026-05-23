#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-production-readiness.js — Phase 59 Readiness CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-production-readiness.js
//   node scripts/verify-production-readiness.js --json
//   node scripts/verify-production-readiness.js --strict
//
// Includes Phase 59 scale threshold and storage pressure readiness checks.
// Exits 1 when readiness status is not_ready, or when --strict sees warnings.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const STRICT = process.argv.includes('--strict');
const JSON_OUT = process.argv.includes('--json');

async function main() {
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

  const { getProductionReadiness } = await import('../server/services/productionReadiness.js');
  const result = await getProductionReadiness();

  const failCount = result.summary?.fail || 0;
  const warnCount = result.summary?.warn || 0;

  result.strict = STRICT;
  result.ok = failCount === 0 && (!STRICT || warnCount === 0);

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n🚦 يوميّة Production Readiness\n');
    console.log(`Status: ${result.status}`);
    console.log(`Environment: ${result.environment}`);
    console.log(`Strict: ${STRICT ? 'yes' : 'no'}`);
    console.log(`Summary: pass=${result.summary.pass}, warn=${result.summary.warn}, fail=${result.summary.fail}\n`);

    for (const c of result.checks || []) {
      const icon = c.status === 'pass' ? '✅' : (c.status === 'warn' ? '⚠️' : '❌');
      console.log(`${icon} ${c.id}: ${c.message}`);
      if (c.recommendation) {
        console.log(`   → ${c.recommendation}`);
      }
    }

    console.log(result.ok ? '\n✅ Production readiness passed\n' : '\n❌ Production readiness failed\n');
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      ok: false,
      status: 'not_ready',
      error: err.message,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ Readiness check failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
