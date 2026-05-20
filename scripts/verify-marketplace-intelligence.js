#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-marketplace-intelligence.js — Phase 56 Verify CLI
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');
const STRICT = process.argv.includes('--strict');

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

  if (!JSON_OUT) console.log('\n🧪 يوميّة Marketplace Intelligence Verify\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const checks = [];

  async function check(name, fn) {
    try {
      const result = await fn();
      checks.push({ name, ok: true, result });
      if (!JSON_OUT) console.log(`✅ ${name}`);
    } catch (err) {
      checks.push({ name, ok: false, error: err.message });
      if (!JSON_OUT) console.log(`❌ ${name}: ${err.message}`);
    }
  }

  await check('search analytics', async () => {
    const mod = await import('../server/services/searchAnalytics.js');
    return await mod.getSearchAnalytics();
  });

  await check('activation funnel', async () => {
    const mod = await import('../server/services/activationFunnelMetrics.js');
    return await mod.getActivationFunnel();
  });

  await check('notification conversions', async () => {
    const mod = await import('../server/services/notificationConversionMetrics.js');
    return await mod.getNotificationConversionMetrics();
  });

  await check('workroom adoption', async () => {
    const mod = await import('../server/services/workroomAdoptionMetrics.js');
    return await mod.getWorkroomAdoptionMetrics();
  });

  await check('payment dispute analytics', async () => {
    const mod = await import('../server/services/paymentDisputeAnalytics.js');
    return await mod.getPaymentDisputeAnalytics();
  });

  await check('marketplace dashboard', async () => {
    const mod = await import('../server/services/marketplaceIntelligenceRollups.js');
    return await mod.getMarketplaceIntelligenceDashboard();
  });

  await check('marketplace rollup freshness', async () => {
    const mod = await import('../server/services/marketplaceIntelligenceRollups.js');
    const freshness = await mod.getMarketplaceRollupFreshness();
    if (STRICT && freshness.enabled && freshness.stale) {
      throw new Error('Marketplace rollup is stale or missing');
    }
    return freshness;
  });

  const failed = checks.filter(c => !c.ok);
  if (!JSON_OUT) console.log('');

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify({
      ok: failed.length === 0,
      strict: STRICT,
      generatedAt: new Date().toISOString(),
      checks,
      failed: failed.length,
    }, null, 2));
  }

  if (failed.length > 0) {
    if (!JSON_OUT) console.log(`❌ ${failed.length} check(s) failed`);
    process.exit(1);
  }

  if (!JSON_OUT) console.log('✅ Marketplace intelligence verify passed\n');
}

main().catch(err => {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      ok: false,
      error: err.message,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ Verify failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
