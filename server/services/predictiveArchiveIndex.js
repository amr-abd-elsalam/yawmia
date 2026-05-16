// ═══════════════════════════════════════════════════════════════
// server/services/predictiveArchiveIndex.js — Predictive Archive Index (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Indexes archived predictive signals by riskType/status/month.
// Archives remain source of truth; index is rebuildable.
// ═══════════════════════════════════════════════════════════════

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getCollectionPath,
  getRecordPath,
  listJSON,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function isEnabled() {
  return !!(config.PREDICTIVE_ARCHIVE_INDEX && config.PREDICTIVE_ARCHIVE_INDEX.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function safeSegment(value) {
  return String(value || 'unknown')
    .toLowerCase()
    .replace(/[\\/]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[^\p{L}\p{N}_\-:.@]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'unknown';
}

function indexBasePath() {
  return getCollectionPath('predictive_archive_indexes');
}

function indexFile(kind, key) {
  return join(indexBasePath(), `by-${kind}`, `${safeSegment(key)}.json`);
}

function metaPath() {
  return join(indexBasePath(), 'meta.json');
}

function signalRef(signal, archiveMonth) {
  return {
    signalId: signal.id,
    riskType: signal.riskType || null,
    status: signal.status || null,
    severity: signal.severity || null,
    entityType: signal.entityType || null,
    entityId: signal.entityId || null,
    relatedUserId: signal.relatedUserId || null,
    archiveMonth,
    archivedAt: signal.archivedAt || null,
    createdAt: signal.createdAt || null,
    updatedAt: signal.updatedAt || null,
  };
}

async function readIndexList(filePath) {
  const data = await readJSON(filePath);
  if (!data || !Array.isArray(data.refs)) {
    return { refs: [], updatedAt: null };
  }
  return data;
}

async function writeIndexList(filePath, refs) {
  const unique = new Map();
  for (const ref of refs || []) {
    if (ref && ref.signalId) unique.set(`${ref.archiveMonth}:${ref.signalId}`, ref);
  }

  await atomicWrite(filePath, {
    refs: Array.from(unique.values()),
    updatedAt: nowIso(),
  });
}

async function appendIndex(kind, key, ref) {
  if (!key || !ref || !ref.signalId) return;
  const filePath = indexFile(kind, key);
  const data = await readIndexList(filePath);
  data.refs.push(ref);
  await writeIndexList(filePath, data.refs);
}

async function listArchiveFiles() {
  const dir = getCollectionPath('predictive_signal_archives');
  let files = [];
  try {
    files = await readdir(dir);
  } catch (_) {
    return [];
  }

  return files
    .filter(f => /^\d{4}-\d{2}\.json$/.test(f))
    .map(f => join(dir, f));
}

/**
 * Update archive index for a single archived signal.
 */
export async function updatePredictiveArchiveIndexForSignal(signal) {
  if (!isEnabled()) return { indexed: false, disabled: true };
  if (!signal || !signal.id) return { indexed: false, error: 'invalid signal' };

  const archiveMonth = signal.archivedAt
    ? signal.archivedAt.slice(0, 7)
    : (signal.updatedAt || signal.createdAt || nowIso()).slice(0, 7);

  const ref = signalRef(signal, archiveMonth);

  await appendIndex('risk-type', signal.riskType || 'unknown', ref);
  await appendIndex('status', signal.status || 'unknown', ref);
  await appendIndex('month', archiveMonth, ref);

  return { indexed: true, ref };
}

/**
 * Rebuild full archive index from archive files.
 */
export async function rebuildPredictiveArchiveIndex(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const started = Date.now();
  const archiveFiles = await listArchiveFiles();

  const byRiskType = new Map();
  const byStatus = new Map();
  const byMonth = new Map();

  let archivedSignals = 0;
  let scannedArchives = 0;

  for (let i = 0; i < archiveFiles.length; i++) {
    const filePath = archiveFiles[i];
    const archive = await readJSON(filePath).catch(() => null);
    if (!archive || !archive.entries) continue;

    scannedArchives++;
    const archiveMonth = archive.month || filePath.split('/').pop().replace('.json', '');

    for (const signal of Object.values(archive.entries || {})) {
      if (!signal || !signal.id) continue;
      archivedSignals++;

      const ref = signalRef(signal, archiveMonth);

      const rt = signal.riskType || 'unknown';
      const st = signal.status || 'unknown';

      if (!byRiskType.has(rt)) byRiskType.set(rt, []);
      if (!byStatus.has(st)) byStatus.set(st, []);
      if (!byMonth.has(archiveMonth)) byMonth.set(archiveMonth, []);

      byRiskType.get(rt).push(ref);
      byStatus.get(st).push(ref);
      byMonth.get(archiveMonth).push(ref);
    }

    if ((i + 1) % 20 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  for (const [key, refs] of byRiskType) {
    await writeIndexList(indexFile('risk-type', key), refs);
  }

  for (const [key, refs] of byStatus) {
    await writeIndexList(indexFile('status', key), refs);
  }

  for (const [key, refs] of byMonth) {
    await writeIndexList(indexFile('month', key), refs);
  }

  const meta = {
    version: 1,
    rebuiltAt: nowIso(),
    scannedArchives,
    archivedSignals,
    riskTypeCount: byRiskType.size,
    statusCount: byStatus.size,
    monthCount: byMonth.size,
    stale: false,
  };

  await atomicWrite(metaPath(), meta);

  eventBus.emit('predictive_archive_index:rebuilt', {
    archivedSignals,
    scannedArchives,
    timestamp: meta.rebuiltAt,
  });

  return {
    ok: true,
    ...meta,
    durationMs: Date.now() - started,
  };
}

async function loadSignalFromArchive(ref) {
  if (!ref || !ref.signalId || !ref.archiveMonth) return null;
  const archive = await readJSON(getRecordPath('predictive_signal_archives', ref.archiveMonth)).catch(() => null);
  return archive?.entries?.[ref.signalId] || null;
}

async function fallbackArchiveScan(options = {}) {
  const archiveFiles = await listArchiveFiles();
  const rows = [];

  for (const filePath of archiveFiles) {
    const archive = await readJSON(filePath).catch(() => null);
    if (!archive || !archive.entries) continue;

    for (const signal of Object.values(archive.entries || {})) {
      if (!signal || !signal.id) continue;
      if (options.riskType && signal.riskType !== options.riskType) continue;
      if (options.status && signal.status !== options.status) continue;
      if (options.month && (archive.month || '').slice(0, 7) !== options.month) continue;
      rows.push(signal);
    }
  }

  return rows;
}

/**
 * Query predictive archive index.
 */
export async function queryPredictiveArchiveIndex(options = {}) {
  if (!isEnabled()) {
    const fallback = await fallbackArchiveScan(options);
    return paginateSignals(fallback, options, { indexed: false, fallbackUsed: true });
  }

  let refs = null;
  let indexed = true;
  let fallbackUsed = false;

  try {
    if (options.riskType) {
      refs = (await readIndexList(indexFile('risk-type', options.riskType))).refs;
    } else if (options.status) {
      refs = (await readIndexList(indexFile('status', options.status))).refs;
    } else if (options.month) {
      refs = (await readIndexList(indexFile('month', options.month))).refs;
    } else {
      // No selective filter — use fallback scan to avoid reading every index file.
      indexed = false;
      fallbackUsed = true;
      const fallback = await fallbackArchiveScan(options);
      return paginateSignals(fallback, options, { indexed, fallbackUsed });
    }

    if (!refs || refs.length === 0) {
      return paginateSignals([], options, { indexed, fallbackUsed: false });
    }

    // Apply additional filters not covered by selected index.
    refs = refs.filter(ref => {
      if (options.riskType && ref.riskType !== options.riskType) return false;
      if (options.status && ref.status !== options.status) return false;
      if (options.month && ref.archiveMonth !== options.month) return false;
      return true;
    });

    const signals = [];
    for (const ref of refs) {
      const signal = await loadSignalFromArchive(ref);
      if (signal) signals.push(signal);
    }

    return paginateSignals(signals, options, { indexed, fallbackUsed });
  } catch (err) {
    logger.warn('predictiveArchiveIndex: query failed, using fallback', { error: err.message });
    const fallback = await fallbackArchiveScan(options);
    return paginateSignals(fallback, options, { indexed: false, fallbackUsed: true });
  }
}

function paginateSignals(signals, options, meta) {
  signals.sort((a, b) =>
    new Date(b.archivedAt || b.updatedAt || b.createdAt || 0) -
    new Date(a.archivedAt || a.updatedAt || a.createdAt || 0)
  );

  const total = signals.length;
  const limit = Math.min(200, Math.max(1, parseInt(options.limit) || 50));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    signals: signals.slice(offset, offset + limit),
    total,
    limit,
    offset,
    indexed: !!meta.indexed,
    fallbackUsed: !!meta.fallbackUsed,
  };
}

export async function getPredictiveArchiveIndexStats() {
  if (!isEnabled()) return { enabled: false };

  const meta = await readJSON(metaPath()).catch(() => null);

  return {
    enabled: true,
    status: meta && !meta.stale ? 'healthy' : 'missing_or_stale',
    rebuiltAt: meta?.rebuiltAt || null,
    scannedArchives: meta?.scannedArchives || 0,
    archivedSignals: meta?.archivedSignals || 0,
    riskTypeCount: meta?.riskTypeCount || 0,
    statusCount: meta?.statusCount || 0,
    monthCount: meta?.monthCount || 0,
    stale: !!meta?.stale,
  };
}

export const _testHelpers = {
  isEnabled,
  safeSegment,
  indexBasePath,
  indexFile,
  metaPath,
  signalRef,
  readIndexList,
  writeIndexList,
  fallbackArchiveScan,
  paginateSignals,
};
