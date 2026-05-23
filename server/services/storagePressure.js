// ═══════════════════════════════════════════════════════════════
// server/services/storagePressure.js — Unified Storage Pressure (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Shallow-first filesystem pressure inspection for file-based storage.
//
// Goals:
// - Count files/sizes without parsing JSON by default.
// - Be shard-aware for monthly sharded collections.
// - Surface collection/index/queue/workroom/governance/analytics pressure.
// - Persist snapshots for readiness/admin dashboards.
// - Avoid PII leakage: output paths are relative; no file content previews.
// - Respect YAWMIA_DATA_PATH dynamically through database helpers.
// - No external DB/search/queue implementation in Phase 59.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import config from '../../config.js';
import {
  atomicWrite,
  deleteJSON,
  getCollectionPath,
  getRecordPath,
  listJSON,
  readJSON,
} from './database.js';
import { logger } from './logger.js';

const cache = new Map();

function isEnabled() {
  return !!(config.STORAGE_PRESSURE && config.STORAGE_PRESSURE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function basePath() {
  return process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
}

function cacheTtlMs() {
  return config.STORAGE_PRESSURE?.cacheTtlMs || (5 * 60 * 1000);
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + cacheTtlMs(),
  });
}

export function clearStoragePressureCache() {
  cache.clear();
}

function generateSnapshotId() {
  return 'sp_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function bytesToKB(bytes) {
  return Math.round(((Number(bytes) || 0) / 1024) * 10) / 10;
}

function safeRelative(filePath) {
  try {
    const rel = relative(basePath(), filePath).split(sep).join('/');
    if (!rel || rel.startsWith('..')) return '[outside-data-path]';
    return rel;
  } catch (_) {
    return '[unknown]';
  }
}

function isJsonFile(name) {
  return name.endsWith('.json') && !name.endsWith('.tmp');
}

function isTmpFile(name) {
  return name.endsWith('.tmp');
}

function isShardDir(name) {
  return /^\d{4}-\d{2}$/.test(name);
}

function emptyCollectionStats(collection) {
  return {
    collection,
    path: null,
    fileCount: 0,
    tmpFileCount: 0,
    staleTmpCount: 0,
    totalSizeBytes: 0,
    totalSizeKB: 0,
    largestJsonKB: 0,
    largestFiles: [],
    shards: {},
    sampleParse: {
      enabled: false,
      checked: 0,
      failed: 0,
    },
    scanMode: 'shallow',
    scannedAt: nowIso(),
  };
}

function addLargestFile(stats, fileInfo, limit) {
  if (!fileInfo || !stats) return;
  stats.largestFiles.push(fileInfo);
  stats.largestFiles.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
  while (stats.largestFiles.length > limit) stats.largestFiles.pop();

  if (fileInfo.sizeKB > (stats.largestJsonKB || 0)) {
    stats.largestJsonKB = fileInfo.sizeKB;
  }
}

function mergeLargestFiles(target, source, limit) {
  const files = Array.isArray(source) ? source : [];
  for (const f of files) addLargestFile(target, f, limit);
}

async function readDirEntries(dirPath) {
  try {
    return await readdir(dirPath, { withFileTypes: true });
  } catch (_) {
    return [];
  }
}

/**
 * Scan one flat directory shallowly.
 *
 * Does not parse JSON unless options.sampleJsonParseCount > 0.
 */
