// ═══════════════════════════════════════════════════════════════
// server/services/counterCompaction.js — Counter File Hygiene (Phase 50)
// ═══════════════════════════════════════════════════════════════
// Safely compacts direct-offer counter file:
//   - forceFlush pending batched events first
//   - use same direct-offer counter lock
//   - prune stale hourly buckets
//   - remove empty hourlyBuckets objects
//   - archive inactive entity stats
//   - preserve platform totals exactly
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON } from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';
import {
  COUNTER_LOCK_KEY,
  forceFlush,
  readCounters,
  writeCounters,
  getFileSize,
} from './directOfferCounters.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

let lastCompactionStats = null;

function isEnabled() {
  return !!(config.COUNTER_HYGIENE && config.COUNTER_HYGIENE.enabled);
}

function hourKeyToMs(hourKey) {
  return new Date(hourKey + ':00:00Z').getTime();
}

function getLatestEntityActivity(entity) {
  if (!entity) return 0;

  if (entity.lastOfferAt) {
    const ms = new Date(entity.lastOfferAt).getTime();
    if (!Number.isNaN(ms)) return ms;
  }

  if (entity.hourlyBuckets) {
    let latest = 0;
    for (const key of Object.keys(entity.hourlyBuckets)) {
      latest = Math.max(latest, hourKeyToMs(key));
    }
    return latest;
  }

  return 0;
}

function pruneBucketObject(bucketObj, cutoffMs) {
  if (!bucketObj || typeof bucketObj !== 'object') return 0;
  let removed = 0;
  for (const key of Object.keys(bucketObj)) {
    const ms = hourKeyToMs(key);
    if (ms < cutoffMs) {
      delete bucketObj[key];
      removed++;
    }
  }
  return removed;
}

function archiveFilePath(kind) {
  const month = new Date().toISOString().slice(0, 7);
  const archiveRel = config.COUNTER_HYGIENE.archivePath || 'metrics/counter-archives';
  return join(BASE_PATH, archiveRel, `${kind}-${month}.json`);
}

async function appendArchive(kind, id, data) {
  if (!config.COUNTER_HYGIENE.archiveEnabled) return;

  const filePath = archiveFilePath(kind);
  const existing = (await readJSON(filePath).catch(() => null)) || {
    kind,
    month: new Date().toISOString().slice(0, 7),
    archivedAt: new Date().toISOString(),
    entries: {},
  };

  existing.entries[id] = {
    ...data,
    archivedAt: new Date().toISOString(),
  };

  await atomicWrite(filePath, existing);
}

/**
 * Compact counters file.
 */
export async function compactCounters(options = {}) {
  if (!isEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  const started = Date.now();

  eventBus.emit('counters:compaction_started', {
    timestamp: new Date().toISOString(),
  });

  try {
    await forceFlush();

    const beforeSizeBytes = await getFileSize();

    const result = await withLock(COUNTER_LOCK_KEY, async () => {
      const counters = await readCounters();

      // Preserve platform totals exactly.
      const platformBefore = JSON.stringify(counters.platform || {});

      const retentionHours = config.COUNTERS?.hourlyBucketsRetentionHours || 48;
      const cutoffMs = Date.now() - retentionHours * 60 * 60 * 1000;

      let removedPlatformBuckets = 0;
      let removedEmployerBuckets = 0;
      let removedWorkerBuckets = 0;
      let archivedEmployers = 0;
      let archivedWorkers = 0;

      removedPlatformBuckets += pruneBucketObject(counters.hourlyBuckets, cutoffMs);

      for (const [empId, entity] of Object.entries(counters.byEmployer || {})) {
        if (entity.hourlyBuckets) {
          removedEmployerBuckets += pruneBucketObject(entity.hourlyBuckets, cutoffMs);
          if (Object.keys(entity.hourlyBuckets).length === 0) {
            delete entity.hourlyBuckets;
          }
        }
      }

      for (const [workerId, entity] of Object.entries(counters.byWorker || {})) {
        if (entity.hourlyBuckets) {
          removedWorkerBuckets += pruneBucketObject(entity.hourlyBuckets, cutoffMs);
          if (Object.keys(entity.hourlyBuckets).length === 0) {
            delete entity.hourlyBuckets;
          }
        }
      }

      // Archive inactive entities.
      const inactiveDays = options.inactiveEntityDays || config.COUNTER_HYGIENE.inactiveEntityDays || 90;
      const inactiveCutoff = Date.now() - inactiveDays * 24 * 60 * 60 * 1000;
      const maxEntities = options.maxEntitiesPerCompactRun || config.COUNTER_HYGIENE.maxEntitiesPerCompactRun || 10000;

      let processed = 0;

      for (const [empId, entity] of Object.entries(counters.byEmployer || {})) {
        if (processed >= maxEntities) break;
        processed++;

        const lastMs = getLatestEntityActivity(entity);
        if (lastMs > 0 && lastMs < inactiveCutoff) {
          await appendArchive('employer', empId, entity);
          delete counters.byEmployer[empId];
          archivedEmployers++;
        }
      }

      processed = 0;
      for (const [workerId, entity] of Object.entries(counters.byWorker || {})) {
        if (processed >= maxEntities) break;
        processed++;

        const lastMs = getLatestEntityActivity(entity);
        if (lastMs > 0 && lastMs < inactiveCutoff) {
          await appendArchive('worker', workerId, entity);
          delete counters.byWorker[workerId];
          archivedWorkers++;
        }
      }

      // Hard guard: platform totals must not drift.
      const platformAfter = JSON.stringify(counters.platform || {});
      if (platformBefore !== platformAfter) {
        throw new Error('Counter compaction attempted to modify platform totals');
      }

      counters.lastCompactedAt = new Date().toISOString();
      await writeCounters(counters);

      const afterSizeBytes = await getFileSize();

      return {
        beforeSizeBytes,
        afterSizeBytes,
        removedPlatformBuckets,
        removedEmployerBuckets,
        removedWorkerBuckets,
        archivedEmployers,
        archivedWorkers,
        durationMs: Date.now() - started,
      };
    });

    lastCompactionStats = {
      ...result,
      completedAt: new Date().toISOString(),
    };

    eventBus.emit('counters:compaction_completed', lastCompactionStats);

    logger.info('Counter compaction complete', lastCompactionStats);

    return lastCompactionStats;
  } catch (err) {
    const failure = {
      error: err.message,
      durationMs: Date.now() - started,
      failedAt: new Date().toISOString(),
    };

    lastCompactionStats = failure;
    eventBus.emit('counters:compaction_failed', failure);
    logger.warn('Counter compaction failed', failure);

    throw err;
  }
}

/**
 * Maybe compact based on monitor snapshot/file size.
 */
export async function maybeCompactCounters(snapshot) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };
  if (!config.COUNTER_HYGIENE.compactOnSnapshot) return { skipped: true, reason: 'compact_on_snapshot_disabled' };

  const sizeMB = snapshot && typeof snapshot.counterFileSizeMB === 'number'
    ? snapshot.counterFileSizeMB
    : +(await getFileSize() / 1048576).toFixed(2);

  const threshold = config.COUNTER_HYGIENE.compactIfFileSizeMB || 40;
  if (sizeMB < threshold) {
    return { skipped: true, reason: 'below_threshold', sizeMB, threshold };
  }

  return await compactCounters();
}

export function getLastCompactionStats() {
  return lastCompactionStats;
}

export const _testHelpers = {
  pruneBucketObject,
  getLatestEntityActivity,
  hourKeyToMs,
};
