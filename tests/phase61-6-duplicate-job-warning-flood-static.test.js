import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

async function read(relPath) {
  return await readFile(join(ROOT, relPath), 'utf-8');
}

function sliceBetween(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing start marker: ${startNeedle}`);

  const end = endNeedle ? source.indexOf(endNeedle, start + startNeedle.length) : -1;
  if (endNeedle && end !== -1) return source.slice(start, end);
  return source.slice(start);
}

test('Phase 61.6: jobs expiry warning sweep is logical-id deduped and writes to scanned canonical path', async () => {
  const src = await read('server/services/jobs.js');

  assert.match(src, /async function readUniqueJobEntries\(\)/);
  assert.match(src, /function pickCanonicalJobEntry/);
  assert.match(src, /async function tryCreateExpiryWarningMarker\(job\)/);
  assert.match(src, /flag:\s*['"]wx['"]/);

  const fn = sliceBetween(
    src,
    'export async function checkExpiryWarnings()',
    null
  );

  assert.match(fn, /readUniqueJobEntries\(\)/);
  assert.match(fn, /tryCreateExpiryWarningMarker\(job\)/);
  assert.match(fn, /await atomicWrite\(entry\.filePath,\s*job\)/);
  assert.doesNotMatch(fn, /atomicWrite\(getRecordPath\(['"]jobs['"],\s*job\.id\)/);
  assert.doesNotMatch(fn, /const jobPath = getRecordPath\(['"]jobs['"],\s*job\.id\)/);
});

test('Phase 61.6: enforceExpiredJobs processes unique logical jobs and writes to canonical scanned path once', async () => {
  const src = await read('server/services/jobs.js');

  const fn = sliceBetween(
    src,
    'export async function enforceExpiredJobs()',
    'export async function startJob'
  );

  assert.match(fn, /readUniqueJobEntries\(\)/);
  assert.match(fn, /const expiredJobIds = new Set\(\)/);
  assert.match(fn, /await atomicWrite\(entry\.filePath,\s*job\)/);
  assert.match(fn, /for \(const jobId of expiredJobIds\)/);
  assert.doesNotMatch(fn, /const jobPath = getRecordPath\(['"]jobs['"],\s*job\.id\)/);
});

test('Phase 61.6: listAll returns logical unique jobs instead of physical duplicate files', async () => {
  const src = await read('server/services/jobs.js');

  const fn = sliceBetween(
    src,
    'export async function listAll()',
    'export async function countByStatus()'
  );

  assert.match(fn, /dedupeJobsById/);
});

test('Phase 61.6: safeReadJSON is shard-aware on ENOENT', async () => {
  const src = await read('server/services/database.js');

  const fn = sliceBetween(
    src,
    'export async function safeReadJSON(filePath)',
    '/**\n * Delete a JSON file'
  );

  assert.match(fn, /_shardFallbackRead\(filePath\)/);
});

test('Phase 61.6: notification listeners are guarded against duplicate same-process registration', async () => {
  const src = await read('server/services/notifications.js');

  assert.match(src, /NOTIFICATION_LISTENER_FLAG/);
  assert.match(src, /globalThis\[NOTIFICATION_LISTENER_FLAG\]/);
});

test('Phase 61.6: repair-indexes is dry-run by default and requires --confirm to write', async () => {
  const src = await read('scripts/repair-indexes.js');

  assert.match(src, /const CONFIRM = process\.argv\.includes\(['"]--confirm['"]\)/);
  assert.match(src, /const DRY_RUN = !CONFIRM \|\| process\.argv\.includes\(['"]--dry-run['"]\)/);
  assert.match(src, /dedupeById\(await listRecords\(join\(DATA_DIR,\s*['"]jobs['"]\),\s*['"]job_['"]\),\s*['"]jobs['"]\)/);
});

test('Phase 61.6B: cleanup-notification-flood is dry-run by default and quarantines instead of deleting', async () => {
  const src = await read('scripts/cleanup-notification-flood.js');

  assert.match(src, /const CONFIRM = process\.argv\.includes\(['"]--confirm['"]\)/);
  assert.match(src, /dryRun:\s*!CONFIRM/);
  assert.match(src, /DRY RUN ONLY\. No files changed\./);
  assert.match(src, /moveToQuarantine/);
  assert.match(src, /await rename\(row\.filePath,\s*target\)/);
  assert.match(src, /removeIdsFromUserIndex/);

  assert.doesNotMatch(src, /\bunlink\s*\(/);
  assert.doesNotMatch(src, /\brm\s*\(/);
});

test('Phase 61.6B: report-duplicate-records is read-only', async () => {
  const src = await read('scripts/report-duplicate-records.js');

  assert.match(src, /duplicateIdCount/);
  assert.match(src, /physicalCount/);
  assert.match(src, /logicalUniqueCount/);

  assert.doesNotMatch(src, /\bwriteFile\b/);
  assert.doesNotMatch(src, /\brename\b/);
  assert.doesNotMatch(src, /\bunlink\b/);
  assert.doesNotMatch(src, /\brm\s*\(/);
});
