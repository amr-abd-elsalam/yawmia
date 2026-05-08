// ═══════════════════════════════════════════════════════════════
// server/services/auditLogIndex.js — Filesystem Audit Log Index (Phase 50)
// ═══════════════════════════════════════════════════════════════
// Indexes audit log records by:
//   - action
//   - adminId
//   - targetType
//   - date YYYY-MM-DD
//   - q tokens (bounded)
// Search is acceleration only:
//   - final records are always re-read and re-filtered
//   - corrupt/missing/stale index returns fallbackRequired
//   - full-scan fallback lives in auditLogSearch.js
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getCollectionPath,
  getRecordPath,
  listJSON,
} from './database.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const INDEX_VERSION = 1;
const MAX_SAFE_SEGMENT_LENGTH = 96;

function isEnabled() {
  return !!(config.AUDIT_INDEX && config.AUDIT_INDEX.enabled);
}

function indexRoot() {
  return getCollectionPath('audit_indexes');
}

function metaPath() {
  return join(indexRoot(), 'meta.json');
}

function safeSegment(value) {
  const raw = String(value || 'unknown').trim().toLowerCase();
  if (!raw) return 'unknown';

  const normalized = raw
    .replace(/[\\/]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^\p{L}\p{N}_\-:.@]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safe = normalized || 'unknown';
  if (safe.length <= MAX_SAFE_SEGMENT_LENGTH) return safe;

  const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 12);
  return safe.slice(0, MAX_SAFE_SEGMENT_LENGTH - 13) + '_' + hash;
}

function hashPrefix(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 2);
}

function indexFile(kind, key) {
  const safe = safeSegment(key);
  if (kind === 'token') {
    return join(indexRoot(), 'by-token', hashPrefix(safe), `${safe}.json`);
  }
  return join(indexRoot(), `by-${kind}`, `${safe}.json`);
}

function dateKeyFromIso(iso) {
  if (!iso || typeof iso !== 'string') return '';
  return iso.slice(0, 10);
}

function buildHaystack(record) {
  const details = record.details ? JSON.stringify(record.details).slice(0, 2000) : '';
  return [
    record.action || '',
    record.targetId || '',
    record.targetType || '',
    record.adminId || '',
    record.ip || '',
    details,
  ].join(' ').toLowerCase();
}

function tokenizeRecord(record) {
  if (!config.AUDIT_INDEX?.tokenIndexEnabled) return [];

  const min = config.AUDIT_INDEX.tokenMinLength || 2;
  const maxTokens = config.AUDIT_INDEX.tokenMaxPerRecord || 50;
  const text = buildHaystack(record);
  const tokens = text
    .split(/[^\p{L}\p{N}_@.\-]+/gu)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= min && t.length <= 80)
    .map(safeSegment);

  return Array.from(new Set(tokens)).slice(0, maxTokens);
}

function tokenizeQuery(q) {
  if (!q || typeof q !== 'string') return [];
  const min = config.AUDIT_INDEX?.tokenMinLength || 2;
  return Array.from(new Set(
    q.toLowerCase()
      .split(/[^\p{L}\p{N}_@.\-]+/gu)
      .map(t => t.trim())
      .filter(t => t.length >= min && t.length <= 80)
      .map(safeSegment)
  ));
}