async function scanFlatJsonDir(dirPath, options = {}) {
  const limit = options.largestFilesLimit || config.STORAGE_PRESSURE?.largestFilesLimit || 20;
  const staleTmpMinutes = options.staleTmpMinutes || config.FILE_HEALTH?.staleTmpWarningMinutes || 10;
  const staleTmpCutoffMs = Date.now() - staleTmpMinutes * 60 * 1000;
  const sampleJsonParseCount = Math.max(0, Number(options.sampleJsonParseCount) || 0);

  const stats = {
    fileCount: 0,
    tmpFileCount: 0,
    staleTmpCount: 0,
    totalSizeBytes: 0,
    totalSizeKB: 0,
    largestJsonKB: 0,
    largestFiles: [],
    sampleParse: {
      enabled: sampleJsonParseCount > 0,
      checked: 0,
      failed: 0,
      failures: [],
    },
  };

  const entries = await readDirEntries(dirPath);
  let parsedSamples = 0;
  let processed = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const fullPath = join(dirPath, entry.name);

    if (isTmpFile(entry.name)) {
      stats.tmpFileCount++;
      try {
        const st = await stat(fullPath);
        if (st.mtimeMs <= staleTmpCutoffMs) stats.staleTmpCount++;
      } catch (_) {
        // Ignore stat errors for tmp files.
      }
      continue;
    }

    if (!isJsonFile(entry.name)) continue;

    try {
      const st = await stat(fullPath);
      const sizeBytes = st.size;
      const sizeKB = bytesToKB(sizeBytes);

      stats.fileCount++;
      stats.totalSizeBytes += sizeBytes;
      stats.totalSizeKB = bytesToKB(stats.totalSizeBytes);

      addLargestFile(stats, {
        path: safeRelative(fullPath),
        fileName: entry.name,
        sizeBytes,
        sizeKB,
        mtime: st.mtime ? st.mtime.toISOString() : null,
      }, limit);

      if (sampleJsonParseCount > 0 && parsedSamples < sampleJsonParseCount) {
        parsedSamples++;
        stats.sampleParse.checked++;
        try {
          const raw = await readFile(fullPath, 'utf-8');
          JSON.parse(raw);
        } catch (err) {
          stats.sampleParse.failed++;
          if (stats.sampleParse.failures.length < 10) {
            stats.sampleParse.failures.push({
              path: safeRelative(fullPath),
              error: err.message,
            });
          }
        }
      }
    } catch (_) {
      // Ignore individual file stat/read errors. File health scripts handle details.
    }

    processed++;
    if (processed % 250 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return stats;
}

/**
 * Get storage stats for one collection.
 *
 * Shard-aware:
 * - root flat JSON files
 * - YYYY-MM shard directories
 *
 * Shallow by default.
 */
export async function getCollectionStorageStats(collection, options = {}) {
  const started = Date.now();
  const stats = emptyCollectionStats(collection);
  const limit = options.largestFilesLimit || config.STORAGE_PRESSURE?.largestFilesLimit || 20;

  try {
    const dirPath = getCollectionPath(collection);
    stats.path = safeRelative(dirPath);
    stats.scanMode = options.deep ? 'deep' : 'shallow';

    const rootStats = await scanFlatJsonDir(dirPath, {
      largestFilesLimit: limit,
      sampleJsonParseCount: options.sampleJsonParseCount || 0,
      staleTmpMinutes: options.staleTmpMinutes,
    });

    stats.fileCount += rootStats.fileCount;
    stats.tmpFileCount += rootStats.tmpFileCount;
    stats.staleTmpCount += rootStats.staleTmpCount;
    stats.totalSizeBytes += rootStats.totalSizeBytes;
    stats.totalSizeKB = bytesToKB(stats.totalSizeBytes);
    stats.sampleParse.enabled = rootStats.sampleParse.enabled;
    stats.sampleParse.checked += rootStats.sampleParse.checked;
    stats.sampleParse.failed += rootStats.sampleParse.failed;
    if (rootStats.sampleParse.failures) {
      stats.sampleParse.failures = rootStats.sampleParse.failures;
    }
    mergeLargestFiles(stats, rootStats.largestFiles, limit);

    const entries = await readDirEntries(dirPath);
    const shardDirs = entries
      .filter(e => e.isDirectory() && isShardDir(e.name))
      .map(e => e.name)
      .sort();

    for (const shard of shardDirs) {
      const shardPath = join(dirPath, shard);
      const shardStats = await scanFlatJsonDir(shardPath, {
        largestFilesLimit: limit,
        sampleJsonParseCount: options.sampleJsonParseCountPerShard || 0,
        staleTmpMinutes: options.staleTmpMinutes,
      });

      stats.shards[shard] = {
        shard,
        path: safeRelative(shardPath),
        fileCount: shardStats.fileCount,
        tmpFileCount: shardStats.tmpFileCount,
        staleTmpCount: shardStats.staleTmpCount,
        totalSizeBytes: shardStats.totalSizeBytes,
        totalSizeKB: shardStats.totalSizeKB,
        largestJsonKB: shardStats.largestJsonKB,
        largestFiles: shardStats.largestFiles,
      };

      stats.fileCount += shardStats.fileCount;
      stats.tmpFileCount += shardStats.tmpFileCount;
      stats.staleTmpCount += shardStats.staleTmpCount;
      stats.totalSizeBytes += shardStats.totalSizeBytes;
      stats.totalSizeKB = bytesToKB(stats.totalSizeBytes);
      mergeLargestFiles(stats, shardStats.largestFiles, limit);
    }

    stats.durationMs = Date.now() - started;
    return stats;
  } catch (err) {
    return {
      ...stats,
      error: err.message,
      durationMs: Date.now() - started,
    };
  }
}

/**
 * Get index pressure stats.
 *
 * Includes:
 * - configured set indexes sizes
 * - audit token index pressure stats if available
 * - search index in-memory stats if available
 */
export async function getIndexStorageStats(options = {}) {
  const started = Date.now();
  const result = {
    setIndexes: [],
    auditTokenIndex: {
      enabled: false,
      fileCount: 0,
      totalSizeKB: 0,
      largestTokenFiles: [],
      status: 'unknown',
    },
    searchIndex: {
      enabled: !!(config.SEARCH_INDEX && config.SEARCH_INDEX.enabled),
      size: 0,
      sizeKB: 0,
      lastBuilt: null,
    },
    durationMs: 0,
  };

  // Set-based index files.
  for (const [name, relPath] of Object.entries(config.DATABASE.indexFiles || {})) {
    const filePath = join(basePath(), relPath);
    try {
      const st = await stat(filePath);
      result.setIndexes.push({
        name,
        path: relPath,
        sizeBytes: st.size,
        sizeKB: bytesToKB(st.size),
        mtime: st.mtime ? st.mtime.toISOString() : null,
      });
    } catch (_) {
      result.setIndexes.push({
        name,
        path: relPath,
        sizeBytes: 0,
        sizeKB: 0,
        missing: true,
      });
    }
  }

  result.setIndexes.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));

  // Audit token index pressure.
  try {
    const auditIndex = await import('./auditLogIndex.js');

    if (auditIndex.getAuditIndexPressureStats) {
      result.auditTokenIndex = await auditIndex.getAuditIndexPressureStats(options);
    } else if (auditIndex.getAuditIndexHygieneStats) {
      const stats = await auditIndex.getAuditIndexHygieneStats({
        limit: options.largestFilesLimit || config.STORAGE_PRESSURE?.largestFilesLimit || 20,
      });
      const token = stats.tokenIndex || {};
      result.auditTokenIndex = {
        enabled: !!token.enabled,
        fileCount: token.fileCount || 0,
        totalSizeBytes: token.totalSizeBytes || 0,
        totalSizeKB: token.totalSizeKB || 0,
        totalIds: token.totalIds || 0,
        largestTokenFiles: token.largestTokenFiles || [],
        warnings: stats.warnings || [],
      };
    }
  } catch (_) {
    // Non-fatal.
  }

  // Search index stats.
  try {
    const searchIndex = await import('./searchIndex.js');
    if (searchIndex.getStats) {
      const s = searchIndex.getStats();
      result.searchIndex = {
        enabled: !!(config.SEARCH_INDEX && config.SEARCH_INDEX.enabled),
        size: s.size || 0,
        sizeKB: 0,
        lastBuilt: s.lastBuilt || null,
        raw: s,
      };
    }
  } catch (_) {
    // Non-fatal.
  }

  result.durationMs = Date.now() - started;
  return result;
}

