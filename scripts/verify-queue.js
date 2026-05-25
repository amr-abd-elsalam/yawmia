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

  const result = await verifyQueueHealth({ fullScan: true });
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
        console.log(`  ⚠️ ${m.status}: summary=${m.summaryCount} scan=${m.scanCount}`);
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
