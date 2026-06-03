#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-search-relevance.js — Phase 56 Search Relevance Rebuild CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-search-relevance.js --dry-run --json
//   node scripts/rebuild-search-relevance.js --confirm --json
//
// Rebuilds existing in-memory search acceleration indexes used by search relevance:
//   - searchIndex
//   - queryIndex
//
// Important:
//   searchIndex and queryIndex are process-local in-memory indexes.
//   Running this CLI rebuilds indexes inside this CLI process only.
//   It does not update an already-running server process.
//   The running server rebuilds these indexes at startup/periodic timers.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const CONFIRM = process.argv.includes('--confirm');
const DRY_RUN = process.argv.includes('--dry-run') || !CONFIRM;
const JSON_OUT = process.argv.includes('--json');

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function buildConfirmCommand() {
  return 'node scripts/rebuild-search-relevance.js --confirm --json';
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

  const searchIndex = await import('../server/services/searchIndex.js');
  const queryIndex = await import('../server/services/queryIndex.js');

  const beforeStats = {
    searchIndex: searchIndex.getStats ? searchIndex.getStats() : null,
    queryIndex: queryIndex.getStats ? queryIndex.getStats() : null,
  };

  if (DRY_RUN) {
    const output = {
      ok: true,
      dryRun: true,
      confirm: CONFIRM,
      mutationPerformed: false,
      sourceDataMutated: false,
      persistentArtifactMutated: false,
      processLocalMutationPerformed: false,
      beforeStats,
      plannedAction: 'rebuild process-local searchIndex and queryIndex in this CLI process',
      confirmCommand: buildConfirmCommand(),
      warnings: [
        'dry-run does not rebuild indexes',
        'confirmed mode rebuilds process-local in-memory indexes only',
        'this CLI does not update search indexes inside an already-running server process',
        'running server search indexes are rebuilt at startup and by periodic server timers',
        'run verify-data-json before confirmed rebuild if corruption is suspected',
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
      console.log('\n🔎 يوميّة Search Relevance Rebuild — DRY RUN\n');
      console.log('   mutationPerformed: false');
      console.log('   persistentArtifactMutated: false');
      console.log('   note: confirmed mode rebuilds process-local in-memory indexes only');
      console.log('\nTo run process-local rebuild:');
      console.log(`   ${output.confirmCommand}\n`);
    }

    return;
  }

  if (!JSON_OUT) {
    console.log('\n🔎 يوميّة Search Relevance Rebuild — CONFIRMED\n');
    console.log('   ⚠️ This rebuilds in-memory indexes in this CLI process only.');
    console.log('   ⚠️ It does not update an already-running server process.\n');
  }

  let searchIndexResult = null;
  let queryIndexResult = null;

  try {
    if (searchIndex.buildIndex) {
      searchIndexResult = await searchIndex.buildIndex();
    }
  } catch (err) {
    const output = {
      ok: false,
      dryRun: false,
      confirm: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      persistentArtifactMutated: false,
      processLocalMutationPerformed: false,
      failedStep: 'searchIndex.buildIndex',
      error: err.message,
      recommendedCommand: 'node scripts/verify-data-json.js --strict --json',
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.error('❌ searchIndex rebuild failed:', err.message);
      console.error('');
      console.error('Run this first to detect corrupt or zero-byte JSON files:');
      console.error('  node scripts/verify-data-json.js --strict --json');
      console.error('');
      console.error('If the scanner reports corruption, fix/restore the source JSON before rebuilding search indexes.');
    }

    process.exit(1);
  }

  try {
    if (queryIndex.buildAllIndexes) {
      queryIndexResult = await queryIndex.buildAllIndexes();
    }
  } catch (err) {
    const output = {
      ok: false,
      dryRun: false,
      confirm: true,
      mutationPerformed: false,
      sourceDataMutated: false,
      persistentArtifactMutated: false,
      processLocalMutationPerformed: !!searchIndexResult,
      failedStep: 'queryIndex.buildAllIndexes',
      error: err.message,
      recommendedCommand: 'node scripts/verify-data-json.js --strict --json',
      durationMs: Date.now() - started,
      completedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(output);
    } else {
      console.error('❌ queryIndex rebuild failed:', err.message);
      console.error('');
      console.error('Run this first to detect corrupt or zero-byte JSON files:');
      console.error('  node scripts/verify-data-json.js --strict --json');
      console.error('');
      console.error('If the scanner reports corruption, fix/restore the source JSON before rebuilding query indexes.');
    }

    process.exit(1);
  }

  const afterStats = {
    searchIndex: searchIndex.getStats ? searchIndex.getStats() : null,
    queryIndex: queryIndex.getStats ? queryIndex.getStats() : null,
  };

  const output = {
    ok: true,
    dryRun: false,
    confirm: true,
    mutationPerformed: false,
    sourceDataMutated: false,
    persistentArtifactMutated: false,
    processLocalMutationPerformed: true,
    beforeStats,
    afterStats,
    searchIndexResult,
    queryIndexResult,
    warnings: [
      'confirmed mode rebuilt process-local in-memory indexes only',
      'this CLI does not update an already-running server process',
    ],
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(output);
    return;
  }

  console.log('✅ Search relevance acceleration rebuilt in this CLI process');
  console.log(`   searchIndex: ${searchIndexResult === undefined ? 'ok' : JSON.stringify(searchIndexResult)}`);
  console.log(`   queryIndex: ${queryIndexResult === undefined ? 'ok' : JSON.stringify(queryIndexResult)}`);
  console.log(`   duration: ${output.durationMs}ms`);
  console.log('   note: running server process was not updated by this CLI\n');
}

main().catch(err => {
  const payload = {
    ok: false,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    persistentArtifactMutated: false,
    processLocalMutationPerformed: false,
    error: err.message,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(payload);
  } else {
    console.error('\n❌ Search relevance rebuild failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
