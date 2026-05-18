#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-marketplace-intelligence.js — Phase 56 Verify CLI
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🧪 يوميّة Marketplace Intelligence Verify\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const checks = [];

  async function check(name, fn) {
    try {
      const result = await fn();
      checks.push({ name, ok: true, result });
      console.log(`✅ ${name}`);
    } catch (err) {
      checks.push({ name, ok: false, error: err.message });
      console.log(`❌ ${name}: ${err.message}`);
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

  const failed = checks.filter(c => !c.ok);
  console.log('');

  if (failed.length > 0) {
    console.log(`❌ ${failed.length} check(s) failed`);
    process.exit(1);
  }

  console.log('✅ Marketplace intelligence verify passed\n');
}

main().catch(err => {
  console.error('\n❌ Verify failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