/**
 * Queue pressure stats.
 *
 * Uses queue summary/stats when available, plus cheap segmented dir counts.
 */
export async function getQueuePressureStats(options = {}) {
  const started = Date.now();
  const result = {
    enabled: !!(config.OPS_QUEUE && config.OPS_QUEUE.enabled),
    byStatus: {},
    byType: {},
    summary: {},
    segmentedDirs: {},
    archive: {},
    durationMs: 0,
  };

  try {
    const opsQueue = await import('./opsQueue.js');
    if (opsQueue.getQueueStats) {
      const stats = await opsQueue.getQueueStats();
      Object.assign(result, stats || {});
    }
  } catch (err) {
    result.error = err.message;
  }

  // Cheap segmented directory counts/sizes.
  const segmented = {
    pending: 'queue_pending',
    running: 'queue_running',
    completed: 'queue_completed',
    failed: 'queue_failed',
    cancelled: 'queue_cancelled',
    deadLetter: 'ops_queue_dead_letter',
  };

  for (const [status, collection] of Object.entries(segmented)) {
    try {
      const stats = await getCollectionStorageStats(collection, {
        largestFilesLimit: 3,
      });
      result.segmentedDirs[status] = {
        fileCount: stats.fileCount,
        totalSizeKB: stats.totalSizeKB,
        staleTmpCount: stats.staleTmpCount,
      };
    } catch (_) {
      result.segmentedDirs[status] = {
        fileCount: 0,
        totalSizeKB: 0,
      };
    }
  }

  try {
    const archiveStats = await getCollectionStorageStats('queue_archive', {
      largestFilesLimit: 3,
    });
    result.archive = {
      fileCount: archiveStats.fileCount,
      totalSizeKB: archiveStats.totalSizeKB,
      largestJsonKB: archiveStats.largestJsonKB,
    };
  } catch (_) {
    result.archive = {
      fileCount: 0,
      totalSizeKB: 0,
    };
  }

  result.durationMs = Date.now() - started;
  return result;
}

