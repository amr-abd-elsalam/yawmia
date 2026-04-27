// ═══════════════════════════════════════════════════════════════
// server/services/availabilityAd.js — Worker Availability Ads
// ═══════════════════════════════════════════════════════════════
// First-class entity for worker availability ads.
// Lifecycle: active → matched / expired / withdrawn
// Max 1 active ad per worker (auto-expire previous on create).
// Storage: sharded monthly (data/availability_ads/YYYY-MM/).
// Index: workerAdsIndex (flat).
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getWriteRecordPath,
  getCollectionPath, listJSON,
  addToSetIndex, getFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { withLock } from './resourceLock.js';

const WORKER_ADS_INDEX = config.DATABASE.indexFiles.workerAdsIndex;

/** Generate ad ID */
function generateId() {
  return 'aad_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Validate ad fields.
 * @param {object} fields
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validateFields(fields) {
  if (!fields || typeof fields !== 'object') {
    return { valid: false, error: 'بيانات الإعلان غير صالحة', code: 'INVALID_FIELDS' };
  }

  const cfg = config.AVAILABILITY_ADS;

  // Categories — 1-3 valid IDs
  if (!Array.isArray(fields.categories) || fields.categories.length === 0) {
    return { valid: false, error: 'اختار تخصص واحد على الأقل', code: 'INVALID_CATEGORIES' };
  }
  if (fields.categories.length > cfg.maxCategories) {
    return { valid: false, error: `أقصى ${cfg.maxCategories} تخصصات`, code: 'INVALID_CATEGORIES' };
  }
  const validCatIds = new Set(config.LABOR_CATEGORIES.map(c => c.id));
  for (const cat of fields.categories) {
    if (!validCatIds.has(cat)) {
      return { valid: false, error: `التخصص "${cat}" غير موجود`, code: 'INVALID_CATEGORIES' };
    }
  }

  // Governorate
  const validGovs = new Set(config.REGIONS.governorates.map(g => g.id));
  if (!fields.governorate || !validGovs.has(fields.governorate)) {
    return { valid: false, error: 'المحافظة غير صالحة', code: 'INVALID_GOVERNORATE' };
  }

  // Geo
  if (typeof fields.lat !== 'number' || typeof fields.lng !== 'number' ||
      isNaN(fields.lat) || isNaN(fields.lng) ||
      fields.lat < 22 || fields.lat > 32 ||
      fields.lng < 24 || fields.lng > 37) {
    return { valid: false, error: 'الموقع الجغرافي غير صالح (داخل نطاق مصر)', code: 'INVALID_GEO' };
  }

  // Radius
  if (typeof fields.radiusKm !== 'number' || fields.radiusKm < 1 || fields.radiusKm > cfg.maxRadiusKm) {
    return { valid: false, error: `النطاق لازم يكون بين 1 و ${cfg.maxRadiusKm} كم`, code: 'INVALID_RADIUS' };
  }

  // Wage range
  const minW = config.FINANCIALS.minDailyWage;
  const maxW = config.FINANCIALS.maxDailyWage;
  if (typeof fields.minDailyWage !== 'number' || typeof fields.maxDailyWage !== 'number') {
    return { valid: false, error: 'مدى الأجر مطلوب', code: 'INVALID_WAGE_RANGE' };
  }
  if (fields.minDailyWage < minW || fields.minDailyWage > maxW ||
      fields.maxDailyWage < minW || fields.maxDailyWage > maxW) {
    return { valid: false, error: `الأجر لازم يكون بين ${minW} و ${maxW} جنيه`, code: 'INVALID_WAGE_RANGE' };
  }
  if (fields.minDailyWage > fields.maxDailyWage) {
    return { valid: false, error: 'الأجر الأدنى لازم يكون أقل من أو يساوي الأقصى', code: 'INVALID_WAGE_RANGE' };
  }

  // Time window
  if (!fields.availableFrom || !fields.availableUntil) {
    return { valid: false, error: 'وقت البدء والانتهاء مطلوبان', code: 'INVALID_TIME_WINDOW' };
  }
  const fromMs = new Date(fields.availableFrom).getTime();
  const untilMs = new Date(fields.availableUntil).getTime();
  const now = Date.now();
  if (isNaN(fromMs) || isNaN(untilMs)) {
    return { valid: false, error: 'صيغة الوقت غير صالحة', code: 'INVALID_TIME_WINDOW' };
  }
  if (fromMs <= now) {
    return { valid: false, error: 'وقت البدء لازم يكون في المستقبل', code: 'INVALID_TIME_WINDOW' };
  }
  const maxAdvance = now + cfg.maxAdvanceDays * 24 * 60 * 60 * 1000;
  if (fromMs > maxAdvance) {
    return { valid: false, error: `لا يمكن الإعلان لأكثر من ${cfg.maxAdvanceDays} أيام مقدماً`, code: 'INVALID_TIME_WINDOW' };
  }
  if (untilMs <= fromMs) {
    return { valid: false, error: 'وقت الانتهاء لازم يكون بعد وقت البدء', code: 'INVALID_TIME_WINDOW' };
  }
  const durationHours = (untilMs - fromMs) / (60 * 60 * 1000);
  if (durationHours > cfg.maxDurationHours) {
    return { valid: false, error: `أقصى مدة ${cfg.maxDurationHours} ساعة`, code: 'INVALID_TIME_WINDOW' };
  }

  // Notes (optional)
  if (fields.notes !== undefined && fields.notes !== null) {
    if (typeof fields.notes !== 'string') {
      return { valid: false, error: 'الملاحظات لازم تكون نص', code: 'NOTES_TOO_LONG' };
    }
    if (fields.notes.length > cfg.maxNotesLength) {
      return { valid: false, error: `الملاحظات لا تتجاوز ${cfg.maxNotesLength} حرف`, code: 'NOTES_TOO_LONG' };
    }
  }

  return { valid: true };
}

/**
 * Find currently active ad for a worker (returns null if none).
 * @param {string} workerId
 * @returns {Promise<object|null>}
 */
export async function findActiveByWorker(workerId) {
  const adIds = await getFromSetIndex(WORKER_ADS_INDEX, workerId);
  for (const adId of adIds) {
    const ad = await readJSON(getRecordPath('availability_ads', adId));
    if (ad && ad.status === 'active') return ad;
  }
  return null;
}

/**
 * Count today's ads created by worker (Egypt timezone).
 * @param {string} workerId
 * @returns {Promise<number>}
 */
export async function countTodayByWorker(workerId) {
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const adIds = await getFromSetIndex(WORKER_ADS_INDEX, workerId);
  let count = 0;
  for (const adId of adIds) {
    const ad = await readJSON(getRecordPath('availability_ads', adId));
    if (ad && new Date(ad.createdAt) >= todayMidnight) count++;
  }
  return count;
}

/**
 * Create a new availability ad for a worker.
 * Auto-expires any existing active ad.
 * Serialized per worker via withLock(`ad:${workerId}`).
 *
 * @param {string} workerId
 * @param {object} fields — { categories, governorate, lat, lng, radiusKm, minDailyWage, maxDailyWage, availableFrom, availableUntil, notes? }
 * @returns {Promise<{ ok: boolean, ad?: object, error?: string, code?: string }>}
 */
export function createAd(workerId, fields) {
  return withLock(`ad:${workerId}`, async () => {
    if (!config.AVAILABILITY_ADS || !config.AVAILABILITY_ADS.enabled) {
      return { ok: false, error: 'إعلانات الإتاحة غير مفعّلة', code: 'ADS_DISABLED' };
    }

    // Validate
    const validation = validateFields(fields);
    if (!validation.valid) {
      return { ok: false, error: validation.error, code: validation.code };
    }

    // Daily limit
    try {
      const todayCount = await countTodayByWorker(workerId);
      const dailyLimit = config.LIMITS.maxAdsPerWorkerPerDay || 5;
      if (todayCount >= dailyLimit) {
        return { ok: false, error: 'وصلت للحد اليومي لإنشاء الإعلانات', code: 'DAILY_AD_LIMIT' };
      }
    } catch (_) { /* non-blocking */ }

    // Auto-expire existing active ad
    try {
      const existingActive = await findActiveByWorker(workerId);
      if (existingActive) {
        existingActive.status = 'expired';
        existingActive.updatedAt = new Date().toISOString();
        await atomicWrite(getRecordPath('availability_ads', existingActive.id), existingActive);
        eventBus.emit('ad:expired', { adId: existingActive.id, workerId, reason: 'replaced' });
      }
    } catch (_) { /* non-fatal */ }

    // Create new ad
    const id = generateId();
    const now = new Date().toISOString();

    const ad = {
      id,
      workerId,
      categories: fields.categories.slice(),
      governorate: fields.governorate,
      lat: fields.lat,
      lng: fields.lng,
      radiusKm: fields.radiusKm,
      minDailyWage: fields.minDailyWage,
      maxDailyWage: fields.maxDailyWage,
      availableFrom: new Date(fields.availableFrom).toISOString(),
      availableUntil: new Date(fields.availableUntil).toISOString(),
      notes: (fields.notes && typeof fields.notes === 'string') ? fields.notes.trim() : null,
      status: 'active',
      matchedJobId: null,
      matchedAt: null,
      viewCount: 0,
      offerCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const adPath = getWriteRecordPath('availability_ads', id);
    await atomicWrite(adPath, ad);

    // Update index
    await addToSetIndex(WORKER_ADS_INDEX, workerId, id);

    eventBus.emit('ad:created', {
      adId: id,
      workerId,
      governorate: ad.governorate,
      categories: ad.categories,
    });

    logger.info('Availability ad created', { adId: id, workerId, categories: ad.categories });

    return { ok: true, ad };
  });
}

/**
 * Withdraw an ad (worker-initiated cancellation).
 * @param {string} adId
 * @param {string} workerId — ownership check
 * @returns {Promise<{ ok: boolean, ad?: object, error?: string, code?: string }>}
 */
export async function withdrawAd(adId, workerId) {
  const adPath = getRecordPath('availability_ads', adId);
  const ad = await readJSON(adPath);

  if (!ad) {
    return { ok: false, error: 'الإعلان غير موجود', code: 'AD_NOT_FOUND' };
  }
  if (ad.workerId !== workerId) {
    return { ok: false, error: 'مش مسموحلك تسحب هذا الإعلان', code: 'NOT_OWNER' };
  }
  if (ad.status !== 'active') {
    return { ok: false, error: 'الإعلان مش نشط حالياً', code: 'INVALID_STATUS' };
  }

  ad.status = 'withdrawn';
  ad.updatedAt = new Date().toISOString();
  await atomicWrite(adPath, ad);

  eventBus.emit('ad:withdrawn', { adId, workerId });
  logger.info('Availability ad withdrawn', { adId, workerId });

  return { ok: true, ad };
}

/**
 * Find ad by ID.
 * @param {string} adId
 * @returns {Promise<object|null>}
 */
export async function findById(adId) {
  return await readJSON(getRecordPath('availability_ads', adId));
}

/**
 * List ads by worker (newest first).
 * @param {string} workerId
 * @returns {Promise<object[]>}
 */
export async function listByWorker(workerId) {
  const adIds = await getFromSetIndex(WORKER_ADS_INDEX, workerId);
  const results = [];
  for (const adId of adIds) {
    const ad = await readJSON(getRecordPath('availability_ads', adId));
    if (ad) results.push(ad);
  }
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return results;
}

/**
 * List all ads (for index rebuilds + admin).
 * Shard-aware via listJSON.
 * @returns {Promise<object[]>}
 */
export async function listAll() {
  const dir = getCollectionPath('availability_ads');
  const all = await listJSON(dir);
  return all.filter(a => a.id && a.id.startsWith('aad_'));
}

/**
 * Search active ads with filters.
 * Uses queryIndex for first-pass, then filters in-memory.
 *
 * @param {object} filters — { governorate?, categories?, lat?, lng?, radiusKm?, minWage?, maxWage?, sortBy?, limit? }
 * @returns {Promise<object[]>} — array of ads enriched with worker public profile
 */
export async function searchAds(filters = {}) {
  if (!config.AVAILABILITY_ADS || !config.AVAILABILITY_ADS.enabled) return [];

  let candidateIds = [];

  // Try query index first
  try {
    const { queryAds, getStats } = await import('./queryIndex.js');
    const stats = getStats();
    if (stats.totalAds > 0 || stats.activeAds > 0) {
      candidateIds = queryAds({
        governorate: filters.governorate,
        categories: filters.categories,
      });
    } else {
      // Index not built yet — fall back to full scan
      const all = await listAll();
      candidateIds = all
        .filter(a => a.status === 'active')
        .filter(a => !filters.governorate || a.governorate === filters.governorate)
        .filter(a => {
          if (!filters.categories || filters.categories.length === 0) return true;
          return filters.categories.some(c => a.categories.includes(c));
        })
        .map(a => a.id);
    }
  } catch (_) {
    // Fallback: full scan
    const all = await listAll();
    candidateIds = all
      .filter(a => a.status === 'active')
      .map(a => a.id);
  }

  if (candidateIds.length === 0) return [];

  // Load each candidate
  const ads = [];
  for (const adId of candidateIds) {
    const ad = await readJSON(getRecordPath('availability_ads', adId));
    if (!ad || ad.status !== 'active') continue;
    ads.push(ad);
  }

  // Time overlap filter (active means not expired yet)
  const nowMs = Date.now();
  const buffer = (config.AVAILABILITY_ADS.autoExpireBufferMinutes || 30) * 60 * 1000;
  let filtered = ads.filter(a => {
    const untilMs = new Date(a.availableUntil).getTime();
    return untilMs - buffer > nowMs;
  });

  // Wage overlap (filters.minWage = job's wage; ad's range must contain it)
  if (typeof filters.minWage === 'number') {
    filtered = filtered.filter(a => a.maxDailyWage >= filters.minWage);
  }
  if (typeof filters.maxWage === 'number') {
    filtered = filtered.filter(a => a.minDailyWage <= filters.maxWage);
  }

  // Geo filter (Haversine)
  if (typeof filters.lat === 'number' && typeof filters.lng === 'number' &&
      typeof filters.radiusKm === 'number') {
    try {
      const { haversineDistance } = await import('./geo.js');
      filtered = filtered.filter(a => {
        const dist = haversineDistance(filters.lat, filters.lng, a.lat, a.lng);
        // Match if employer's location is within ad's radius OR ad is within employer's radius
        return dist <= filters.radiusKm || dist <= a.radiusKm;
      });
      // Attach distance for sorting
      for (const a of filtered) {
        a._distance = haversineDistance(filters.lat, filters.lng, a.lat, a.lng);
      }
    } catch (_) { /* skip on error */ }
  }

  // Sort
  const sortBy = filters.sortBy || 'newest';
  if (sortBy === 'distance' && filtered[0] && filtered[0]._distance !== undefined) {
    filtered.sort((a, b) => (a._distance || 0) - (b._distance || 0));
  } else if (sortBy === 'wage_high') {
    filtered.sort((a, b) => b.maxDailyWage - a.maxDailyWage);
  } else {
    // newest
    filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Limit
  if (typeof filters.limit === 'number' && filters.limit > 0) {
    filtered = filtered.slice(0, filters.limit);
  }

  return filtered;
}

/**
 * Periodic: expire stale ads (availableUntil + buffer < now).
 * Called by cleanup timer.
 * @returns {Promise<number>} count expired
 */
export async function expireStaleAds() {
  if (!config.AVAILABILITY_ADS || !config.AVAILABILITY_ADS.enabled) return 0;

  let all;
  try {
    all = await listAll();
  } catch (_) {
    return 0;
  }

  const active = all.filter(a => a.status === 'active');
  if (active.length === 0) return 0;

  const buffer = (config.AVAILABILITY_ADS.autoExpireBufferMinutes || 30) * 60 * 1000;
  const cutoffMs = Date.now() - buffer;
  let count = 0;

  for (const ad of active) {
    try {
      const untilMs = new Date(ad.availableUntil).getTime();
      // Expire when (now - buffer) > availableUntil → equivalent to (availableUntil + buffer < now)
      if (untilMs < cutoffMs) {
        ad.status = 'expired';
        ad.updatedAt = new Date().toISOString();
        await atomicWrite(getRecordPath('availability_ads', ad.id), ad);
        eventBus.emit('ad:expired', { adId: ad.id, workerId: ad.workerId, reason: 'timeout' });
        count++;
      }
    } catch (_) { /* fire-and-forget per ad */ }
  }

  if (count > 0) logger.info(`Ad expiration: expired ${count} stale ad(s)`);
  return count;
}

/**
 * Increment offerCount (called by adMatcher when notifying).
 * Fire-and-forget — never throws.
 * @param {string} adId
 */
export async function incrementOfferCount(adId) {
  try {
    const adPath = getRecordPath('availability_ads', adId);
    const ad = await readJSON(adPath);
    if (!ad) return;
    ad.offerCount = (ad.offerCount || 0) + 1;
    ad.updatedAt = new Date().toISOString();
    await atomicWrite(adPath, ad);
  } catch (_) { /* non-fatal */ }
}

/**
 * Increment viewCount (called when employer views ad).
 * Fire-and-forget — never throws.
 * @param {string} adId
 */
export async function incrementViewCount(adId) {
  try {
    const adPath = getRecordPath('availability_ads', adId);
    const ad = await readJSON(adPath);
    if (!ad) return;
    ad.viewCount = (ad.viewCount || 0) + 1;
    ad.updatedAt = new Date().toISOString();
    await atomicWrite(adPath, ad);
  } catch (_) { /* non-fatal */ }
}

/**
 * Mark ad as matched (called by Phase 42 when worker accepts a direct offer).
 * @param {string} adId
 * @param {string} jobId
 * @returns {Promise<boolean>}
 */
export async function markAsMatched(adId, jobId) {
  const adPath = getRecordPath('availability_ads', adId);
  const ad = await readJSON(adPath);
  if (!ad) return false;
  if (ad.status !== 'active') return false;
  ad.status = 'matched';
  ad.matchedJobId = jobId;
  ad.matchedAt = new Date().toISOString();
  ad.updatedAt = ad.matchedAt;
  await atomicWrite(adPath, ad);
  eventBus.emit('ad:matched', { adId, workerId: ad.workerId, jobId });
  return true;
}

/**
 * Get aggregate stats for /api/health and admin dashboard.
 * @returns {Promise<{ active: number, totalToday: number, expiredLastHour: number, withdrawnLastHour: number }>}
 */
export async function getStats() {
  if (!config.AVAILABILITY_ADS || !config.AVAILABILITY_ADS.enabled) {
    return { active: 0, totalToday: 0, expiredLastHour: 0, withdrawnLastHour: 0 };
  }

  let all;
  try {
    all = await listAll();
  } catch (_) {
    return { active: 0, totalToday: 0, expiredLastHour: 0, withdrawnLastHour: 0 };
  }

  let active = 0;
  let totalToday = 0;
  let expiredLastHour = 0;
  let withdrawnLastHour = 0;

  let todayMidnight = null;
  try {
    const { getEgyptMidnight } = await import('./geo.js');
    todayMidnight = getEgyptMidnight();
  } catch (_) { /* non-fatal */ }

  const hourAgo = Date.now() - 60 * 60 * 1000;

  for (const ad of all) {
    if (ad.status === 'active') active++;
    if (todayMidnight && new Date(ad.createdAt) >= todayMidnight) totalToday++;
    const updatedMs = new Date(ad.updatedAt || ad.createdAt).getTime();
    if (updatedMs >= hourAgo) {
      if (ad.status === 'expired') expiredLastHour++;
      else if (ad.status === 'withdrawn') withdrawnLastHour++;
    }
  }

  return { active, totalToday, expiredLastHour, withdrawnLastHour };
}

/**
 * Test helpers (exported for unit tests).
 */
export const _testHelpers = { validateFields };
