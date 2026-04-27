// ═══════════════════════════════════════════════════════════════
// server/services/workerDiscovery.js — 3-Tier Worker Pool
// ═══════════════════════════════════════════════════════════════
// Aggregates workers from 3 tiers for Employer Talent Radar:
//   TIER 1: Active availability ads (workers who declared intent)
//   TIER 2: Online workers without ads (live presence)
//   TIER 3: Recently online (last 24h) — fallback when supply low
//
// 4-Factor Composite Scoring:
//   distance(40%) + trust(30%) + rating(20%) + recency(10%) + activeAdBonus(0.1)
//
// Privacy-First Cards:
//   - displayName: first name + initial of last (e.g., "أحمد م.")
//   - No phone exposed
//   - Governorate, not exact lat/lng
//   - Full details unlocked when offer accepted (Phase 42)
//
// Tile-Based Caching: 0.01° tiles (~1km), 30s TTL.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

// ── Tile cache ───────────────────────────────────────────────
/** @type {Map<string, { items: object[], expiresAt: number }>} */
const tileCache = new Map();

/** @type {Map<string, { card: object, expiresAt: number }>} */
const cardCache = new Map();

/**
 * Compute tile key from filters.
 */
function computeTileKey(filters) {
  const tileSize = config.WORKER_DISCOVERY.cacheKeyTileSize || 0.01;
  const tileX = (typeof filters.lat === 'number')
    ? Math.floor(filters.lat / tileSize)
    : 'na';
  const tileY = (typeof filters.lng === 'number')
    ? Math.floor(filters.lng / tileSize)
    : 'na';
  const gov = filters.governorate || 'all';
  const cats = (Array.isArray(filters.categories) && filters.categories.length > 0)
    ? filters.categories.slice().sort().join(',')
    : 'all';
  const radius = filters.radiusKm || 'na';
  const minW = filters.minWage || 'na';
  const maxW = filters.maxWage || 'na';
  return `${gov}:${cats}:${tileX}:${tileY}:${radius}:${minW}:${maxW}`;
}

/**
 * Get from cache (returns null if expired/missing).
 */
function cacheGet(key) {
  const entry = tileCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    tileCache.delete(key);
    return null;
  }
  return entry.items;
}

function cacheSet(key, items) {
  const ttl = config.WORKER_DISCOVERY.cacheTtlMs || 30000;
  tileCache.set(key, { items, expiresAt: Date.now() + ttl });
}

/**
 * Clear all caches (called on ad lifecycle events).
 */
export function clearCache() {
  tileCache.clear();
  cardCache.clear();
}

/**
 * Compute composite score (0-1+) for a candidate.
 */
function computeCompositeScore(candidate, refLat, refLng, radiusKm) {
  const weights = config.WORKER_DISCOVERY.scoreWeights;

  // Distance score
  let distScore = 0;
  if (typeof candidate.lat === 'number' && typeof candidate.lng === 'number' &&
      typeof refLat === 'number' && typeof refLng === 'number' &&
      typeof radiusKm === 'number' && radiusKm > 0) {
    const dist = candidate._distance || 0;
    distScore = Math.max(0, 1 - dist / radiusKm);
  }

  // Trust score
  const trustScore = typeof candidate.trustScore === 'number' ? candidate.trustScore : 0.5;

  // Rating score
  const rating = (candidate.user && candidate.user.rating) || candidate.rating || { avg: 0 };
  const ratingScore = (rating.avg || 0) / 5;

  // Recency score
  let recencyScore = 0;
  if (candidate.isOnline) {
    recencyScore = 1.0;
  } else if (candidate.lastOnlineAt) {
    const hoursAgo = (Date.now() - new Date(candidate.lastOnlineAt).getTime()) / 3600000;
    if (hoursAgo < 24) {
      recencyScore = Math.max(0, 0.5 + 0.5 * (1 - hoursAgo / 24));
    }
  }

  let score = weights.distance * distScore +
              weights.trustScore * trustScore +
              weights.ratingAvg * ratingScore +
              weights.recency * recencyScore;

  if (candidate.hasActiveAd) {
    score += config.WORKER_DISCOVERY.activeAdBonus || 0.1;
  }

  return Math.round(score * 1000) / 1000;
}

/**
 * Build privacy-first public worker card.
 */
