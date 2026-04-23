// ═══════════════════════════════════════════════════════════════
// server/services/monitor.js — Metrics Snapshots + Alerting
// ═══════════════════════════════════════════════════════════════
// Hourly snapshots stored in data/metrics/.
// Threshold-based alerting (warning/critical).
// Cleanup for old snapshots.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir, unlink, stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON, deleteJSON } from './database.js';
import { logger } from './logger.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;
const METRICS_DIR = join(BASE_PATH, 'metrics');

/**
 * Count .json files in a collection directory (no content reading)
 * @param {string} collectionName
 * @returns {Promise<number>}
 */
async function countCollectionFiles(collectionName) {
  try {
    const dir = join(BASE_PATH, config.DATABASE.dirs[collectionName] || collectionName);
    const files = await readdir(dir);
    return files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp')).length;
  } catch (_) {
    return 0;
  }
}

/**
 * Capture a metrics snapshot
 * @returns {Promise<object>}
 */
export async function captureSnapshot() {
  const id = 'mtr_' + crypto.randomBytes(6).toString('hex');
  const timestamp = new Date().toISOString();

  // Memory
  const mem = process.memoryUsage();
  const memory = {
    heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
    heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
    rssMB: +(mem.rss / 1048576).toFixed(1),
  };

  // Cache stats
  let cache = { hits: 0, misses: 0, size: 0, hitRate: '0%' };
  try {
    const { stats: cacheStats } = await import('./cache.js');
    cache = cacheStats();
  } catch (_) {}

  // Request metrics
  let requests = { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, errorRate: '0%' };
  try {
    const { getMetrics } = await import('../middleware/timing.js');
    requests = getMetrics();
  } catch (_) {}

  // SSE connections
  let connections = { sse: 0, sseUsers: 0 };
  try {
    const { getStats } = await import('./sseManager.js');
    const s = getStats();
    connections = { sse: s.totalConnections, sseUsers: s.totalUsers };
  } catch (_) {}

  // Active locks
  let locks = { active: 0 };
  try {
    const { getLockCount } = await import('./resourceLock.js');
    locks = { active: getLockCount() };
  } catch (_) {}

  // Index health
  let indexHealth = { status: 'unknown', warnings: 0 };
  try {
    const { getHealthStatus } = await import('./indexHealth.js');
    indexHealth = getHealthStatus();
  } catch (_) {}

  // Search index
  let searchIndex = { size: 0, lastBuilt: null };
  try {
    const { getStats: searchStats } = await import('./searchIndex.js');
    searchIndex = searchStats();
  } catch (_) {}

  // Data sizes (file counts per collection)
  const dataSize = {
    users: await countCollectionFiles('users'),
    jobs: await countCollectionFiles('jobs'),
    applications: await countCollectionFiles('applications'),
    notifications: await countCollectionFiles('notifications'),
    messages: await countCollectionFiles('messages'),
    payments: await countCollectionFiles('payments'),
  };

  const snapshot = {
    id,
    timestamp,
    memory,
    cache,
    requests,
    connections,
    locks,
    indexHealth,
    searchIndex,
    dataSize,
  };

  // Save to disk (use BASE_PATH directly to respect YAWMIA_DATA_PATH)
  await mkdir(METRICS_DIR, { recursive: true });
  const snapshotPath = join(METRICS_DIR, `${id}.json`);
  await atomicWrite(snapshotPath, snapshot);

  return snapshot;
}

/**
 * Get snapshots within a date range
 * @param {{ from?: string, to?: string, limit?: number }} options
 * @returns {Promise<object[]>}
 */
