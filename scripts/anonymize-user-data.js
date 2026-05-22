#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/anonymize-user-data.js — User Data Anonymization CLI (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/anonymize-user-data.js --userId=usr_x --dry-run
//   node scripts/anonymize-user-data.js --userId=usr_x --confirm
//
// Default is dry-run. Destructive mutation requires --confirm.
// ═══════════════════════════════════════════════════════════════

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

async function main() {
  const userId = getArg('userId', '');
  const confirm = process.argv.includes('--confirm');
  const dryRun = process.argv.includes('--dry-run') || !confirm;

  if (!userId) {
    console.error('❌ Missing --userId=usr_x');
    process.exit(1);
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const {
    previewUserAnonymization,
    anonymizeUserData,
  } = await import('../server/services/userAnonymization.js');

  console.log(`\n🕶️ يوميّة User Anonymization ${dryRun ? '(DRY RUN)' : '(CONFIRM)'}\n`);
  console.log(`User: ${userId}\n`);

  if (dryRun) {
    const preview = await previewUserAnonymization(userId);

    if (!preview.ok) {
      console.error(`❌ Preview failed: ${preview.error || preview.code}`);
      process.exit(1);
    }

    console.log('Preview:');
    console.log(JSON.stringify(preview, null, 2));
    console.log('\nNo data was changed.');
    console.log('\nTo apply destructive anonymization:');
    console.log(`  node scripts/anonymize-user-data.js --userId=${userId} --confirm\n`);
    return;
  }

  console.log('⚠️  This will mutate user data.');
  console.log('Recommended before running:');
  console.log('  node scripts/backup.js\n');

  const result = await anonymizeUserData(userId, {
    dryRun: false,
    preview: false,
  });

  if (!result.ok) {
    console.error(`❌ Anonymization failed: ${result.error || result.code}`);
    if (result.partialResult) {
      console.error(JSON.stringify(result.partialResult, null, 2));
    }
    process.exit(1);
  }

  console.log('✅ Anonymization complete');
  console.log(`   userId: ${userId}`);
  console.log(`   anonId: ${result.anonId}`);
  console.log(`   idempotent: ${result.idempotent ? 'yes' : 'no'}`);
  console.log(`   durationMs: ${result.durationMs || 0}`);
  console.log('\nResult:');
  console.log(JSON.stringify(result.result || {}, null, 2));
  console.log('');
}

main().catch(err => {
  console.error('\n❌ User anonymization failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
