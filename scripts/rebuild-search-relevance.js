#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/rebuild-search-relevance.js — Phase 56 Search Relevance Rebuild CLI
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/rebuild-search-relevance.js
//
// Rebuilds existing search acceleration indexes used by search relevance:
//   - searchIndex
//   - queryIndex
//
// Note:
//   Phase 56 search relevance is mostly stateless scoring.
//   This script rebuilds candidate indexes only; it does not create an
//   external search DB or new search backend.
// ═══════════════════════════════════════════════════════════════

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

async function main() {
  console.log('\n🔎 يوميّة Search Relevance Rebuild\n');

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const started = Date.now();

  let searchIndexResult = null;
  let queryIndexResult = null;

  try {
    const searchIndex = await import('../server/services/searchIndex.js');
    if (searchIndex.buildIndex) {
      searchIndexResult = await searchIndex.buildIndex();
    }
  } catch (err) {
    console.error('❌ searchIndex rebuild failed:', err.message);
    console.error('');
    console.error('Run this first to detect corrupt or zero-byte JSON files:');
    console.error('  node scripts/verify-data-json.js --strict');
    console.error('');
    console.error('If the scanner reports corruption, fix/restore the source JSON before rebuilding search indexes.');
    process.exit(1);
  }

  try {
    const queryIndex = await import('../server/services/queryIndex.js');
    if (queryIndex.buildAllIndexes) {
      queryIndexResult = await queryIndex.buildAllIndexes();
    }
  } catch (err) {
    console.error('❌ queryIndex rebuild failed:', err.message);
    console.error('');
    console.error('Run this first to detect corrupt or zero-byte JSON files:');
    console.error('  node scripts/verify-data-json.js --strict');
    console.error('');
    console.error('If the scanner reports corruption, fix/restore the source JSON before rebuilding query indexes.');
    process.exit(1);
  }

  const durationMs = Date.now() - started;

  console.log('✅ Search relevance acceleration rebuilt');
  console.log(`   searchIndex: ${searchIndexResult === undefined ? 'ok' : JSON.stringify(searchIndexResult)}`);
  console.log(`   queryIndex: ${queryIndexResult === undefined ? 'ok' : JSON.stringify(queryIndexResult)}`);
  console.log(`   duration: ${durationMs}ms\n`);
}

main().catch(err => {
  console.error('\n❌ Search relevance rebuild failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
