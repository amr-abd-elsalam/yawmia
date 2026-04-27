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

// ── Data Structures (Jobs) ───────────────────────────────────

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

// ── Data Structures (Ads — Phase 41) ─────────────────────────

/** @type {Map<string, Set<string>>} governorate → Set of adIds */
const adsByGovernorate = new Map();

/** @type {Map<string, Set<string>>} category → Set of adIds */
const adsByCategory = new Map();

/** @type {Set<string>} only ads with status='active' */
const adsActive = new Set();

/** @type {Map<string, object>} adId → summary object */
const adsById = new Map();

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

// ── Ads Index Operations (Phase 41) ──────────────────────────

/**
 * Add an availability ad to all indexes (sync).
 * @param {object} ad — full or summary ad object
 */
export function onAdCreated(ad) {
  if (!isEnabled() || !ad || !ad.id) return;

  const summary = {
    id: ad.id,
    workerId: ad.workerId,
    status: ad.status,
    governorate: ad.governorate,
    categories: Array.isArray(ad.categories) ? ad.categories.slice() : [],
    minDailyWage: ad.minDailyWage,
    maxDailyWage: ad.maxDailyWage,
    availableFrom: ad.availableFrom,
    availableUntil: ad.availableUntil,
    createdAt: ad.createdAt,
  };

  adsById.set(ad.id, summary);
  addToMap(adsByGovernorate, summary.governorate, ad.id);
  for (const cat of summary.categories) {
    addToMap(adsByCategory, cat, ad.id);
  }
  if (summary.status === 'active') {
    adsActive.add(ad.id);
  }
}

/**
 * Update an ad's status in indexes (sync).
 * Only the adsActive Set tracks status — gov/category Maps keep all ads for history.
 * @param {string} adId
 * @param {string} newStatus
 */
export function onAdStatusChanged(adId, newStatus) {
  if (!isEnabled() || !adId) return;
  const summary = adsById.get(adId);
  if (!summary) return;

  summary.status = newStatus;
  if (newStatus === 'active') {
    adsActive.add(adId);
  } else {
    adsActive.delete(adId);
  }
}

/**
 * Remove an ad from all indexes (sync) — used only for hard delete.
 * Normal lifecycle uses onAdStatusChanged (keep history).
 * @param {string} adId
 */
export function onAdRemoved(adId) {
  if (!isEnabled() || !adId) return;
  const summary = adsById.get(adId);
  if (!summary) return;

  removeFromMap(adsByGovernorate, summary.governorate, adId);
  for (const cat of summary.categories) {
    removeFromMap(adsByCategory, cat, adId);
  }
  adsActive.delete(adId);
  adsById.delete(adId);
}

/**
 * Query active ads using Set intersection.
 *
 * @param {{ governorate?: string, categories?: string[] }} filters
 * @returns {string[]} — array of matching adIds (active only)
 */
export function queryAds(filters = {}) {
  if (!isEnabled()) return [];

  // Start with active ads as base
  let result = adsActive;
  if (!result || result.size === 0) return [];

  // Copy to avoid mutating source
  result = new Set(result);

  // Intersect with governorate
  if (filters.governorate) {
    const govSet = adsByGovernorate.get(filters.governorate);
    if (!govSet || govSet.size === 0) return [];
    result = intersect(result, govSet);
    if (result.size === 0) return [];
  }

  // Intersect with categories (union of cat Sets, then intersect)
  if (filters.categories && Array.isArray(filters.categories) && filters.categories.length > 0) {
    const catUnion = new Set();
    for (const cat of filters.categories) {
      const catSet = adsByCategory.get(cat);
      if (catSet) {
        for (const id of catSet) catUnion.add(id);
      }
    }
    if (catUnion.size === 0) return [];
    result = intersect(result, catUnion);
    if (result.size === 0) return [];
  }

  return Array.from(result);
}

/**
 * Full rebuild from disk. Clears all indexes and repopulates.
 * @returns {Promise<number>} number of jobs indexed
 */
export async function buildAllIndexes() {
  if (!isEnabled()) return 0;

  // Clear all jobs maps
  jobsByStatus.clear();
  jobsByGov.clear();
  jobsByCategory.clear();
  jobsByUrgency.clear();
  jobsById.clear();

  // Clear all ads maps
  adsByGovernorate.clear();
  adsByCategory.clear();
  adsActive.clear();
  adsById.clear();

  let jobsCount = 0;

  try {
    const { listAll } = await import('./jobs.js');
    const allJobs = await listAll();
    for (const job of allJobs) {
      onJobCreated(job);
    }
    jobsCount = allJobs.length;
  } catch (err) {
    logger.warn('queryIndex buildAllIndexes (jobs) error', { error: err.message });
  }

  // Phase 41 — also build ads index
  try {
    const { listAll: listAllAds } = await import('./availabilityAd.js');
    const allAds = await listAllAds();
    for (const ad of allAds) {
      onAdCreated(ad);
    }
  } catch (err) {
    logger.warn('queryIndex buildAllIndexes (ads) error', { error: err.message });
  }

  lastBuilt = new Date().toISOString();
  return jobsCount;
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
 * @returns {{ totalJobs: number, lastBuilt: string|null, byStatus: object, byGovernorate: number, byCategory: number, totalAds: number, activeAds: number, adsByGovernorate: number, adsByCategory: number }}
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
    // Phase 41 — Ads stats
    totalAds: adsById.size,
    activeAds: adsActive.size,
    adsByGovernorate: adsByGovernorate.size,
    adsByCategory: adsByCategory.size,
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
  adsByGovernorate.clear();
  adsByCategory.clear();
  adsActive.clear();
  adsById.clear();
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

  // Phase 41 — Ad lifecycle listeners

  // Ad created → add to ads indexes
  eventBus.on('ad:created', (data) => {
    if (!data || !data.adId) return;
    import('./availabilityAd.js').then(({ findById }) => {
      findById(data.adId).then(ad => {
        if (ad) onAdCreated(ad);
      }).catch(() => {});
    }).catch(() => {});
  });

  // Ad withdrawn → remove from active set
  eventBus.on('ad:withdrawn', (data) => {
    if (data && data.adId) onAdStatusChanged(data.adId, 'withdrawn');
  });

  // Ad expired → remove from active set
  eventBus.on('ad:expired', (data) => {
    if (data && data.adId) onAdStatusChanged(data.adId, 'expired');
  });

  // Ad matched (Phase 42 will fire this) → remove from active set
  eventBus.on('ad:matched', (data) => {
    if (data && data.adId) onAdStatusChanged(data.adId, 'matched');
  });
}
