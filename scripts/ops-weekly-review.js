#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/ops-weekly-review.js — Weekly Ops/Product Review (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/ops-weekly-review.js
//   node scripts/ops-weekly-review.js --out=weekly-review.md
// ═══════════════════════════════════════════════════════════════

import { writeFile } from 'node:fs/promises';

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

async function safe(label, fn, fallback = null) {
  try {
    return await fn();
  } catch (err) {
    return { error: err.message, label, fallback };
  }
}

function lineStatus(ok) {
  return ok ? '✅' : '⚠️';
}

async function main() {
  const outPath = getArg('out', '');
  const persist = process.argv.includes('--persist');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const [
    readiness,
    queueStats,
    opsSlo,
    scaleHygiene,
    restoreFreshness,
    marketplaceDashboard,
    predictivePrecision,
    trustCalibration,
    paymentDisputes,
    schedulerCadence,
  ] = await Promise.all([
    safe('readiness', async () => (await import('../server/services/productionReadiness.js')).getProductionReadiness()),
    safe('queueStats', async () => (await import('../server/services/opsQueue.js')).getQueueStats()),
    safe('opsSlo', async () => (await import('../server/services/metricsRollups.js')).computeOpsSlo()),
    safe('scaleHygiene', async () => (await import('../server/services/scaleHygiene.js')).getScaleHygieneOverview()),
    safe('restoreFreshness', async () => (await import('../server/services/backupRestoreDrill.js')).getLatestRestoreDrillFreshness()),
    safe('marketplaceDashboard', async () => (await import('../server/services/marketplaceIntelligenceRollups.js')).getMarketplaceIntelligenceDashboard()),
    safe('predictivePrecision', async () => (await import('../server/services/predictiveSignalRetention.js')).getPredictivePrecisionStats()),
    safe('trustCalibration', async () => (await import('../server/services/trustCalibration.js')).getCalibrationDashboard({})),
    safe('paymentDisputes', async () => (await import('../server/services/paymentDisputeAnalytics.js')).getPaymentDisputeAnalytics()),
    safe('schedulerCadence', async () => (await import('../server/services/schedulerRegistry.js')).getSchedulerCadenceReport()),
  ]);

  const byStatus = queueStats.byStatus || {};
  const marketSummary = marketplaceDashboard.summary || {};
  const scaleActions = scaleHygiene.recommendedActions || [];

  const md = [];

  md.push(`# يوميّة — Weekly Ops/Product Review`);
  md.push(``);
  md.push(`Generated: ${new Date().toISOString()}`);
  md.push(``);

  md.push(`## 1. Executive Summary`);
  md.push(``);
  md.push(`- ${lineStatus(readiness.ok)} Production readiness: **${readiness.status || 'unknown'}**`);
  md.push(`- ${lineStatus((opsSlo.violations || []).length === 0)} Ops SLO violations: **${(opsSlo.violations || []).length}**`);
  md.push(`- ${lineStatus((byStatus['dead-letter'] || 0) === 0)} Queue DLQ: **${byStatus['dead-letter'] || 0}**`);
  md.push(`- ${lineStatus(restoreFreshness.passed && restoreFreshness.fresh)} Restore drill: **${restoreFreshness.status || 'unknown'}**`);
  md.push(`- ${lineStatus(scaleHygiene.status === 'healthy')} Scale hygiene: **${scaleHygiene.status || 'unknown'}**`);
  md.push(`- ${lineStatus((marketSummary.warningCount || 0) === 0)} Marketplace warnings: **${marketSummary.warningCount || 0}**`);
  md.push(``);

  md.push(`## 2. Recommended Actions`);
  md.push(``);
  if (scaleActions.length === 0) {
    md.push(`✅ لا توجد إجراءات عاجلة مقترحة.`);
  } else {
    for (const a of scaleActions.slice(0, 10)) {
      md.push(`- **[${a.severity}] ${a.label}**`);
      if (a.reason) md.push(`  - Reason: ${a.reason}`);
      if (a.command) md.push(`  - Command: \`${a.command}\``);
      if (a.adminRoute) md.push(`  - Admin route: \`${a.adminRoute}\``);
    }
  }
  md.push(``);

  md.push(`## 3. Queue Review`);
  md.push(``);
  md.push(`- pending: ${byStatus.pending || 0}`);
  md.push(`- running: ${byStatus.running || 0}`);
  md.push(`- failed: ${byStatus.failed || 0}`);
  md.push(`- dead-letter: ${byStatus['dead-letter'] || 0}`);
  md.push(``);
  md.push(`Recommended commands:`);
  md.push(``);
  md.push(`\`\`\`bash`);
  md.push(`node scripts/verify-queue.js`);
  md.push(`node scripts/repair-queue.js`);
  md.push(`node scripts/queue-retry-dlq.js --dry-run`);
  md.push(`\`\`\``);
  md.push(``);

  md.push(`## 4. Scheduler Cadence`);
  md.push(``);
  md.push(`- total: ${schedulerCadence.total || 0}`);
  md.push(`- enabled: ${schedulerCadence.enabledCount || 0}`);
  md.push(`- stale: ${schedulerCadence.staleCount || 0}`);
  md.push(`- failed: ${schedulerCadence.failedCount || 0}`);
  md.push(``);

  md.push(`## 5. Marketplace/Product Intelligence`);
  md.push(``);
  md.push(`- searches: ${marketSummary.searches || 0}`);
  md.push(`- zeroResultRate: ${marketSummary.zeroResultRate || 0}%`);
  md.push(`- directOfferAcceptRate: ${marketSummary.directOfferAcceptRate || 0}%`);
  md.push(`- paymentDisputes: ${marketSummary.paymentDisputes || 0}`);
  md.push(``);

  md.push(`## 6. Trust / Predictive Review`);
  md.push(``);
  md.push(`- predictive precision: ${predictivePrecision.precisionRate || 0}%`);
  md.push(`- false positive rate: ${predictivePrecision.falsePositiveRate || 0}%`);
  md.push(`- trust snapshots: ${trustCalibration.metrics?.snapshotCount || 0}`);
  md.push(`- trust drift warnings: ${trustCalibration.metrics?.driftWarningCount || 0}`);
  md.push(``);

  md.push(`## 7. Payment Dispute Review`);
  md.push(``);
  md.push(`- disputes: ${paymentDisputes.totals?.disputes || 0}`);
  md.push(`- disputeRate: ${paymentDisputes.totals?.disputeRate || 0}%`);
  md.push(`- openDisputes: ${paymentDisputes.totals?.openDisputes || 0}`);
  md.push(``);

  md.push(`## 8. Next Week Checklist`);
  md.push(``);
  md.push(`- [ ] Run backup restore drill`);
  md.push(`- [ ] Review DLQ and failed jobs`);
  md.push(`- [ ] Review marketplace zero-result searches`);
  md.push(`- [ ] Review payment dispute trends`);
  md.push(`- [ ] Review predictive false positives`);
  md.push(`- [ ] Run scale hygiene actions if needed`);
  md.push(``);

  const output = md.join('\n');

  if (persist) {
    try {
      const { createReviewRecord } = await import('../server/services/opsReviewRecords.js');
      const record = await createReviewRecord({
        type: 'weekly_ops_review',
        status: 'completed',
        title: 'Weekly Ops/Product Review',
        summary: output.slice(0, 3000),
        findings: [
          `Production readiness: ${readiness.status || 'unknown'}`,
          `Queue DLQ: ${byStatus['dead-letter'] || 0}`,
          `Ops SLO violations: ${(opsSlo.violations || []).length}`,
          `Scale hygiene: ${scaleHygiene.status || 'unknown'}`,
          `Marketplace warnings: ${marketSummary.warningCount || 0}`,
        ],
        actions: scaleActions.slice(0, 20),
        refs: {},
        createdBy: 'weekly_review_script',
        completedBy: 'weekly_review_script',
      });

      if (record && record.ok) {
        console.error(`✅ Persisted weekly ops review: ${record.review.id}`);
      }
    } catch (err) {
      console.error(`⚠️ Failed to persist weekly ops review: ${err.message}`);
    }
  }

  if (outPath) {
    await writeFile(outPath, output, 'utf-8');
    console.log(`✅ Weekly review written to ${outPath}`);
  } else {
    console.log(output);
  }
}

main().catch(err => {
  console.error('\n❌ Weekly review failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