/**
 * Workroom pressure stats.
 *
 * Prefer workroomHygiene helper if available; fallback to shallow sidecar scans.
 */
export async function getWorkroomPressureStats(options = {}) {
  const started = Date.now();
  const result = {
    enabled: !!(config.WORKROOM && config.WORKROOM.enabled),
    totalSidecarKB: 0,
    largestSidecarKB: 0,
    largestSearchIndexKB: 0,
    sidecars: {},
    largestSidecars: [],
    warnings: [],
    durationMs: 0,
  };

  try {
    const hygiene = await import('./workroomHygiene.js');
    if (hygiene.getWorkroomPressureStats) {
      return await hygiene.getWorkroomPressureStats(options);
    }
  } catch (_) {
    // Fallback below.
  }

  const sidecarCollections = {
    receipts: 'workroom_receipts',
    pins: 'workroom_pins',
    checklists: 'workroom_checklists',
    searchIndexes: 'workroom_search_indexes',
  };

  for (const [kind, collection] of Object.entries(sidecarCollections)) {
    try {
      const stats = await getCollectionStorageStats(collection, {
        largestFilesLimit: options.largestFilesLimit || config.STORAGE_PRESSURE?.largestFilesLimit || 20,
      });

      result.sidecars[kind] = {
        fileCount: stats.fileCount,
        totalSizeKB: stats.totalSizeKB,
        largestJsonKB: stats.largestJsonKB,
        staleTmpCount: stats.staleTmpCount,
      };

      result.totalSidecarKB += stats.totalSizeKB || 0;

      if (kind === 'searchIndexes') {
        result.largestSearchIndexKB = Math.max(result.largestSearchIndexKB, stats.largestJsonKB || 0);
      } else {
        result.largestSidecarKB = Math.max(result.largestSidecarKB, stats.largestJsonKB || 0);
      }

      for (const file of stats.largestFiles || []) {
        result.largestSidecars.push({
          kind,
          ...file,
        });
      }
    } catch (_) {
      result.sidecars[kind] = {
        fileCount: 0,
        totalSizeKB: 0,
        largestJsonKB: 0,
      };
    }
  }

  result.largestSidecars.sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0));
  result.largestSidecars = result.largestSidecars.slice(0, config.STORAGE_PRESSURE?.largestFilesLimit || 20);
  result.totalSidecarKB = Math.round(result.totalSidecarKB * 10) / 10;
  result.durationMs = Date.now() - started;
  return result;
}

/**
 * Governance pressure stats.
 *
 * Uses helper exports when available; fallback to lightweight listJSON on low-volume collections.
 */