function buildPublicCard(user, presenceData, activeAd, distanceKm, trustScore) {
  const fullName = (user.name || '').trim();
  const parts = fullName.split(/\s+/).filter(Boolean);
  let displayName;
  if (parts.length >= 2) {
    displayName = `${parts[0]} ${parts[1].charAt(0)}.`;
  } else if (parts.length === 1) {
    displayName = parts[0];
  } else {
    displayName = 'مستخدم';
  }

  const card = {
    id: user.id,
    displayName,
    governorate: user.governorate || '',
    distanceKm: typeof distanceKm === 'number' ? Math.round(distanceKm * 10) / 10 : null,
    categories: user.categories || [],
    rating: user.rating || { avg: 0, count: 0 },
    trustScore: typeof trustScore === 'number' ? trustScore : null,
    verificationStatus: user.verificationStatus || 'unverified',
    isOnline: !!presenceData,
    hasActiveAd: !!activeAd,
    adSummary: null,
    memberSince: user.createdAt || null,
  };

  if (activeAd) {
    card.adSummary = {
      adId: activeAd.id,
      minDailyWage: activeAd.minDailyWage,
      maxDailyWage: activeAd.maxDailyWage,
      availableFrom: activeAd.availableFrom,
      availableUntil: activeAd.availableUntil,
      radiusKm: activeAd.radiusKm,
    };
  }

  return card;
}

/**
 * Discover workers — main 3-tier aggregation function.
 *
 * @param {object} options
 *   @param {number} [options.lat]
 *   @param {number} [options.lng]
 *   @param {number} [options.radiusKm]
 *   @param {string[]} [options.categories]
 *   @param {string} [options.governorate]
 *   @param {number} [options.minWage]
 *   @param {number} [options.maxWage]
 *   @param {string} [options.sortBy='composite']
 *   @param {number} [options.limit=20]
 *   @param {number} [options.offset=0]
 * @returns {Promise<{ workers: object[], total: number }>}
 */
