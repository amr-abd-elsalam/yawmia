#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// scripts/report-duplicate-records.js
// Phase 61.6B — Read-only duplicate physical record inspector
// ═══════════════════════════════════════════════════════════════
// Reports physical-vs-logical records for file-backed collections.
// No mutation.
// No external dependencies.
// ═══════════════════════════════════════════════════════════════

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DATA_DIR = process.env.YAWMIA_DATA_PATH || './data';
const COLLECTION = getArg('--collection') || 'jobs';

const COLLECTIONS = {
  jobs: { dir: 'jobs', prefix: 'job_' },
  applications: { dir: 'applications', prefix: 'app_' },
  notifications: { dir: 'notifications', prefix: 'ntf_' },
  messages: { dir: 'messages', prefix: 'msg_' },
  attendance: { dir: 'attendance', prefix: 'att_' },
  payments: { dir: 'payments', prefix: 'pay_' },
  ratings: { dir: 'ratings', prefix: 'rtg_' },
  availability_ads: { dir: 'availability_ads', prefix: 'aad_' },
  direct_offers: { dir: 'direct_offers', prefix: 'dof_' },
};

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

async function readJSON(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return { __readError: err.message };
  }
}

async function walk(dir, prefix, out = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      await walk(p, prefix, out);
    } else if (
      ent.isFile() &&
      ent.name.startsWith(prefix) &&
      ent.name.endsWith('.json') &&
      !ent.name.endsWith('.tmp')
    ) {
      out.push(p);
    }
  }

  return out;
}

function isShardPath(filePath) {
  return /[\\/]\d{4}-\d{2}[\\/]/.test(filePath);
}

function freshnessMs(record = {}) {
  const fields = [
    record.updatedAt,
    record.completedAt,
    record.cancelledAt,
    record.renewedAt,
    record.startedAt,
    record.expiredAt,
    record.createdAt,
    record.appliedAt,
  ];

  let max = 0;
  for (const iso of fields) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > max) max = ms;
  }

  return max;
}

async function main() {
  const cfg = COLLECTIONS[COLLECTION];
  if (!cfg) {
    console.error(JSON.stringify({
      ok: false,
      error: `Unknown collection: ${COLLECTION}`,
      supported: Object.keys(COLLECTIONS),
    }, null, 2));
    process.exit(1);
  }

  const root = join(DATA_DIR, cfg.dir);
  const files = await walk(root, cfg.prefix);

  const byId = new Map();
  const corrupt = [];
  let physicalCount = 0;

  for (const filePath of files) {
    physicalCount++;
    const data = await readJSON(filePath);

    if (!data || data.__readError || !data.id) {
      corrupt.push({
        path: relative(DATA_DIR, filePath),
        error: data && data.__readError ? data.__readError : 'missing id',
      });
      continue;
    }

    if (!byId.has(data.id)) byId.set(data.id, []);
    const st = await stat(filePath).catch(() => null);

    byId.get(data.id).push({
      path: relative(DATA_DIR, filePath),
      status: data.status || null,
      sourceType: data.sourceType || null,
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      expiresAt: data.expiresAt || null,
      expiryWarningNotified: !!data.expiryWarningNotified,
      shardPath: isShardPath(filePath),
      freshnessMs: freshnessMs(data),
      sizeBytes: st ? st.size : null,
      mtime: st ? st.mtime.toISOString() : null,
    });
  }

  const duplicates = [];
  for (const [id, rows] of byId.entries()) {
    if (rows.length > 1) {
      const sorted = rows.slice().sort((a, b) => b.freshnessMs - a.freshnessMs);
      duplicates.push({
        id,
        physicalCopies: rows.length,
        recommendedCanonicalPath: sorted[0] ? sorted[0].path : null,
        copies: rows,
      });
    }
  }

  duplicates.sort((a, b) => b.physicalCopies - a.physicalCopies || a.id.localeCompare(b.id));

  console.log(JSON.stringify({
    ok: corrupt.length === 0,
    dataDir: DATA_DIR,
    collection: COLLECTION,
    physicalCount,
    logicalUniqueCount: byId.size,
    duplicateIdCount: duplicates.length,
    duplicatePhysicalExtraCount: duplicates.reduce((sum, d) => sum + d.physicalCopies - 1, 0),
    corruptCount: corrupt.length,
    duplicates,
    corrupt,
    generatedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    ok: false,
    error: err && err.message ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