export async function getGovernancePressureStats(options = {}) {
  const started = Date.now();
  const result = {
    privacyRequests: { total: 0 },
    adminApprovals: { total: 0 },
    opsReviews: { total: 0 },
    postmortems: { total: 0 },
    incidents: { total: 0 },
    exports: { total: 0 },
    durationMs: 0,
  };

  // Privacy requests.
  try {
    const mod = await import('./privacyRequests.js');
    if (mod.getPrivacyRequestPressureStats) {
      result.privacyRequests = await mod.getPrivacyRequestPressureStats();
    } else {
      const rows = await listJSON(getCollectionPath('privacy_requests'));
      const open = rows.filter(r => ['requested', 'queued', 'processing', 'failed'].includes(r.status)).length;
      result.privacyRequests = {
        total: rows.filter(r => r && r.id).length,
        open,
        failed: rows.filter(r => r.status === 'failed').length,
      };
    }
  } catch (_) {}

  // Admin approvals.
  try {
    const mod = await import('./adminApprovals.js');
    if (mod.getAdminApprovalPressureStats) {
      result.adminApprovals = await mod.getAdminApprovalPressureStats();
    } else {
      const rows = await listJSON(getCollectionPath('admin_approvals'));
      result.adminApprovals = {
        total: rows.filter(r => r && r.id).length,
        pending: rows.filter(r => r.status === 'pending').length,
        expired: rows.filter(r => r.status === 'expired').length,
      };
    }
  } catch (_) {}

  // Ops reviews.
  try {
    const mod = await import('./opsReviewRecords.js');
    if (mod.getOpsReviewPressureStats) {
      result.opsReviews = await mod.getOpsReviewPressureStats();
    } else {
      const rows = await listJSON(getCollectionPath('ops_reviews'));
      result.opsReviews = {
        total: rows.filter(r => r && r.id).length,
        draft: rows.filter(r => r.status === 'draft').length,
        completed: rows.filter(r => r.status === 'completed').length,
      };
    }
  } catch (_) {}

  // Postmortems.
  try {
    const mod = await import('./postmortemRecords.js');
    if (mod.getPostmortemPressureStats) {
      result.postmortems = await mod.getPostmortemPressureStats();
    } else {
      const rows = await listJSON(getCollectionPath('postmortems'));
      let openActionItems = 0;
      let overdue = 0;
      for (const row of rows) {
        const items = Array.isArray(row.actionItems) ? row.actionItems : [];
        for (const item of items) {
          if (item.status !== 'done' && item.status !== 'cancelled') {
            openActionItems++;
            if (item.dueDate && new Date(item.dueDate).getTime() < Date.now()) overdue++;
          }
        }
      }
      result.postmortems = {
        total: rows.filter(r => r && r.id).length,
        openActionItems,
        overdue,
      };
    }
  } catch (_) {}

  // Incidents.
  try {
    const rows = await listJSON(getCollectionPath('incidents'));
    result.incidents = {
      total: rows.filter(r => r && r.id).length,
      open: rows.filter(r => r.status === 'open').length,
      critical: rows.filter(r => r.severity === 'critical').length,
    };
  } catch (_) {}

  // Exports.
  try {
    const rows = await listJSON(getCollectionPath('exports'));
    result.exports = {
      total: rows.filter(r => r && r.id && String(r.id).startsWith('exp_')).length,
      pending: rows.filter(r => r.status === 'pending').length,
      running: rows.filter(r => r.status === 'running').length,
      failed: rows.filter(r => r.status === 'failed').length,
    };
  } catch (_) {}

  result.durationMs = Date.now() - started;
  return result;
}

/**
 * Analytics/product intelligence pressure.
 */
async function getAnalyticsPressureStats(options = {}) {
  const started = Date.now();
  const result = {
    searchAnalytics: { fileCount: 0, totalSizeKB: 0 },
    productIntelligence: { fileCount: 0, totalSizeKB: 0 },
    paymentDisputes: { fileCount: 0, totalSizeKB: 0 },
    matching: { fileCount: 0, totalSizeKB: 0 },
    durationMs: 0,
  };

  const map = {
    searchAnalytics: 'search_analytics',
    productIntelligence: 'product_intelligence',
    paymentDisputes: 'payment_dispute_analytics',
    matching: 'matching_metrics',
  };

  for (const [key, collection] of Object.entries(map)) {
    try {
      const stats = await getCollectionStorageStats(collection, {
        largestFilesLimit: 5,
      });
      result[key] = {
        fileCount: stats.fileCount,
        totalSizeKB: stats.totalSizeKB,
        largestJsonKB: stats.largestJsonKB,
      };
    } catch (_) {}
  }

  result.durationMs = Date.now() - started;
  return result;
}

