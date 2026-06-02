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

const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const CONFIRM = process.argv.includes('--confirm');
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
  console.log('🧹 Yawmia Notification Flood Cleanup');
  console.log(`   Data: ${DATA_DIR}`);
  console.log(`   Mode: ${CONFIRM ? 'CONFIRM' : 'DRY-RUN'}`);
  console.log(`   Type: ${TYPE || 'all'}`);
  console.log(`   Job ID: ${JOB_ID || 'all'}`);
  console.log(`   User ID: ${USER_ID || 'all'}`);
  console.log(`   Keep: ${KEEP}`);
  console.log('');

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

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .slice(0, LIMIT_GROUPS);

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

  console.log(JSON.stringify({
    ok: true,
    dryRun: !CONFIRM,
    scannedNotificationFiles: scanned,
    matchedNotificationFiles: matched,
    parseErrors,
    duplicateGroups: duplicateGroups.length,
    duplicateFilesToQuarantine: duplicateFiles,
    preview: plan.map(p => ({
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
    })).slice(0, 30),
  }, null, 2));

  if (!CONFIRM) {
    console.log('');
    console.log('DRY RUN ONLY. No files changed.');
    console.log('Run with --confirm after backup if the plan is correct.');
    return;
  }

  if (duplicateFiles === 0) {
    console.log('');
    console.log('Nothing to quarantine.');
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

  await writeJSONAtomic(reportPath, {
    kind: 'notification_flood_cleanup_report',
    type: TYPE,
    jobId: JOB_ID,
    userId: USER_ID,
    keep: KEEP,
    movedCount: moved.length,
    moved,
    generatedAt: new Date().toISOString(),
  });

  console.log('');
  console.log(`DONE: quarantined ${moved.length} duplicate notification file(s).`);
  console.log(`Report: ${reportPath}`);
  console.log(`Quarantine: ${QUARANTINE_ROOT}`);
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err && err.message ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
