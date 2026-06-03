#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/export-user-data.js — User Data Export CLI (Phase 58/61.4)
// ═══════════════════════════════════════════════════════════════
// Usage:
//   node scripts/export-user-data.js --userId=usr_x --json
//   node scripts/export-user-data.js --userId=usr_x --out=exports/user.json --json
//
// Safety:
//   - Read-only with respect to source user data.
//   - Optional --out writes an export artifact only.
//   - --json emits machine-readable wrapper with mutationPerformed.
// ═══════════════════════════════════════════════════════════════

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch (_) {}

const JSON_OUT = process.argv.includes('--json');

function getArg(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = process.argv.find(a => a.startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function printJson(payload) {
  console.log(JSON.stringify(payload, null, 2));
}

function summarizeExport(e) {
  return {
    jobs: Array.isArray(e.jobs) ? e.jobs.length : 0,
    applications: Array.isArray(e.applications) ? e.applications.length : 0,
    attendance: Array.isArray(e.attendance) ? e.attendance.length : 0,
    payments: Array.isArray(e.payments) ? e.payments.length : 0,
    messages: Array.isArray(e.messages) ? e.messages.length : 0,
    directOffers: Array.isArray(e.directOffers) ? e.directOffers.length : 0,
    notifications: Array.isArray(e.notifications) ? e.notifications.length : 0,
    ratings: Array.isArray(e.ratings) ? e.ratings.length : 0,
    reports: Array.isArray(e.reports) ? e.reports.length : 0,
  };
}

async function main() {
  const started = Date.now();
  const userId = getArg('userId', '');
  const out = getArg('out', '');

  if (!userId) {
    const failure = {
      ok: false,
      mutationPerformed: false,
      sourceDataMutated: false,
      code: 'USER_ID_REQUIRED',
      error: 'Missing --userId=usr_x',
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) printJson(failure);
    else console.error('❌ Missing --userId=usr_x');

    process.exit(1);
  }

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

  const { generateUserDataExport } = await import('../server/services/userDataExport.js');

  const result = await generateUserDataExport(userId, {
    includeMessages: true,
    includeAuditRefs: false,
  });

  if (!result.ok) {
    const failure = {
      ok: false,
      mutationPerformed: false,
      sourceDataMutated: false,
      userId,
      out: out || null,
      code: result.code || 'EXPORT_FAILED',
      error: result.error || 'Export failed',
      durationMs: Date.now() - started,
      generatedAt: new Date().toISOString(),
    };

    if (JSON_OUT) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      printJson(failure);
    } else {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      console.error(`❌ Export failed: ${result.error || result.code}`);
    }

    process.exit(1);
  }

  const exportData = result.export;
  const exportJson = JSON.stringify(exportData, null, 2);
  let outputPath = null;
  let artifactWritten = false;

  if (out) {
    outputPath = resolve(out);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, exportJson, 'utf-8');
    artifactWritten = true;
  }

  const summary = summarizeExport(exportData);

  const payload = {
    ok: true,
    mutationPerformed: artifactWritten,
    sourceDataMutated: false,
    artifactWritten,
    userId,
    out: outputPath,
    summary,
    export: JSON_OUT && !out ? exportData : undefined,
    warnings: [
      'this script is read-only with respect to source user data',
      'optional --out writes an export artifact containing user data; protect the output file',
      'includeAuditRefs is false by default in this CLI',
    ],
    durationMs: Date.now() - started,
    completedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    printJson(payload);
    return;
  }

  console.log(out ? `✅ User data export written: ${out}` : exportJson);
  console.error('\nSummary:');
  console.error(`   userId: ${userId}`);
  console.error(`   jobs: ${summary.jobs}`);
  console.error(`   applications: ${summary.applications}`);
  console.error(`   attendance: ${summary.attendance}`);
  console.error(`   payments: ${summary.payments}`);
  console.error(`   messages: ${summary.messages}`);
  console.error(`   directOffers: ${summary.directOffers}`);
  console.error('');
}

main().catch(err => {
  const failure = {
    ok: false,
    mutationPerformed: false,
    sourceDataMutated: false,
    error: err.message,
    stack: err.stack || null,
    generatedAt: new Date().toISOString(),
  };

  if (JSON_OUT) {
    printJson(failure);
  } else {
    console.error('\n❌ User data export failed:', err.message);
    if (err.stack) console.error(err.stack);
  }

  process.exit(1);
});