/**
 * Phase 59: Image/object store pressure.
 *
 * The image store is content-addressed and bucketed by hash prefix, not a
 * standard JSON collection. This helper counts binary files and metadata files
 * without reading file contents.
 *
 * No PII is returned. Only relative paths, sizes, and counts.
 */
export async function getImageStorePressureStats(options = {}) {
  const started = Date.now();
  const limit = options.largestFilesLimit || config.STORAGE_PRESSURE?.largestFilesLimit || 20;
  const imageDir = process.env.YAWMIA_DATA_PATH
    ? join(basePath(), 'images')
    : (config.IMAGE_STORAGE?.basePath || join(basePath(), 'images'));

  const result = {
    enabled: !!(config.IMAGE_STORAGE && config.IMAGE_STORAGE.enabled),
    path: safeRelative(imageDir),
    bucketCount: 0,
    fileCount: 0,
    binaryFileCount: 0,
    metaFileCount: 0,
    totalSizeBytes: 0,
    totalSizeKB: 0,
    largestFileKB: 0,
    largestFiles: [],
    durationMs: 0,
    generatedAt: nowIso(),
  };

  try {
    const buckets = await readDirEntries(imageDir);

    for (const bucket of buckets) {
      if (!bucket.isDirectory()) continue;

      result.bucketCount++;
      const bucketPath = join(imageDir, bucket.name);
      const files = await readDirEntries(bucketPath);

      let processed = 0;

      for (const entry of files) {
        if (!entry.isFile()) continue;

        const fullPath = join(bucketPath, entry.name);

        try {
          const st = await stat(fullPath);
          const sizeBytes = st.size;
          const sizeKB = bytesToKB(sizeBytes);

          result.fileCount++;
          result.totalSizeBytes += sizeBytes;
          result.totalSizeKB = bytesToKB(result.totalSizeBytes);
          result.largestFileKB = Math.max(result.largestFileKB, sizeKB);

          if (entry.name.endsWith('.meta.json')) result.metaFileCount++;
          else result.binaryFileCount++;

          addLargestFile(result, {
            path: safeRelative(fullPath),
            fileName: entry.name,
            sizeBytes,
            sizeKB,
            mtime: st.mtime ? st.mtime.toISOString() : null,
          }, limit);
        } catch (_) {
          // Ignore individual file stat errors; file health scripts provide details.
        }

        processed++;
        if (processed % 250 === 0) {
          await new Promise(resolve => setImmediate(resolve));
        }
      }
    }
  } catch (err) {
    result.error = err.message;
  }

  result.durationMs = Date.now() - started;
  return result;
}

function summarizeCollectionPressure(collections) {
  const summary = {
    totalFiles: 0,
    totalSizeKB: 0,
    staleTmpCount: 0,
    largestJsonKB: 0,
    largestFiles: [],
  };

  const limit = config.STORAGE_PRESSURE?.largestFilesLimit || 20;

  for (const stats of Object.values(collections || {})) {
    summary.totalFiles += stats.fileCount || 0;
    summary.totalSizeKB += stats.totalSizeKB || 0;
    summary.staleTmpCount += stats.staleTmpCount || 0;
    summary.largestJsonKB = Math.max(summary.largestJsonKB, stats.largestJsonKB || 0);

    for (const f of stats.largestFiles || []) {
      addLargestFile(summary, {
        ...f,
        collection: stats.collection,
      }, limit);
    }
  }

  summary.totalSizeKB = Math.round(summary.totalSizeKB * 10) / 10;
  return summary;
}

function selectedCollections(options = {}) {
  if (options.collection) return [options.collection];

  if (Array.isArray(options.collections) && options.collections.length > 0) {
    return options.collections;
  }

  return Object.keys(config.DATABASE.dirs || {});
}

/**
 * Capture and persist a storage pressure snapshot.
 */
export async function captureStoragePressureSnapshot(options = {}) {
  const snapshot = await buildStoragePressureSnapshot({
    ...options,
    persist: false,
  });

  if (!isEnabled()) return snapshot;

  try {
    await atomicWrite(getRecordPath('storage_pressure', snapshot.id), snapshot);
    clearStoragePressureCache();
  } catch (err) {
    logger.warn('storagePressure: failed to persist snapshot', { error: err.message });
    snapshot.persistError = err.message;
  }

  return snapshot;
}

