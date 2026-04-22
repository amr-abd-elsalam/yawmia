#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/migrate.js — يوميّة: Schema Migration CLI
// ═══════════════════════════════════════════════════════════════
// Usage: node scripts/migrate.js [--dry-run]
// Shows current schema version, lists pending migrations, runs them.
// ═══════════════════════════════════════════════════════════════

// Load env
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {
  // dotenv not installed — use process.env directly
}

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n🔄 يوميّة Schema Migration${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  // Initialize database directories first
  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { getCurrentVersion, runMigrations } = await import('../server/services/migration.js');

  const currentVersion = await getCurrentVersion();
  console.log(`   Current schema version: v${currentVersion}`);

  if (DRY_RUN) {
    console.log('   Dry run mode — no changes will be made.\n');
    // Just show current version
    console.log('✅ Dry run complete.\n');
    return;
  }

  try {
    const result = await runMigrations();
    if (result.applied > 0) {
      console.log(`\n✅ Applied ${result.applied} migration(s). Schema now at v${result.current}.\n`);
    } else {
      console.log(`\n✅ No pending migrations. Schema is up to date at v${result.current}.\n`);
    }
  } catch (err) {
    console.error(`\n❌ Migration failed: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