export async function getSnapshots(options = {}) {
  const limit = options.limit || 24;

  let files;
  try {
    files = await readdir(METRICS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  const jsonFiles = files.filter(f => f.startsWith('mtr_') && f.endsWith('.json') && !f.endsWith('.tmp'));

  const snapshots = [];
  for (const file of jsonFiles) {
    const data = await readJSON(join(METRICS_DIR, file));
    if (!data || !data.timestamp) continue;

    // Date range filter
    if (options.from && data.timestamp < options.from) continue;
    if (options.to && data.timestamp > options.to) continue;

    snapshots.push(data);
  }

  // Sort newest first
  snapshots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return snapshots.slice(0, limit);
}

/**
 * Check thresholds against a snapshot
 * @param {object} snapshot
 * @returns {Array<{ level: string, metric: string, value: number, threshold: number, message: string }>}
 */
export function checkThresholds(snapshot) {
  if (!config.MONITORING || !config.MONITORING.thresholds) return [];
  if (!snapshot) return [];

  const alerts = [];
  const thresholds = config.MONITORING.thresholds;

  // Heap used
  if (thresholds.heapUsedMB && snapshot.memory) {
    const val = snapshot.memory.heapUsedMB;
    if (val >= thresholds.heapUsedMB.critical) {
      alerts.push({ level: 'critical', metric: 'heapUsedMB', value: val, threshold: thresholds.heapUsedMB.critical, message: `Heap usage critical: ${val}MB` });
    } else if (val >= thresholds.heapUsedMB.warning) {
      alerts.push({ level: 'warning', metric: 'heapUsedMB', value: val, threshold: thresholds.heapUsedMB.warning, message: `Heap usage warning: ${val}MB` });
    }
  }

  // Error rate
  if (thresholds.errorRate && snapshot.requests) {
    const rateStr = snapshot.requests.errorRate || '0%';
    const val = parseFloat(rateStr);
    if (!isNaN(val)) {
      if (val >= thresholds.errorRate.critical) {
        alerts.push({ level: 'critical', metric: 'errorRate', value: val, threshold: thresholds.errorRate.critical, message: `Error rate critical: ${val}%` });
      } else if (val >= thresholds.errorRate.warning) {
        alerts.push({ level: 'warning', metric: 'errorRate', value: val, threshold: thresholds.errorRate.warning, message: `Error rate warning: ${val}%` });
      }
    }
  }

  // P95 latency
  if (thresholds.p95Ms && snapshot.requests) {
    const val = snapshot.requests.p95Ms || 0;
    if (val >= thresholds.p95Ms.critical) {
      alerts.push({ level: 'critical', metric: 'p95Ms', value: val, threshold: thresholds.p95Ms.critical, message: `P95 latency critical: ${val}ms` });
    } else if (val >= thresholds.p95Ms.warning) {
      alerts.push({ level: 'warning', metric: 'p95Ms', value: val, threshold: thresholds.p95Ms.warning, message: `P95 latency warning: ${val}ms` });
    }
  }

  // Cache hit rate (lower = worse)
  if (thresholds.cacheHitRate && snapshot.cache) {
    const rateStr = snapshot.cache.hitRate || '0%';
    const val = parseFloat(rateStr);
    if (!isNaN(val)) {
      if (val <= thresholds.cacheHitRate.critical) {
        alerts.push({ level: 'critical', metric: 'cacheHitRate', value: val, threshold: thresholds.cacheHitRate.critical, message: `Cache hit rate critical: ${val}%` });
      } else if (val <= thresholds.cacheHitRate.warning) {
        alerts.push({ level: 'warning', metric: 'cacheHitRate', value: val, threshold: thresholds.cacheHitRate.warning, message: `Cache hit rate warning: ${val}%` });
      }
    }
  }

  return alerts;
}

/**
 * Clean old snapshots beyond retention period
 * @returns {Promise<number>} count of deleted snapshots
 */
export async function cleanOldSnapshots() {
  if (!config.MONITORING || !config.MONITORING.retentionDays) return 0;

  const retentionMs = config.MONITORING.retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - retentionMs);
  let cleaned = 0;

  let files;
  try {
    files = await readdir(METRICS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }

  for (const file of files) {
    if (!file.startsWith('mtr_') || !file.endsWith('.json') || file.endsWith('.tmp')) continue;
    try {
      const filePath = join(METRICS_DIR, file);
      const data = await readJSON(filePath);
      if (data && data.timestamp && new Date(data.timestamp) < cutoff) {
        try { await unlink(filePath); } catch (_) {}
        cleaned++;
      }
    } catch (_) {
      // Skip individual file errors
    }
  }

  return cleaned;
}