/**
 * Get storage pressure, cached by default.
 *
 * options:
 * - force: bypass cache
 * - persist: persist new snapshot
 * - deep: allow sample parsing / deeper checks
 * - collection: only one collection
 */
export async function getStoragePressure(options = {}) {
  if (!isEnabled()) {
    return {
      enabled: false,
      status: 'ok',
      warnings: [],
      criticals: [],
      recommendations: [],
      timestamp: nowIso(),
    };
  }

  const key = JSON.stringify({
    collection: options.collection || null,
    deep: !!options.deep,
    sampleJsonParseCount: options.sampleJsonParseCount || 0,
  });

  if (!options.force) {
    const cached = cacheGet(key);
    if (cached) return cached;
  }

  const snapshot = options.persist === false
    ? await buildStoragePressureSnapshot(options)
    : await captureStoragePressureSnapshot(options);

  cacheSet(key, snapshot);
  return snapshot;
}

async function buildStoragePressureSnapshot(options = {}) {
  const started = Date.now();
  const id = options.id || generateSnapshotId();
  const timestamp = nowIso();

  const deepAllowed = !!(
    options.deep ||
    (
      config.STORAGE_PRESSURE?.deepScanEnabled &&
      config.SCALE_LIMITS?.deepScanDefaultEnabled
    )
  );

  const sampleJsonParseCount = deepAllowed
    ? Math.max(
        0,
        Number(options.sampleJsonParseCount ?? config.STORAGE_PRESSURE?.sampleJsonParseCount ?? 100)
      )
    : 0;

  const collections = {};
  const collectionNames = selectedCollections(options);
  const maxFiles = config.SCALE_LIMITS?.shallowScanMaxFiles || 250000;

  let scannedFiles = 0;
  let truncated = false;

  for (const collection of collectionNames) {
    if (!config.DATABASE.dirs[collection]) continue;

    const stats = await getCollectionStorageStats(collection, {
      deep: deepAllowed,
      sampleJsonParseCount,
      largestFilesLimit: options.largestFilesLimit || config.STORAGE_PRESSURE?.largestFilesLimit || 20,
    });

    collections[collection] = stats;
    scannedFiles += stats.fileCount || 0;

    if (scannedFiles >= maxFiles && !options.deep) {
      truncated = true;
      break;
    }
  }

  const [
    indexes,
    queue,
    workrooms,
    governance,
    analytics,
    images,
  ] = await Promise.all([
    getIndexStorageStats(options).catch(err => ({ error: err.message })),
    getQueuePressureStats(options).catch(err => ({ error: err.message })),
    getWorkroomPressureStats(options).catch(err => ({ error: err.message })),
    getGovernancePressureStats(options).catch(err => ({ error: err.message })),
    getAnalyticsPressureStats(options).catch(err => ({ error: err.message })),
    getImageStorePressureStats(options).catch(err => ({ error: err.message })),
  ]);

  const summary = summarizeCollectionPressure(collections);

  let verification = {
    status: 'ok',
    warnings: [],
    criticals: [],
    recommendations: [],
  };

  const baseSnapshot = {
    id,
    timestamp,
    enabled: true,
    mode: deepAllowed ? 'deep' : 'shallow',
    truncated,
    scannedFiles,
    summary,
    collections,
    indexes,
    queue,
    workrooms,
    governance,
    analytics,
    images,
    warnings: [],
    criticals: [],
    recommendations: [],
    durationMs: 0,
  };

  try {
    const scale = await import('./scaleThresholds.js');
    verification = await scale.verifyScaleThresholds({
      pressureSnapshot: baseSnapshot,
      persist: false,
    });
  } catch (err) {
    verification = {
      status: 'warning',
      warnings: [{
        level: 'warning',
        code: 'SCALE_THRESHOLD_EVALUATION_FAILED',
        message: 'Scale threshold evaluation failed.',
        error: err.message,
      }],
      criticals: [],
      recommendations: [{
        id: 'scale_threshold_evaluation_failed',
        severity: 'warning',
        label: 'تعذّر تقييم حدود التوسع',
        reason: 'راجع خدمة scaleThresholds أو شغّل verify-scale-thresholds.js.',
        command: 'node scripts/verify-scale-thresholds.js',
        adminRoute: '/api/admin/scale-thresholds',
      }],
    };
  }

  const snapshot = {
    ...baseSnapshot,
    status: verification.status || 'ok',
    warnings: verification.warnings || [],
    criticals: verification.criticals || [],
    recommendations: verification.recommendations || [],
    thresholdVerification: {
      mode: verification.mode || config.SCALE_LIMITS?.mode || 'advisory',
      snapshotId: verification.snapshotId || id,
      generatedAt: verification.generatedAt || nowIso(),
    },
    durationMs: Date.now() - started,
  };

  if (truncated) {
    snapshot.status = snapshot.status === 'critical' ? 'critical' : 'warning';
    snapshot.warnings.push({
      level: 'warning',
      code: 'STORAGE_PRESSURE_SCAN_TRUNCATED',
      message: 'Storage pressure shallow scan reached max file count and was truncated.',
      metric: 'scannedFiles',
      value: scannedFiles,
      threshold: maxFiles,
      recommendation: 'شغّل قياس مخصص collection-by-collection أو --deep خارج وقت الذروة.',
    });
    snapshot.recommendations.unshift({
      id: 'storage_pressure_scan_truncated',
      severity: 'warning',
      label: 'قياس ضغط التخزين تم اختصاره',
      reason: 'عدد الملفات كبير. شغّل قياسًا مخصصًا لكل collection أو deep scan من CLI.',
      command: 'node scripts/measure-storage-pressure.js --collection=jobs',
      adminRoute: '/api/admin/storage-pressure',
    });
  }

  return snapshot;
}

