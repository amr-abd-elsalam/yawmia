#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/cleanup-notification-flood.js
// Phase 61.6B — Safe Notification Flood Cleanup
// ═══════════════════════════════════════════════════════════════
// Default: DRY-RUN only.
// With --confirm:
//   - Moves duplicate notifications to data/ops/quarantine/notification-flood/YYYY-MM-DD/
//   - Keeps one notification per group
//   - Updates notifications/user-index.json
//
// No deletion.
// No external dependencies.
// ═══════════════════════════════════════════════════════════════

import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const SCRIPT_NAME = 'scripts/cleanup-notification-flood.js';
const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const JSON_OUTPUT = process.argv.includes('--json');
// Explicit --dry-run wins over --confirm. Default remains dry-run.
const CONFIRM = process.argv.includes('--confirm') && !process.argv.includes('--dry-run');
const DRY_RUN = !CONFIRM;
const TYPE = getArg('--type') || 'job_expiry_warning';
const JOB_ID = getArg('--job-id') || null;
const USER_ID = getArg('--user-id') || null;
const KEEP = getArg('--keep') || 'latest'; // latest | earliest
const LIMIT_GROUPS = Number(getArg('--limit-groups') || 100000);

const NOTIFICATIONS_DIR = join(DATA_DIR, 'notifications');
const USER_INDEX_PATH = join(DATA_DIR, 'notifications', 'user-index.json');
const QUARANTINE_ROOT = join(
  DATA_DIR,
  'ops',
  'quarantine',
  'notification-flood',
  new Date().toISOString().slice(0, 10)
);

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function nowIso() {
  return new Date().toISOString();
}

function humanLog(...args) {
  if (!JSON_OUTPUT) console.log(...args);
}

function emitJson(result) {
  console.log(JSON.stringify(result, null, 2));
}

function confirmCommand() {
  const args = ['--confirm', '--json'];
  if (TYPE && TYPE !== 'job_expiry_warning') args.push('--type', TYPE);
  if (JOB_ID) args.push('--job-id', JOB_ID);
  if (USER_ID) args.push('--user-id', USER_ID);
  if (KEEP && KEEP !== 'latest') args.push('--keep', KEEP);
  if (LIMIT_GROUPS !== 100000) args.push('--limit-groups', String(LIMIT_GROUPS));
  return `node ${SCRIPT_NAME} ${args.join(' ')}`;
}

function buildWarning(code, message, details = {}) {
  return { code, message, ...details };
}

async function readJSON(filePath, fallback = null) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJSONAtomic(filePath, data) {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await rename(tmp, filePath);
}

async function walk(dir, out = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(p, out);
    } else if (
      ent.isFile() &&
      ent.name.startsWith('ntf_') &&
      ent.name.endsWith('.json') &&
      !ent.name.endsWith('.tmp')
    ) {
      out.push(p);
    }
  }

  return out;
}

function notificationGroupKey(n) {
  const jobId = n && n.meta && n.meta.jobId ? n.meta.jobId : 'NO_JOB';
  return [
    n.userId || 'NO_USER',
    n.type || 'NO_TYPE',
    jobId,
    n.message || 'NO_MESSAGE',
  ].join('\t');
}

function shouldInclude(n) {
  if (!n || !n.id || !n.id.startsWith('ntf_')) return false;
  if (TYPE && n.type !== TYPE) return false;
  if (JOB_ID) {
    const jobId = n.meta && n.meta.jobId ? n.meta.jobId : null;
    if (jobId !== JOB_ID) return false;
  }
  if (USER_ID && n.userId !== USER_ID) return false;
  return true;
}

function chooseKeep(rows) {
  const sorted = rows.slice().sort((a, b) => {
    const at = new Date(a.notification.createdAt || 0).getTime();
    const bt = new Date(b.notification.createdAt || 0).getTime();
    return at - bt;
  });

  if (KEEP === 'earliest') return sorted[0];
  return sorted[sorted.length - 1];
}

function safeQuarantineName(row, index) {
  const created = String(row.notification.createdAt || 'no-date')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 40);

  return `${row.notification.id}.${created}.${index}.json`;
}

async function moveToQuarantine(row, index) {
  const rel = relative(DATA_DIR, row.filePath).replace(/[\\/]/g, '__');
  const targetDir = join(QUARANTINE_ROOT, row.notification.userId || 'NO_USER');
  await mkdir(targetDir, { recursive: true });

  let target = join(targetDir, safeQuarantineName(row, index));
  if (existsSync(target)) {
    target = join(targetDir, `${row.notification.id}.${Date.now()}.${Math.random().toString(36).slice(2)}.json`);
  }

  const sidecar = {
    kind: 'notification_flood_quarantine_record',
    originalPath: row.filePath,
    originalRelativePath: rel,
    notificationId: row.notification.id,
    userId: row.notification.userId || null,
    type: row.notification.type || null,
    jobId: row.notification.meta && row.notification.meta.jobId ? row.notification.meta.jobId : null,
    message: row.notification.message || null,
    createdAt: row.notification.createdAt || null,
    quarantinedAt: new Date().toISOString(),
  };

  await rename(row.filePath, target);
  await writeJSONAtomic(`${target}.meta.json`, sidecar);

  return target;
}