async function ensureDirFor(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

async function readIndexFile(filePath) {
  const data = await readJSON(filePath);
  if (!data || !Array.isArray(data.ids)) {
    return { ids: [], updatedAt: null };
  }
  return data;
}

async function writeIndexFile(filePath, ids) {
  await ensureDirFor(filePath);
  await atomicWrite(filePath, {
    ids: Array.from(new Set(ids)),
    updatedAt: new Date().toISOString(),
  });
}

async function addId(filePath, id) {
  const idx = await readIndexFile(filePath);
  if (!idx.ids.includes(id)) idx.ids.push(id);
  await writeIndexFile(filePath, idx.ids);
}

async function removeId(filePath, id) {
  const idx = await readIndexFile(filePath);
  const next = idx.ids.filter(x => x !== id);
  if (next.length !== idx.ids.length) {
    await writeIndexFile(filePath, next);
  }
}

async function readMeta() {
  const meta = await readJSON(metaPath());
  if (!meta || meta.version !== INDEX_VERSION) {
    return null;
  }
  return meta;
}

async function writeMeta(patch = {}) {
  const previous = await readJSON(metaPath()).catch(() => null);
  const next = {
    version: INDEX_VERSION,
    enabled: isEnabled(),
    recordCount: previous?.recordCount || 0,
    lastBuiltAt: previous?.lastBuiltAt || null,
    lastUpdatedAt: new Date().toISOString(),
    stale: false,
    staleReason: null,
    ids: Array.isArray(previous?.ids) ? previous.ids : [],
    dates: Array.isArray(previous?.dates) ? previous.dates : [],
    ...patch,
  };
  await ensureDirFor(metaPath());
  await atomicWrite(metaPath(), next);
  return next;
}

function recordIndexFiles(record) {
  const files = [];

  if (record.action) files.push(indexFile('action', record.action));
  if (record.adminId) files.push(indexFile('admin', record.adminId));
  if (record.targetType) files.push(indexFile('target-type', record.targetType));

  const d = dateKeyFromIso(record.createdAt);
  if (d) files.push(indexFile('date', d));

  for (const token of tokenizeRecord(record)) {
    files.push(indexFile('token', token));
  }

  return files;
}

/**
 * Incrementally index one audit record.
 * @param {object} record
 */
export async function indexAuditRecord(record) {
  if (!isEnabled()) return { indexed: false };
  if (!record || !record.id || !record.id.startsWith('aud_')) return { indexed: false };

  try {
    for (const file of recordIndexFiles(record)) {
      await addId(file, record.id);
    }

    const meta = await readMeta() || await writeMeta();
    const ids = Array.isArray(meta.ids) ? meta.ids : [];
    if (!ids.includes(record.id)) ids.push(record.id);

    const d = dateKeyFromIso(record.createdAt);
    const dates = Array.isArray(meta.dates) ? meta.dates : [];
    if (d && !dates.includes(d)) dates.push(d);

    await writeMeta({
      ids,
      dates: dates.sort(),
      recordCount: ids.length,
      lastUpdatedAt: new Date().toISOString(),
      stale: false,
      staleReason: null,
    });

    return { indexed: true };
  } catch (err) {
    logger.warn('auditLogIndex: indexAuditRecord failed', {
      auditId: record.id,
      error: err.message,
    });
    await markAuditIndexStale('incremental_index_failed').catch(() => {});
    return { indexed: false, error: err.message };
  }
}

/**
 * Remove one audit record from indexes.
 * Used by retention cleanup.
 * @param {object} record
 */
export async function removeAuditRecord(record) {
  if (!isEnabled()) return { removed: false };
  if (!record || !record.id) return { removed: false };

  try {
    for (const file of recordIndexFiles(record)) {
      await removeId(file, record.id);
    }

    const meta = await readMeta();
    if (meta) {
      const ids = (meta.ids || []).filter(id => id !== record.id);
      await writeMeta({
        ids,
        recordCount: ids.length,
        lastUpdatedAt: new Date().toISOString(),
      });
    }

    return { removed: true };
  } catch (err) {
    logger.warn('auditLogIndex: removeAuditRecord failed', {
      auditId: record.id,
      error: err.message,
    });
    await markAuditIndexStale('incremental_remove_failed').catch(() => {});
    return { removed: false, error: err.message };
  }
}

function intersectSets(a, b) {
  if (!a || !b) return new Set();
  const result = new Set();
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const id of small) {
    if (large.has(id)) result.add(id);
  }
  return result;
}

function unionSets(sets) {
  const result = new Set();
  for (const s of sets) {
    for (const id of s) result.add(id);
  }
  return result;
}

async function idsFromIndex(kind, key) {
  const file = indexFile(kind, key);
  const data = await readIndexFile(file);
  return new Set(data.ids || []);
}

function enumerateDateKeys(from, to, metaDates) {
  if (!from && !to) return null;

  const fromDate = from ? String(from).slice(0, 10) : null;
  const toDate = to ? String(to).slice(0, 10) : null;

  if (Array.isArray(metaDates) && metaDates.length > 0) {
    return metaDates.filter(d => (!fromDate || d >= fromDate) && (!toDate || d <= toDate));
  }

  if (!fromDate || !toDate) return null;

  const keys = [];
  let cur = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);
  let guard = 0;

  while (cur <= end && guard < 3660) {
    keys.push(cur.toISOString().slice(0, 10));
    cur = new Date(cur.getTime() + 86400000);
    guard++;
  }

  return keys;
}

