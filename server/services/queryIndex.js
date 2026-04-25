// ═══════════════════════════════════════════════════════════════
// server/services/queryIndex.js — In-Memory Materialized Views
// ═══════════════════════════════════════════════════════════════
// Map/Set-based indexes for O(1) multi-criteria job queries.
// Full rebuild at startup, incremental updates via EventBus.
// READ acceleration only — all writes still go to disk.
// Falls back gracefully if disabled or empty.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

// ── Data Structures ──────────────────────────────────────────

/** @type {Map<string, Set<string>>} status → Set of jobIds */
const jobsByStatus = new Map();

/** @type {Map<string, Set<string>>} governorate → Set of jobIds */
const jobsByGov = new Map();

/** @type {Map<string, Set<string>>} category → Set of jobIds */
const jobsByCategory = new Map();

/** @type {Map<string, Set<string>>} urgency → Set of jobIds */
const jobsByUrgency = new Map();

/** @type {Map<string, object>} jobId → summary object */
const jobsById = new Map();

/** @type {string|null} */
let lastBuilt = null;

// ── Helpers ──────────────────────────────────────────────────

function isEnabled() {
  return !!(config.QUERY_INDEX && config.QUERY_INDEX.enabled);
}

function addToMap(map, key, jobId) {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(jobId);
}

function removeFromMap(map, key, jobId) {
  if (!key) return;
  const set = map.get(key);
  if (set) {
    set.delete(jobId);
    if (set.size === 0) map.delete(key);
  }
}

function intersect(setA, setB) {
  if (!setA) return new Set();
  if (!setB) return new Set();
  const result = new Set();
  // Iterate over smaller set for efficiency
  const [smaller, larger] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  for (const item of smaller) {
    if (larger.has(item)) result.add(item);
  }
  return result;
}

// ── Core Operations ──────────────────────────────────────────

/**
 * Add a job to all indexes (sync).
 * @param {object} job — full or summary job object
 */
export function onJobCreated(job) {
  if (!isEnabled() || !job || !job.id) return;

  const summary = {
    id: job.id,
    status: job.status,
    governorate: job.governorate,
    category: job.category,
    urgency: job.urgency || 'normal',
    dailyWage: job.dailyWage,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt,
    employerId: job.employerId,
  };

  jobsById.set(job.id, summary);
  addToMap(jobsByStatus, summary.status, job.id);
  addToMap(jobsByGov, summary.governorate, job.id);
  addToMap(jobsByCategory, summary.category, job.id);
  addToMap(jobsByUrgency, summary.urgency, job.id);
}

/**
 * Update a job's status in the indexes (sync).
 * @param {string} jobId
 * @param {string} oldStatus
 * @param {string} newStatus
 */
export function onJobStatusChanged(jobId, oldStatus, newStatus) {
  if (!isEnabled() || !jobId) return;

  removeFromMap(jobsByStatus, oldStatus, jobId);
  addToMap(jobsByStatus, newStatus, jobId);

  const summary = jobsById.get(jobId);
  if (summary) {
    summary.status = newStatus;
  }
}

/**
 * Remove a job from all indexes (sync).
 * @param {string} jobId
 */
export function onJobRemoved(jobId) {
  if (!isEnabled() || !jobId) return;

  const summary = jobsById.get(jobId);
  if (!summary) return;

  removeFromMap(jobsByStatus, summary.status, jobId);
  removeFromMap(jobsByGov, summary.governorate, jobId);
  removeFromMap(jobsByCategory, summary.category, jobId);
  removeFromMap(jobsByUrgency, summary.urgency, jobId);
  jobsById.delete(jobId);
}

/**
 * Full rebuild from disk. Clears all indexes and repopulates.
 * @returns {Promise<number>} number of jobs indexed
 */
export async function buildAllIndexes() {
  if (!isEnabled()) return 0;

  // Clear all maps
  jobsByStatus.clear();
  jobsByGov.clear();
  jobsByCategory.clear();
  jobsByUrgency.clear();
  jobsById.clear();

  try {
    const { listAll } = await import('./jobs.js');
    const allJobs = await listAll();

    for (const job of allJobs) {
      onJobCreated(job);
    }

    lastBuilt = new Date().toISOString();
    return allJobs.length;
  } catch (err) {
    logger.warn('queryIndex buildAllIndexes error', { error: err.message });
    return 0;
  }
}

