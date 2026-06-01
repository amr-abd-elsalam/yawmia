#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/verify-queue.js — Queue Health Verify CLI (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/verify-queue.js
// Exits 1 on errors.
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

  if (!JSON_OUT) console.log('\n🧪 يوميّة Queue Health Verify\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const {
    verifyQueueHealth,
    getQueueOperationalRecommendations,
  } = await import('../server/services/queueHealthVerify.js');

  const result = await verifyQueueHealth({ fullScan: true, mutateIndexes: false });
  result.recommendedActions = await getQueueOperationalRecommendations({ health: result });

  const hasErrors = (result.errors || []).length > 0;
  const hasWarnings = (result.warnings || []).length > 0;

  result.strict = STRICT;
  result.ok = !hasErrors && (!STRICT || !hasWarnings);

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Status: ${result.status}`);
    console.log(`Strict: ${STRICT ? 'yes' : 'no'}`);
    console.log(`Parsed records: ${result.details?.parsedRecords || 0}`);
    console.log(`Warnings: ${(result.warnings || []).length}`);
    console.log(`Errors: ${(result.errors || []).length}`);
    console.log(`Duration: ${result.durationMs || 0}ms\n`);

    if (result.warnings && result.warnings.length > 0) {
      console.log('Warnings:');
      for (const w of result.warnings.slice(0, 20)) {
        console.log(`  ⚠️ ${w}`);
      }
      console.log('');
    }

    if (result.errors && result.errors.length > 0) {
      console.log('Errors:');
      for (const e of result.errors.slice(0, 20)) {
        console.log(`  ❌ ${e}`);
      }
      console.log('');
    }

    if (result.details && result.details.summaryMismatches && result.details.summaryMismatches.length > 0) {
      console.log('Summary mismatches:');
      for (const m of result.details.summaryMismatches) {
        const mode = m.scanMode || 'scan';
        console.log(`  ⚠️ ${m.status}: summary=${m.summaryCount} scan=${m.scanCount} (${mode})`);
      }
      console.log('');
    }

    if (result.details && result.details.statusSpecificScanCounts) {
      const c = result.details.statusSpecificScanCounts;
      console.log('Status-specific logical scan counts:');
      console.log(`  pending=${c.pending || 0}, running=${c.running || 0}, completed=${c.completed || 0}, failed=${c.failed || 0}, cancelled=${c.cancelled || 0}, dead-letter=${c['dead-letter'] || 0}`);
      console.log('');
    }

    if (result.details && result.details.actualFileMismatches && result.details.actualFileMismatches.length > 0) {
      console.log('Actual file mismatches:');
      for (const m of result.details.actualFileMismatches) {
        console.log(`  ⚠️ ${m.status}: summary=${m.summaryCount} actualFiles=${m.actualFileCount} delta=${m.delta}`);
      }
      console.log('');
    }

    if (result.details && result.details.actualFilesByStatus) {
      console.log('Actual segmented files:');
      const actual = result.details.actualFilesByStatus.byStatus || {};
      console.log(`  pending=${actual.pending || 0}, running=${actual.running || 0}, completed=${actual.completed || 0}, failed=${actual.failed || 0}, cancelled=${actual.cancelled || 0}, dead-letter=${actual['dead-letter'] || 0}`);
      if (result.details.actualFilesByStatus.legacyActive || result.details.actualFilesByStatus.legacyDeadLetter) {
        console.log(`  legacyActive=${result.details.actualFilesByStatus.legacyActive || 0}, legacyDeadLetter=${result.details.actualFilesByStatus.legacyDeadLetter || 0}`);
      }
      console.log('');
    }

    if (result.details && result.details.duplicateQueueRecordCount > 0) {
      console.log('Duplicate physical queue records:');
      console.log(`  duplicate job IDs: ${result.details.duplicateQueueRecordCount}`);
      for (const d of (result.details.duplicateQueueRecords || []).slice(0, 10)) {
        console.log(`  ⚠️ ${d.jobId}: ${d.copyCount} copies [${(d.statuses || []).join(', ')}]`);
      }
      console.log('');
    }

    if (result.recommendedActions && result.recommendedActions.length > 0) {
      console.log('Recommended actions:');
      for (const a of result.recommendedActions.slice(0, 10)) {
        console.log(`  → ${a.label}`);
        if (a.command) console.log(`    ${a.command}`);
        if (a.reason) console.log(`    ${a.reason}`);
      }
      console.log('');
    }

    console.log(result.ok ? '✅ Queue verify complete\n' : '❌ Queue verify found issues\n');
  }

  if (!result.ok) {
    process.exit(1);
  }
}

main().catch(err => {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({
      ok: false,
      status: 'failed',
      error: err.message,
      generatedAt: new Date().toISOString(),
    }, null, 2));
  } else {
    console.error('\n❌ Queue verify failed:', err.message);
    if (err.stack) console.error(err.stack);
  }
  process.exit(1);
});