function finalMatches(record, options = {}) {
  if (!record || !record.id || !record.id.startsWith('aud_')) return false;

  if (options.action && record.action !== options.action) return false;
  if (options.adminId && record.adminId !== options.adminId) return false;
  if (options.targetType && record.targetType !== options.targetType) return false;
  if (options.from && record.createdAt && record.createdAt < options.from) return false;
  if (options.to && record.createdAt && record.createdAt > options.to) return false;

  if (options.q && typeof options.q === 'string') {
    const q = options.q.toLowerCase().trim();
    if (q.length > 0 && !buildHaystack(record).includes(q)) return false;
  }

  return true;
}

/**
 * Search using audit index. Returns fallbackRequired on stale/missing/corrupt index.
 * @param {object} options
 */
export async function searchAuditIndex(options = {}) {
  if (!isEnabled()) {
    return { fallbackRequired: true, reason: 'disabled' };
  }

  try {
    const meta = await readMeta();
    if (!meta) return { fallbackRequired: true, reason: 'missing_meta' };
    if (meta.stale) return { fallbackRequired: true, reason: 'stale', staleReason: meta.staleReason };

    const candidateSets = [];

    if (options.action) {
      candidateSets.push(await idsFromIndex('action', options.action));
    }

    if (options.adminId) {
      candidateSets.push(await idsFromIndex('admin', options.adminId));
    }

    if (options.targetType) {
      candidateSets.push(await idsFromIndex('target-type', options.targetType));
    }

    const dateKeys = enumerateDateKeys(options.from, options.to, meta.dates);
    if (dateKeys && dateKeys.length > 0) {
      const dateSets = [];
      for (const d of dateKeys) {
        dateSets.push(await idsFromIndex('date', d));
      }
      candidateSets.push(unionSets(dateSets));
    } else if (options.from || options.to) {
      // Date filtering requested but date index cannot enumerate safely.
      return { fallbackRequired: true, reason: 'date_range_not_indexable' };
    }

    if (options.q && config.AUDIT_INDEX.tokenIndexEnabled) {
      const tokens = tokenizeQuery(options.q);
      if (tokens.length > 0) {
        let tokenSet = null;
        for (const token of tokens) {
          const s = await idsFromIndex('token', token);
          tokenSet = tokenSet === null ? s : intersectSets(tokenSet, s);
        }
        candidateSets.push(tokenSet || new Set());
      }
    }

    let candidateIds;
    if (candidateSets.length === 0) {
      candidateIds = new Set(meta.ids || []);
    } else {
      candidateIds = candidateSets[0];
      for (let i = 1; i < candidateSets.length; i++) {
        candidateIds = intersectSets(candidateIds, candidateSets[i]);
      }
    }

    const maxCandidates = config.AUDIT_INDEX.maxCandidateIds || 5000;
    if (candidateIds.size > maxCandidates) {
      return {
        fallbackRequired: true,
        reason: 'candidate_cap_exceeded',
        candidateCount: candidateIds.size,
      };
    }

    const records = [];
    for (const id of candidateIds) {
      const rec = await readJSON(getRecordPath('audit', id));
      if (rec && finalMatches(rec, options)) records.push(rec);
    }

    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    let entries = records;
    let cursorExpired = false;

    if (options.cursor && entries.length > 0) {
      const idx = entries.findIndex(e => e.id === options.cursor);
      if (idx >= 0) {
        entries = entries.slice(idx + 1);
      } else {
        cursorExpired = true;
      }
    }

    const maxResults = (config.ADMIN_OPERATIONS && config.ADMIN_OPERATIONS.auditLogSearchMaxResults) || 200;
    const limit = Math.min(Math.max(1, options.limit || 50), maxResults);
    const total = entries.length;
    const sliced = entries.slice(0, limit);
    const nextCursor = (sliced.length === limit && total > limit)
      ? sliced[sliced.length - 1].id
      : null;

    return {
      entries: sliced,
      total,
      nextCursor,
      hasMore: nextCursor !== null,
      cursorExpired,
      indexed: true,
      fallbackUsed: false,
    };
  } catch (err) {
    logger.warn('auditLogIndex: indexed search failed', { error: err.message });
    return { fallbackRequired: true, reason: 'search_failed', error: err.message };
  }
}