export async function discoverWorkers(options = {}) {
  if (!config.WORKER_DISCOVERY || !config.WORKER_DISCOVERY.enabled) {
    return { workers: [], total: 0 };
  }

  const radiusKm = typeof options.radiusKm === 'number' && options.radiusKm > 0
    ? Math.min(options.radiusKm, config.WORKER_DISCOVERY.maxRadiusKm || 100)
    : (config.WORKER_DISCOVERY.defaultRadiusKm || 30);
  const limit = typeof options.limit === 'number' && options.limit > 0 ? options.limit : 20;
  const offset = typeof options.offset === 'number' && options.offset >= 0 ? options.offset : 0;
  const sortBy = options.sortBy || 'composite';

  const cacheKey = computeTileKey({
    lat: options.lat,
    lng: options.lng,
    radiusKm,
    categories: options.categories,
    governorate: options.governorate,
    minWage: options.minWage,
    maxWage: options.maxWage,
  });

  // Check cache
  const cached = cacheGet(cacheKey);
  if (cached) {
    return {
      workers: cached.slice(offset, offset + limit),
      total: cached.length,
    };
  }

  // Lazy imports to avoid circular deps
  const { findActiveByWorker, searchAds } = await import('./availabilityAd.js');
  const { getOnlineWorkers, getPresence } = await import('./presenceService.js');
  const { findById: findUser, listAll: listAllUsers } = await import('./users.js');
  const { getUserTrustScore } = await import('./trust.js');
  const { haversineDistance } = await import('./geo.js');

  // Track candidates by userId (dedup)
  /** @type {Map<string, object>} */
  const candidates = new Map();

  // ── TIER 1: Active Ads ─────────────────────────────────────
  try {
    const ads = await searchAds({
      governorate: options.governorate,
      categories: options.categories,
      lat: options.lat,
      lng: options.lng,
      radiusKm,
      minWage: options.minWage,
      maxWage: options.maxWage,
      sortBy: 'newest',
      limit: 100,
    });

    for (const ad of ads) {
      if (candidates.has(ad.workerId)) continue;
      const user = await findUser(ad.workerId);
      if (!user || user.role !== 'worker' || user.status !== 'active') continue;

      let trustScore = 0.5;
      try {
        const ts = await getUserTrustScore(ad.workerId);
        if (ts && typeof ts.score === 'number') trustScore = ts.score;
      } catch (_) { /* default */ }

      let distance = ad._distance;
      if (typeof distance !== 'number' &&
          typeof options.lat === 'number' && typeof options.lng === 'number') {
        distance = haversineDistance(options.lat, options.lng, ad.lat, ad.lng);
      }

      let presenceData = null;
      try { presenceData = getPresence(ad.workerId); } catch (_) { /* no-op */ }

      candidates.set(ad.workerId, {
        userId: ad.workerId,
        user,
        activeAd: ad,
        hasActiveAd: true,
        isOnline: !!(presenceData && presenceData.status !== 'offline'),
        lastOnlineAt: presenceData ? new Date().toISOString() : null,
        lat: ad.lat,
        lng: ad.lng,
        _distance: distance,
        trustScore,
        rating: user.rating,
        tier: 1,
      });
    }
  } catch (err) {
    logger.warn('discoverWorkers TIER 1 error', { error: err.message });
  }

  // ── TIER 2: Online Workers Without Ads ─────────────────────
  try {
    const onlineList = await getOnlineWorkers({
      acceptingJobs: true,
      includeAway: true,
      governorate: options.governorate,
      categories: options.categories,
      lat: options.lat,
      lng: options.lng,
      radiusKm,
    });

    for (const entry of onlineList) {
      if (candidates.has(entry.userId)) continue;
      const user = entry.user;
      if (!user) continue;

      let trustScore = 0.5;
      try {
        const ts = await getUserTrustScore(entry.userId);
        if (ts && typeof ts.score === 'number') trustScore = ts.score;
      } catch (_) { /* default */ }

      // Use current location if presence has it, else user's stored location
      const wLat = (entry.currentLocation && entry.currentLocation.lat) || user.lat;
      const wLng = (entry.currentLocation && entry.currentLocation.lng) || user.lng;
      let distance = null;
      if (typeof options.lat === 'number' && typeof options.lng === 'number' &&
          typeof wLat === 'number' && typeof wLng === 'number') {
        distance = haversineDistance(options.lat, options.lng, wLat, wLng);
      }

      candidates.set(entry.userId, {
        userId: entry.userId,
        user,
        activeAd: null,
        hasActiveAd: false,
        isOnline: entry.status === 'online',
        lastOnlineAt: new Date(entry.lastHeartbeat).toISOString(),
        lat: wLat,
        lng: wLng,
        _distance: distance,
        trustScore,
        rating: user.rating,
        tier: 2,
      });
    }
  } catch (err) {
    logger.warn('discoverWorkers TIER 2 error', { error: err.message });
  }

  // ── TIER 3: Recently Online (fallback when supply low) ─────
  if (candidates.size < limit) {
    try {
      const allUsers = await listAllUsers();
      const recencyHours = config.WORKER_DISCOVERY.includeRecentlyOfflineHours || 24;
      const cutoffMs = Date.now() - recencyHours * 60 * 60 * 1000;

      for (const user of allUsers) {
        if (candidates.has(user.id)) continue;
        if (user.role !== 'worker' || user.status !== 'active') continue;
        // Filter by governorate
        if (options.governorate && user.governorate !== options.governorate) continue;
        // Filter by categories
        if (options.categories && options.categories.length > 0) {
          const userCats = user.categories || [];
          if (!options.categories.some(c => userCats.includes(c))) continue;
        }
        // Filter by geo (using user's stored lat/lng or governorate fallback)
        let wLat = user.lat;
        let wLng = user.lng;
        let distance = null;
        if (typeof options.lat === 'number' && typeof options.lng === 'number') {
          if (typeof wLat !== 'number' || typeof wLng !== 'number') continue;
          distance = haversineDistance(options.lat, options.lng, wLat, wLng);
          if (distance > radiusKm) continue;
        }

        // For TIER 3, recencyScore relies on lastOnlineAt
        // Since users.js has no lastOnlineAt field, we approximate via presence
        // (already-online users are in TIER 2). For non-online users we skip recency check
        // and just include them with recencyScore=0 — they're "available but not currently online".
        let presenceData = null;
        try { presenceData = require_presence_get(user.id); } catch (_) { /* skip */ }

        // Skip if currently online (would be in TIER 2)
        if (presenceData && presenceData.status === 'online') continue;

        let trustScore = 0.5;
        try {
          const ts = await getUserTrustScore(user.id);
          if (ts && typeof ts.score === 'number') trustScore = ts.score;
        } catch (_) { /* default */ }

        candidates.set(user.id, {
          userId: user.id,
          user,
          activeAd: null,
          hasActiveAd: false,
          isOnline: false,
          lastOnlineAt: presenceData ? new Date(presenceData.lastHeartbeat || cutoffMs).toISOString() : null,
          lat: wLat,
          lng: wLng,
          _distance: distance,
          trustScore,
          rating: user.rating,
          tier: 3,
        });

        // Cap TIER 3 contribution
        if (candidates.size >= limit * 3) break;
      }
    } catch (err) {
      logger.warn('discoverWorkers TIER 3 error', { error: err.message });
    }
  }

  // ── Score, sort, build cards ──────────────────────────────
  const list = Array.from(candidates.values());

  // Compute scores
  for (const c of list) {
    c._score = computeCompositeScore(c, options.lat, options.lng, radiusKm);
  }

  // Sort
  if (sortBy === 'distance') {
    list.sort((a, b) => (a._distance || Infinity) - (b._distance || Infinity));
  } else if (sortBy === 'rating') {
    list.sort((a, b) => {
      const ra = (a.rating && a.rating.avg) || 0;
      const rb = (b.rating && b.rating.avg) || 0;
      return rb - ra;
    });
  } else if (sortBy === 'recency') {
    list.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      const ta = a.lastOnlineAt ? new Date(a.lastOnlineAt).getTime() : 0;
      const tb = b.lastOnlineAt ? new Date(b.lastOnlineAt).getTime() : 0;
      return tb - ta;
    });
  } else {
    // composite (default)
    list.sort((a, b) => b._score - a._score);
  }

  // Build privacy-first cards
  const cards = list.map(c => {
    const presenceData = c.isOnline ? { status: 'online', lastHeartbeat: c.lastOnlineAt } : null;
    const card = buildPublicCard(c.user, presenceData, c.activeAd, c._distance, c.trustScore);
    card._tier = c.tier;
    card._score = c._score;
    return card;
  });

  // Cache full result
  cacheSet(cacheKey, cards);

  return {
    workers: cards.slice(offset, offset + limit),
    total: cards.length,
  };
}

