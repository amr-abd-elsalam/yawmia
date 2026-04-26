// ═══════════════════════════════════════════════════════════════
// server/services/liveFeed.js — Live Job Feed SSE Stream
// ═══════════════════════════════════════════════════════════════
// Per-connection filtered stream for online workers.
// Filters: governorate + categories + proximity (lat/lng/radius).
// Listens to job:created/filled/cancelled + instant_match:candidates.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { formatSSE } from './sseManager.js';
import { logger } from './logger.js';

/**
 * @typedef {object} LiveFeedConnection
 * @property {string} userId
 * @property {import('node:http').ServerResponse} res
 * @property {{ governorate?: string, categories?: string[], lat?: number, lng?: number, radiusKm?: number }} filters
 * @property {number} connectedAt
 */

/** @type {Map<string, Set<LiveFeedConnection>>} userId → Set of connections */
const liveFeedConnections = new Map();

/**
 * Register a live feed connection.
 * @param {string} userId
 * @param {import('node:http').ServerResponse} res
 * @param {object} filters
 */
export function registerConnection(userId, res, filters = {}) {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) return;

  if (!liveFeedConnections.has(userId)) {
    liveFeedConnections.set(userId, new Set());
  }

  const entry = {
    userId,
    res,
    filters: {
      governorate: filters.governorate || null,
      categories: Array.isArray(filters.categories) ? filters.categories : null,
      lat: typeof filters.lat === 'number' ? filters.lat : null,
      lng: typeof filters.lng === 'number' ? filters.lng : null,
      radiusKm: typeof filters.radiusKm === 'number' ? filters.radiusKm : config.LIVE_FEED.maxRadiusKm,
    },
    connectedAt: Date.now(),
  };

  liveFeedConnections.get(userId).add(entry);

  res.on('close', () => {
    const set = liveFeedConnections.get(userId);
    if (set) {
      set.delete(entry);
      if (set.size === 0) liveFeedConnections.delete(userId);
    }
  });
}

/**
 * Check if a job matches a connection's filters.
 * @param {object} job
 * @param {object} filters
 * @returns {boolean}
 */
function jobMatchesFilters(job, filters) {
  if (!job) return false;

  if (filters.governorate && job.governorate !== filters.governorate) return false;

  if (filters.categories && filters.categories.length > 0) {
    if (!filters.categories.includes(job.category)) return false;
  }

  if (typeof filters.lat === 'number' && typeof filters.lng === 'number' && filters.radiusKm) {
    try {
      // Lazy load geo (avoid circular issues)
      // We use sync resolveCoordinates — it's pure
      // eslint-disable-next-line global-require
      const geoMod = globalThis.__yawmiaGeoSync || null;
      // Fallback: attempt distance check inline using Haversine if coords resolvable
      const jLat = typeof job.lat === 'number' ? job.lat : null;
      const jLng = typeof job.lng === 'number' ? job.lng : null;
      if (jLat == null || jLng == null) return true; // no location → don't filter out
      const dLat = (jLat - filters.lat) * (Math.PI / 180);
      const dLng = (jLng - filters.lng) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(filters.lat * Math.PI / 180) * Math.cos(jLat * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const dist = 6371 * c;
      if (dist > filters.radiusKm) return false;
    } catch (_) { /* don't filter on error */ }
  }

  return true;
}

/**
 * Send an SSE event to a single connection.
 */
function sendToConnection(entry, eventType, data, eventId) {
  try {
    if (entry.res.writableEnded || entry.res.destroyed) return;
    entry.res.write(formatSSE(eventType, data, eventId));
  } catch (_) { /* ignore write errors */ }
}

/**
 * Broadcast a job:created event to matching connections.
 * @param {object} job
 */
export function broadcastJobCreated(job) {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) return;
  if (!job || !job.id) return;

  const summary = jobToSummary(job);

  for (const [, conns] of liveFeedConnections) {
    for (const entry of conns) {
      if (jobMatchesFilters(job, entry.filters)) {
        sendToConnection(entry, 'job_created', summary, 'lf-' + job.id);
      }
    }
  }
}

/**
 * Broadcast a job status update (filled/cancelled/expired) to all connections.
 * @param {string} jobId
 * @param {{ status: string }} update
 */
export function broadcastJobUpdate(jobId, update) {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) return;
  if (!jobId) return;

  for (const [, conns] of liveFeedConnections) {
    for (const entry of conns) {
      sendToConnection(entry, 'job_updated', { jobId, ...update }, 'lfu-' + jobId);
    }
  }
}

/**
 * Send instant_match_offer to a specific candidate worker.
 * @param {string} workerId
 * @param {object} payload
 */
export function sendInstantMatchOffer(workerId, payload) {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) return;

  const conns = liveFeedConnections.get(workerId);
  if (!conns || conns.size === 0) return;

  for (const entry of conns) {
    sendToConnection(entry, 'instant_match_offer', payload, 'imo-' + payload.matchId);
  }
}

/**
 * Notify other candidates that an offer was taken (close their modals).
 * @param {string[]} workerIds
 * @param {object} payload
 */
export function notifyOfferTaken(workerIds, payload) {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) return;
  if (!Array.isArray(workerIds)) return;

  for (const workerId of workerIds) {
    const conns = liveFeedConnections.get(workerId);
    if (!conns || conns.size === 0) continue;
    for (const entry of conns) {
      sendToConnection(entry, 'instant_match_taken', payload, 'imt-' + payload.matchId);
    }
  }
}

/**
 * Get initial dump of nearby jobs for a worker on connection.
 * @param {string} userId
 * @param {object} filters
 * @returns {Promise<object[]>}
 */