function removeIdsFromUserIndex(index, removedByUser) {
  const next = index && typeof index === 'object' ? { ...index } : {};

  for (const [userId, ids] of removedByUser.entries()) {
    const current = Array.isArray(next[userId]) ? next[userId] : [];
    const removeSet = new Set(ids);
    next[userId] = current.filter(id => !removeSet.has(id));
    if (next[userId].length === 0) delete next[userId];
  }

  return next;
}

async function main() {
  humanLog('🧹 Yawmia Notification Flood Cleanup');
  humanLog(`   Data: ${DATA_DIR}`);
  humanLog(`   Mode: ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  humanLog(`   Type: ${TYPE || 'all'}`);
  humanLog(`   Job ID: ${JOB_ID || 'all'}`);
  humanLog(`   User ID: ${USER_ID || 'all'}`);
  humanLog(`   Keep: ${KEEP}`);
  humanLog('');

  const warnings = [];

  if (process.argv.includes('--dry-run') && process.argv.includes('--confirm')) {
    warnings.push(buildWarning(
      'DRY_RUN_OVERRIDES_CONFIRM',
      'Both --dry-run and --confirm were provided; dry-run mode wins and no mutation will be performed.'
    ));
  }

  const files = await walk(NOTIFICATIONS_DIR);
  const groups = new Map();

  let scanned = 0;
  let matched = 0;
  let parseErrors = 0;

  for (const filePath of files) {
    scanned++;
    const notification = await readJSON(filePath);
    if (!notification) {
      parseErrors++;
      continue;
    }

    if (!shouldInclude(notification)) continue;

    matched++;
    const key = notificationGroupKey(notification);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ filePath, notification });
  }

  if (parseErrors > 0) {
    warnings.push(buildWarning(
      'PARSE_ERRORS_SKIPPED',
      'Some notification JSON files could not be parsed and were skipped.',
      { parseErrors }
    ));
  }

  const allDuplicateGroups = Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1);

  const duplicateGroups = allDuplicateGroups.slice(0, LIMIT_GROUPS);

  if (allDuplicateGroups.length > duplicateGroups.length) {
    warnings.push(buildWarning(
      'LIMIT_GROUPS_APPLIED',
      'Duplicate groups were truncated by --limit-groups.',
      {
        totalDuplicateGroups: allDuplicateGroups.length,
        limitGroups: LIMIT_GROUPS,
      }
    ));
  }

  const plan = [];
  let duplicateFiles = 0;

  for (const [key, rows] of duplicateGroups) {
    const keep = chooseKeep(rows);
    const toQuarantine = rows.filter(r => r !== keep);
    duplicateFiles += toQuarantine.length;

    const [userId, type, jobId, message] = key.split('\t');
    plan.push({
      userId,
      type,
      jobId,
      message,
      total: rows.length,
      keepNotificationId: keep.notification.id,
      keepCreatedAt: keep.notification.createdAt || null,
      quarantineCount: toQuarantine.length,
      firstCreatedAt: rows.map(r => r.notification.createdAt).filter(Boolean).sort()[0] || null,
      lastCreatedAt: rows.map(r => r.notification.createdAt).filter(Boolean).sort().slice(-1)[0] || null,
      toQuarantine,
    });
  }

  const plannedActions = [];
  for (const item of plan) {
    for (const row of item.toQuarantine) {
      plannedActions.push({
        action: 'quarantine_duplicate_notification',
        notificationId: row.notification.id,
        userId: row.notification.userId || null,
        type: row.notification.type || null,
        jobId: row.notification.meta && row.notification.meta.jobId ? row.notification.meta.jobId : null,
        from: row.filePath,
        quarantineRoot: QUARANTINE_ROOT,
        keptNotificationId: item.keepNotificationId,
      });
    }
  }

  const preview = plan.map(p => ({
    userId: p.userId,
    type: p.type,
    jobId: p.jobId,
    total: p.total,
    keepNotificationId: p.keepNotificationId,
    keepCreatedAt: p.keepCreatedAt,
    quarantineCount: p.quarantineCount,
    firstCreatedAt: p.firstCreatedAt,
    lastCreatedAt: p.lastCreatedAt,
    message: p.message,
  })).slice(0, 30);

  const baseResult = {
    ok: true,
    script: SCRIPT_NAME,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    derivedArtifactsMutated: false,
    quarantineOnly: true,
    dataDir: DATA_DIR,
    type: TYPE || null,
    jobId: JOB_ID,
    userId: USER_ID,
    keep: KEEP,
    scannedNotificationFiles: scanned,
    matchedNotificationFiles: matched,
    parseErrors,
    duplicateGroupsDetected: duplicateGroups.length,
    duplicatesDetected: duplicateFiles,
    duplicateFilesToQuarantine: duplicateFiles,
    plannedActions,
    quarantinedFiles: [],
    updatedIndexes: [],
    warnings,
    preview,
    confirmCommand: confirmCommand(),
    generatedAt: nowIso(),
  };

  if (JSON_OUTPUT && DRY_RUN) {
    emitJson(baseResult);
    return;
  }

  if (!JSON_OUTPUT) {
    console.log(JSON.stringify({
      ok: baseResult.ok,
      dryRun: baseResult.dryRun,
      scannedNotificationFiles: baseResult.scannedNotificationFiles,
      matchedNotificationFiles: baseResult.matchedNotificationFiles,
      parseErrors: baseResult.parseErrors,
      duplicateGroups: baseResult.duplicateGroupsDetected,
      duplicateFilesToQuarantine: baseResult.duplicateFilesToQuarantine,
      preview: baseResult.preview,
    }, null, 2));
  }

  if (DRY_RUN) {
    humanLog('');
    humanLog('DRY RUN ONLY. No files changed.');
    humanLog('Run with --confirm after backup if the plan is correct.');
    humanLog(`Confirm command: ${baseResult.confirmCommand}`);
    return;
  }

  if (duplicateFiles === 0) {
    const result = {
      ...baseResult,
      dryRun: false,
      confirm: true,
      generatedAt: nowIso(),
    };

    if (JSON_OUTPUT) {
      emitJson(result);
    } else {
      humanLog('');
      humanLog('Nothing to quarantine.');
    }
    return;
  }

  const removedByUser = new Map();
  const moved = [];

  let moveIndex = 0;
  for (const item of plan) {
    for (const row of item.toQuarantine) {
      moveIndex++;
      const target = await moveToQuarantine(row, moveIndex);
      moved.push({
        notificationId: row.notification.id,
        userId: row.notification.userId || null,
        from: row.filePath,
        to: target,
      });

      const userId = row.notification.userId || 'NO_USER';
      if (!removedByUser.has(userId)) removedByUser.set(userId, []);
      removedByUser.get(userId).push(row.notification.id);
    }
  }

  const index = await readJSON(USER_INDEX_PATH, {});
  const nextIndex = removeIdsFromUserIndex(index, removedByUser);
  await writeJSONAtomic(USER_INDEX_PATH, nextIndex);

  const reportPath = join(
    QUARANTINE_ROOT,
    `notification-flood-cleanup-report-${Date.now()}.json`
  );

  const result = {
    ...baseResult,
    dryRun: false,
    confirm: true,
    mutationPerformed: moved.length > 0,
    sourceDataMutated: moved.length > 0,
    derivedArtifactsMutated: moved.length > 0,
    quarantinedFiles: moved.map(m => m.to),
    updatedIndexes: moved.length > 0 ? ['notifications/user-index.json'] : [],
    movedCount: moved.length,
    moved,
    reportPath,
    quarantineRoot: QUARANTINE_ROOT,
    generatedAt: nowIso(),
  };

  await writeJSONAtomic(reportPath, {
    kind: 'notification_flood_cleanup_report',
    ...result,
  });

  if (JSON_OUTPUT) {
    emitJson(result);
    return;
  }

  humanLog('');
  humanLog(`DONE: quarantined ${moved.length} duplicate notification file(s).`);
  humanLog(`Report: ${reportPath}`);
  humanLog(`Quarantine: ${QUARANTINE_ROOT}`);
}

main().catch(err => {
  const payload = {
    ok: false,
    script: SCRIPT_NAME,
    dryRun: DRY_RUN,
    confirm: CONFIRM,
    mutationPerformed: false,
    sourceDataMutated: false,
    derivedArtifactsMutated: false,
    quarantineOnly: true,
    dataDir: DATA_DIR,
    error: err && err.message ? err.message : String(err),
    warnings: [],
    confirmCommand: confirmCommand(),
    generatedAt: nowIso(),
  };

  if (JSON_OUTPUT) {
    console.error(JSON.stringify(payload, null, 2));
  } else {
    console.error('cleanup-notification-flood failed:', payload.error);
    console.error(JSON.stringify(payload, null, 2));
  }

  process.exit(1);
});