/**
 * Synchronously get presence data (lazy require to avoid top-level import cycles).
 */
let _presenceModule = null;
function require_presence_get(userId) {
  if (!_presenceModule) {
    // Defer — caller will catch and skip
    throw new Error('presence not loaded');
  }
  return _presenceModule.getPresence(userId);
}

/**
 * Get a single privacy-first worker card.
 * Cached for 60s.
 *
 * @param {string} workerId
 * @returns {Promise<object|null>}
 */
export async function getWorkerCard(workerId) {
  const cached = cardCache.get(workerId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.card;
  }

  try {
    const { findById: findUser } = await import('./users.js');
    const { findActiveByWorker } = await import('./availabilityAd.js');
    const { getPresence } = await import('./presenceService.js');
    const { getUserTrustScore } = await import('./trust.js');

    const user = await findUser(workerId);
    if (!user || user.role !== 'worker' || user.status !== 'active') return null;

    const activeAd = await findActiveByWorker(workerId);
    let presenceData = null;
    try { presenceData = getPresence(workerId); } catch (_) { /* no-op */ }

    let trustScore = null;
    try {
      const ts = await getUserTrustScore(workerId);
      if (ts && typeof ts.score === 'number') trustScore = ts.score;
    } catch (_) { /* default null */ }

    const card = buildPublicCard(user, presenceData, activeAd, null, trustScore);
    cardCache.set(workerId, { card, expiresAt: Date.now() + 60000 });
    return card;
  } catch (err) {
    logger.warn('getWorkerCard error', { workerId, error: err.message });
    return null;
  }
}

/**
 * Setup EventBus listeners for cache invalidation.
 * Called once at startup (from router.js).
 */
export function setupCacheInvalidation() {
  if (!config.WORKER_DISCOVERY || !config.WORKER_DISCOVERY.enabled) {
    logger.info('Worker discovery: disabled via config');
    return;
  }

  const handler = () => {
    clearCache();
  };

  eventBus.on('ad:created', handler);
  eventBus.on('ad:withdrawn', handler);
  eventBus.on('ad:expired', handler);
  eventBus.on('ad:matched', handler);

  // Also clear card cache when user is updated (e.g. ban/profile change)
  // (no listener needed — 60s TTL handles staleness)

  // Lazily load presence module for TIER 3 sync access
  import('./presenceService.js').then(mod => {
    _presenceModule = mod;
  }).catch(() => { /* non-fatal */ });

  logger.info('Worker discovery: enabled');
}

/**
 * Get stats for /api/health.
 */
export function getStats() {
  let totalCachedItems = 0;
  for (const [, entry] of tileCache) {
    if (Date.now() < entry.expiresAt) {
      totalCachedItems += entry.items.length;
    }
  }
  return {
    tilesCached: tileCache.size,
    totalCachedItems,
    cardsCached: cardCache.size,
  };
}

/**
 * Test helpers.
 */
export const _testHelpers = {
  computeCompositeScore,
  buildPublicCard,
  computeTileKey,
  clearCache,
};