/**
 * Query jobs using Set intersection for multi-criteria filtering.
 * Returns array of matching jobIds.
 *
 * @param {{ status?: string, governorate?: string, category?: string, categories?: string, urgency?: string }} filters
 * @returns {string[]}
 */
export function queryJobs(filters = {}) {
  if (!isEnabled()) return [];

  const status = filters.status || 'open';

  // Start with status Set as base
  let result = jobsByStatus.get(status);
  if (!result || result.size === 0) return [];

  // Copy to avoid mutating the source Set
  result = new Set(result);

  // Intersect with governorate
  if (filters.governorate) {
    const govSet = jobsByGov.get(filters.governorate);
    if (!govSet || govSet.size === 0) return [];
    result = intersect(result, govSet);
  }

  // Intersect with category (single)
  if (filters.category) {
    const catSet = jobsByCategory.get(filters.category);
    if (!catSet || catSet.size === 0) return [];
    result = intersect(result, catSet);
  }

  // Multi-category: union of category Sets, then intersect
  if (filters.categories) {
    const cats = filters.categories.split(',').map(c => c.trim()).filter(Boolean);
    if (cats.length > 0) {
      const catUnion = new Set();
      for (const cat of cats) {
        const catSet = jobsByCategory.get(cat);
        if (catSet) {
          for (const id of catSet) catUnion.add(id);
        }
      }
      if (catUnion.size === 0) return [];
      result = intersect(result, catUnion);
    }
  }

  // Intersect with urgency
  if (filters.urgency) {
    const urgSet = jobsByUrgency.get(filters.urgency);
    if (!urgSet || urgSet.size === 0) return [];
    result = intersect(result, urgSet);
  }

  return Array.from(result);
}

/**
 * Get index statistics (sync).
 * @returns {{ totalJobs: number, lastBuilt: string|null, byStatus: object, byGovernorate: number, byCategory: number }}
 */
export function getStats() {
  const byStatus = {};
  for (const [status, set] of jobsByStatus) {
    byStatus[status] = set.size;
  }

  return {
    totalJobs: jobsById.size,
    lastBuilt,
    byStatus,
    byGovernorate: jobsByGov.size,
    byCategory: jobsByCategory.size,
  };
}

/**
 * Clear all indexes (for testing).
 */
export function clear() {
  jobsByStatus.clear();
  jobsByGov.clear();
  jobsByCategory.clear();
  jobsByUrgency.clear();
  jobsById.clear();
  lastBuilt = null;
}

// ── EventBus Integration ─────────────────────────────────────

if (isEnabled() && config.QUERY_INDEX.incrementalUpdates) {
  // Job created → add to 'open'
  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job) onJobCreated(job);
      }).catch(() => {});
    }).catch(() => {});
  });

  // Job filled (from applications.js accept)
  eventBus.on('job:filled', (data) => {
    if (data && data.jobId) onJobStatusChanged(data.jobId, 'open', 'filled');
  });

  // Job started
  eventBus.on('job:started', (data) => {
    if (data && data.jobId) onJobStatusChanged(data.jobId, 'filled', 'in_progress');
  });

  // Job completed
  eventBus.on('job:completed', (data) => {
    if (data && data.jobId) onJobStatusChanged(data.jobId, 'in_progress', 'completed');
  });

  // Job cancelled
  eventBus.on('job:cancelled', (data) => {
    if (data && data.jobId) onJobStatusChanged(data.jobId, 'open', 'cancelled');
  });

  // Job renewed
  eventBus.on('job:renewed', (data) => {
    if (data && data.jobId) {
      // Could be from 'expired' or 'cancelled' — remove old status, add 'open'
      const summary = jobsById.get(data.jobId);
      if (summary) {
        onJobStatusChanged(data.jobId, summary.status, 'open');
      }
    }
  });
}