export async function getInitialDump(userId, filters = {}) {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) return [];

  try {
    const { list } = await import('./jobs.js');
    const queryFilters = { status: 'open' };

    if (filters.governorate) queryFilters.governorate = filters.governorate;
    if (filters.categories && filters.categories.length > 0) {
      queryFilters.categories = filters.categories.join(',');
    }
    if (typeof filters.lat === 'number' && typeof filters.lng === 'number') {
      queryFilters.lat = filters.lat;
      queryFilters.lng = filters.lng;
      queryFilters.radius = filters.radiusKm || config.LIVE_FEED.maxRadiusKm;
    }

    const jobs = await list(queryFilters);
    const limit = config.LIVE_FEED.initialDumpSize;
    return jobs.slice(0, limit).map(jobToSummary);
  } catch (err) {
    logger.warn('liveFeed initial dump error', { userId, error: err.message });
    return [];
  }
}

/**
 * Convert full job to live feed summary.
 */
function jobToSummary(job) {
  return {
    id: job.id,
    title: job.title,
    category: job.category,
    governorate: job.governorate,
    dailyWage: job.dailyWage,
    workersNeeded: job.workersNeeded,
    workersAccepted: job.workersAccepted,
    durationDays: job.durationDays,
    startDate: job.startDate,
    urgency: job.urgency || 'normal',
    status: job.status,
    createdAt: job.createdAt,
    distance: job._distance != null ? job._distance : null,
  };
}

/**
 * Get aggregate live feed stats.
 * @returns {{ connections: number, users: number }}
 */
export function getStats() {
  let total = 0;
  for (const [, conns] of liveFeedConnections) total += conns.size;
  return { connections: total, users: liveFeedConnections.size };
}

/**
 * Clear all connections (for testing).
 */
export function clearConnections() {
  for (const [, conns] of liveFeedConnections) {
    for (const entry of conns) {
      try { entry.res.end(); } catch (_) {}
    }
  }
  liveFeedConnections.clear();
}

/**
 * Setup EventBus listeners — call once at startup (from router.js).
 */
export function setupLiveFeedListeners() {
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) {
    logger.info('Live feed: disabled via config');
    return;
  }

  // Job created → broadcast to matching connections
  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job && job.status === 'open') broadcastJobCreated(job);
      }).catch(() => {});
    }).catch(() => {});
  });

  // Job filled → broadcast update
  eventBus.on('job:filled', (data) => {
    if (data && data.jobId) broadcastJobUpdate(data.jobId, { status: 'filled' });
  });

  // Job cancelled → broadcast update
  eventBus.on('job:cancelled', (data) => {
    if (data && data.jobId) broadcastJobUpdate(data.jobId, { status: 'cancelled' });
  });

  // Job started → broadcast update (workers know it's no longer accepting)
  eventBus.on('job:started', (data) => {
    if (data && data.jobId) broadcastJobUpdate(data.jobId, { status: 'in_progress' });
  });

  // Job completed → broadcast update
  eventBus.on('job:completed', (data) => {
    if (data && data.jobId) broadcastJobUpdate(data.jobId, { status: 'completed' });
  });

  // Instant match candidates selected → send offer to each via SSE + Push
  eventBus.on('instant_match:candidates', (data) => {
    if (!data || !data.candidateWorkerIds || !Array.isArray(data.candidateWorkerIds)) return;

    const offerPayload = {
      matchId: data.matchId,
      jobId: data.jobId,
      job: data.jobSummary,
      acceptanceWindowSeconds: data.acceptanceWindowSeconds,
      notifiedAt: new Date().toISOString(),
    };

    // Send SSE to each candidate
    for (const workerId of data.candidateWorkerIds) {
      sendInstantMatchOffer(workerId, offerPayload);
    }

    // Web Push (fire-and-forget) — only if enabled
    if (config.INSTANT_MATCH && Array.isArray(config.INSTANT_MATCH.notifyChannels) && config.INSTANT_MATCH.notifyChannels.includes('push')) {
      import('./webpush.js').then(({ sendPushToMany }) => {
        const title = 'يوميّة — فرصة فورية ⚡';
        const body = (data.jobSummary && data.jobSummary.title)
          ? `${data.jobSummary.title} — ${data.jobSummary.dailyWage} جنيه`
          : 'فرصة عمل فورية متاحة لك دلوقتي';
        sendPushToMany(data.candidateWorkerIds, {
          title,
          body,
          icon: '/assets/img/icon-192.png',
          url: '/dashboard.html',
        }).catch(() => {});
      }).catch(() => {});
    }
  });

  // Instant match accepted → notify other candidates
  eventBus.on('instant_match:accepted', (data) => {
    if (!data || !Array.isArray(data.otherCandidateIds)) return;
    notifyOfferTaken(data.otherCandidateIds, {
      matchId: data.matchId,
      jobId: data.jobId,
    });
  });

  // Instant match expired → notify all candidates (close their modals)
  eventBus.on('instant_match:expired', (data) => {
    if (!data || !data.matchId) return;
    // Find candidates from match record
    import('./instantMatch.js').then(({ findById }) => {
      findById(data.matchId).then(match => {
        if (match && Array.isArray(match.candidateWorkerIds)) {
          notifyOfferTaken(match.candidateWorkerIds, {
            matchId: data.matchId,
            jobId: data.jobId,
            reason: 'expired',
          });
        }
      }).catch(() => {});
    }).catch(() => {});
  });

  logger.info('Live feed: enabled');
}

/**
 * Exposed for testing.
 */
export const _testHelpers = { liveFeedConnections, jobMatchesFilters, jobToSummary };