/**
 * List persisted storage pressure snapshots newest-first.
 */
export async function listStoragePressureSnapshots(options = {}) {
  if (!isEnabled()) {
    return { snapshots: [], total: 0, limit: 20, offset: 0 };
  }

  const dir = getCollectionPath('storage_pressure');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && String(r.id).startsWith('sp_'));

  rows.sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    snapshots: rows.slice(offset, offset + limit).map(s => ({
      id: s.id,
      timestamp: s.timestamp,
      status: s.status,
      mode: s.mode,
      durationMs: s.durationMs || 0,
      scannedFiles: s.scannedFiles || 0,
      warningCount: Array.isArray(s.warnings) ? s.warnings.length : 0,
      criticalCount: Array.isArray(s.criticals) ? s.criticals.length : 0,
      recommendations: Array.isArray(s.recommendations) ? s.recommendations.slice(0, 3) : [],
      summary: s.summary || {},
    })),
    total,
    limit,
    offset,
  };
}

/**
 * Cleanup old storage pressure snapshots.
 */
export async function cleanupOldStoragePressureSnapshots() {
  if (!isEnabled()) return 0;

  const retentionDays = config.STORAGE_PRESSURE?.snapshotRetentionDays || 30;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const dir = getCollectionPath('storage_pressure');
  const rows = await listJSON(dir);

  let cleaned = 0;

  for (const row of rows) {
    if (!row || !row.id || !String(row.id).startsWith('sp_')) continue;

    const basis = row.timestamp || row.createdAt;
    if (basis && new Date(basis).getTime() < cutoffMs) {
      await deleteJSON(getRecordPath('storage_pressure', row.id)).catch(() => {});
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info('storagePressure: cleaned old snapshots', { cleaned });
  }

  return cleaned;
}

/**
 * Read latest persisted snapshot, or null.
 */
export async function getLatestStoragePressureSnapshot() {
  const result = await listStoragePressureSnapshots({ limit: 1, offset: 0 });
  if (!result.snapshots || result.snapshots.length === 0) return null;

  const id = result.snapshots[0].id;
  return await readJSON(getRecordPath('storage_pressure', id)).catch(() => null);
}

export const _testHelpers = {
  basePath,
  bytesToKB,
  safeRelative,
  isShardDir,
  isJsonFile,
  isTmpFile,
  scanFlatJsonDir,
  summarizeCollectionPressure,
  selectedCollections,
  clearStoragePressureCache,
};