/**
 * Rebuild all audit indexes from raw audit records.
 */
export async function rebuildAuditIndex(options = {}) {
  if (!isEnabled()) return { indexed: 0, skipped: true };

  const started = Date.now();
  const root = indexRoot();

  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const auditDir = getCollectionPath('audit');
  const all = await listJSON(auditDir);
  const records = all.filter(r => r && r.id && r.id.startsWith('aud_'));

  const BATCH_SIZE = options.batchSize || 250;
  const ids = [];
  const dates = new Set();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    for (const file of recordIndexFiles(record)) {
      await addId(file, record.id);
    }

    ids.push(record.id);
    const d = dateKeyFromIso(record.createdAt);
    if (d) dates.add(d);

    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  await writeMeta({
    ids,
    dates: Array.from(dates).sort(),
    recordCount: ids.length,
    lastBuiltAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    stale: false,
    staleReason: null,
  });

  return {
    indexed: ids.length,
    durationMs: Date.now() - started,
    lastBuiltAt: new Date().toISOString(),
  };
}

/**
 * Verify sample records against indexes.
 */
export async function verifyAuditIndex(options = {}) {
  if (!isEnabled()) return { ok: true, disabled: true, warnings: [] };

  const warnings = [];
  const sampleSize = options.sampleSize || config.AUDIT_INDEX.verifySampleSize || 100;

  const meta = await readMeta();
  if (!meta) {
    return { ok: false, warnings: ['audit index meta missing'] };
  }

  const auditDir = getCollectionPath('audit');
  const all = await listJSON(auditDir);
  const records = all.filter(r => r && r.id && r.id.startsWith('aud_'));

  const sample = records.slice(0, sampleSize);

  for (const record of sample) {
    const checks = [
      ['action', record.action],
      ['admin', record.adminId],
      ['target-type', record.targetType],
      ['date', dateKeyFromIso(record.createdAt)],
    ];

    for (const [kind, key] of checks) {
      if (!key) continue;
      const ids = await idsFromIndex(kind, key);
      if (!ids.has(record.id)) {
        warnings.push(`${kind}:${key} missing ${record.id}`);
      }
    }
  }

  return {
    ok: warnings.length === 0,
    checked: sample.length,
    totalRecords: records.length,
    warnings,
  };
}

/**
 * Stats for admin/health.
 */
export async function getAuditIndexStats() {
  if (!isEnabled()) {
    return { enabled: false, status: 'disabled', recordCount: 0, lastBuiltAt: null, stale: false };
  }

  const meta = await readMeta();
  if (!meta) {
    return { enabled: true, status: 'missing', recordCount: 0, lastBuiltAt: null, stale: true };
  }

  return {
    enabled: true,
    status: meta.stale ? 'stale' : 'healthy',
    recordCount: meta.recordCount || 0,
    lastBuiltAt: meta.lastBuiltAt || null,
    lastUpdatedAt: meta.lastUpdatedAt || null,
    stale: !!meta.stale,
    staleReason: meta.staleReason || null,
  };
}

/**
 * Mark index stale so callers can safely fallback to full scan.
 */
export async function markAuditIndexStale(reason) {
  if (!isEnabled()) return null;
  const meta = await readMeta() || await writeMeta();
  return await writeMeta({
    ...meta,
    stale: true,
    staleReason: reason || 'unknown',
    lastUpdatedAt: new Date().toISOString(),
  });
}

// ── EventBus Integration ─────────────────────────────────────
// Registered when this module is imported at startup/search.
if (isEnabled() && config.AUDIT_INDEX.incrementalUpdates) {
  eventBus.on('audit:logged', (data) => {
    if (!data || !data.record) return;
    indexAuditRecord(data.record).catch(err => {
      logger.warn('auditLogIndex: audit:logged listener failed', { error: err.message });
    });
  });

  eventBus.on('audit:deleted', (data) => {
    if (!data || !data.record) {
      markAuditIndexStale('audit_deleted_without_record').catch(() => {});
      return;
    }
    removeAuditRecord(data.record).catch(err => {
      logger.warn('auditLogIndex: audit:deleted listener failed', { error: err.message });
    });
  });
}

export const _testHelpers = {
  safeSegment,
  tokenizeRecord,
  tokenizeQuery,
  buildHaystack,
  finalMatches,
  indexFile,
  metaPath,
};
