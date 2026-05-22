#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/export-user-data.js — User Data Export CLI (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/export-user-data.js --userId=usr_x
//   node scripts/export-user-data.js --userId=usr_x --out=exports/user.json
// ═══════════════════════════════════════════════════════════════

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

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
  const out = getArg('out', '');

  if (!userId) {
    console.error('❌ Missing --userId=usr_x');
    process.exit(1);
  }

  const { initDatabase } = await import('../server/services/database.js');
  await initDatabase();

  const { generateUserDataExport } = await import('../server/services/userDataExport.js');

  const result = await generateUserDataExport(userId, {
    includeMessages: true,
    includeAuditRefs: false,
  });

  if (!result.ok) {
    console.error(`❌ Export failed: ${result.error || result.code}`);
    process.exit(1);
  }

  const json = JSON.stringify(result.export, null, 2);

  if (out) {
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, json, 'utf-8');
    console.log(`✅ User data export written: ${out}`);
  } else {
    console.log(json);
  }

  const e = result.export;
  console.error('\nSummary:');
  console.error(`   userId: ${userId}`);
  console.error(`   jobs: ${e.jobs.length}`);
  console.error(`   applications: ${e.applications.length}`);
  console.error(`   attendance: ${e.attendance.length}`);
  console.error(`   payments: ${e.payments.length}`);
  console.error(`   messages: ${e.messages.length}`);
  console.error(`   directOffers: ${e.directOffers.length}`);
  console.error('');
}

main().catch(err => {
  console.error('\n❌ User data export failed:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
