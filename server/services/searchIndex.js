// ═══════════════════════════════════════════════════════════════
// server/services/searchIndex.js — In-Memory Job Search Index
// ═══════════════════════════════════════════════════════════════
// Pre-normalized keyword index for fast text search.
// Build on startup, incremental updates via EventBus.
// Returns jobId[] — caller fetches full records.
// ~200 bytes per job → 10K jobs ≈ 2MB.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

/**
 * @type {Map<string, { normalizedTitle: string, normalizedDesc: string, status: string, category: string, governorate: string, dailyWage: number, createdAt: string }>}
 */
const index = new Map();

/** @type {string|null} */
let lastBuilt = null;

/**
 * Check if search index is enabled
 * @returns {boolean}
 */
function isEnabled() {
  return !!(config.SEARCH_INDEX && config.SEARCH_INDEX.enabled);
}

/**
 * Build (or rebuild) the entire search index from disk.
 * Async — reads all job files.
 * Called at startup and periodically as a safety net.
 *
 * @returns {Promise<number>} number of jobs indexed
 */
export async function buildIndex() {
  if (!isEnabled()) return 0;

  const { listAll } = await import('./jobs.js');
  const allJobs = await listAll();

  index.clear();

  for (const job of allJobs) {
    indexJob(job);
  }

  lastBuilt = new Date().toISOString();
  logger.info('Search index built', { size: index.size });

  return index.size;
}

/**
 * Add or update a single job in the index (sync).
 * Called after job creation.
 *
 * @param {object} job — full job object
 */
export function addToIndex(job) {
  if (!isEnabled()) return;
  if (!job || !job.id) return;
  indexJob(job);
}

/**
 * Remove a job from the index (sync).
 *
 * @param {string} jobId
 */
export function removeFromIndex(jobId) {
  if (!isEnabled()) return;
  index.delete(jobId);
}

/**
 * Update the status field of a job in the index (sync).
 *
 * @param {string} jobId
 * @param {string} status
 */
export function updateStatus(jobId, status) {
  if (!isEnabled()) return;
  const entry = index.get(jobId);
  if (entry) {
    entry.status = status;
  }
}

/**
 * Search the index for jobs matching a normalized query string.
 * Matches against normalizedTitle + normalizedDesc via includes().
 *
 * @param {string} normalizedQuery — pre-normalized search string
 * @param {{ status?: string, category?: string, governorate?: string }} filters
 * @returns {string[]} array of matching job IDs
 */
export function search(normalizedQuery, filters = {}) {
  if (!isEnabled()) return [];
  if (!normalizedQuery) return [];

  const results = [];

  for (const [jobId, entry] of index) {
    // Apply filters
    if (filters.status && entry.status !== filters.status) continue;
    if (filters.category && entry.category !== filters.category) continue;
    if (filters.governorate && entry.governorate !== filters.governorate) continue;

    // Text match
    if (entry.normalizedTitle.includes(normalizedQuery) ||
        entry.normalizedDesc.includes(normalizedQuery)) {
      results.push(jobId);
    }
  }

  return results;
}

/**
 * Get index statistics (sync).
 *
 * @returns {{ size: number, lastBuilt: string|null }}
 */
export function getStats() {
  return {
    size: index.size,
    lastBuilt,
  };
}

// ── Internal helper ──────────────────────────────────────────

/**
 * Index a single job (sync — normalizes once, stores in Map)
 * @param {object} job
 */
function indexJob(job) {
  index.set(job.id, {
    normalizedTitle: normalizeArabic((job.title || '').toLowerCase()),
    normalizedDesc: normalizeArabic((job.description || '').toLowerCase()),
    status: job.status,
    category: job.category,
    governorate: job.governorate,
    dailyWage: job.dailyWage,
    createdAt: job.createdAt,
  });
}

// ── EventBus integration ─────────────────────────────────────

if (isEnabled()) {
  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    // Fire-and-forget: load job and add to index
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job) addToIndex(job);
      }).catch(() => {});
    }).catch(() => {});
  });
}
