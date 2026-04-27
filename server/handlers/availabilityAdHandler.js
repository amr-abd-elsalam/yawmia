// ═══════════════════════════════════════════════════════════════
// server/handlers/availabilityAdHandler.js — Ad CRUD Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  createAd, withdrawAd, findById, listByWorker,
  incrementViewCount, getStats,
} from '../services/availabilityAd.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  ADS_DISABLED: 503,
  INVALID_FIELDS: 400,
  INVALID_CATEGORIES: 400,
  INVALID_GOVERNORATE: 400,
  INVALID_GEO: 400,
  INVALID_RADIUS: 400,
  INVALID_WAGE_RANGE: 400,
  INVALID_TIME_WINDOW: 400,
  NOTES_TOO_LONG: 400,
  DAILY_AD_LIMIT: 429,
  AD_NOT_FOUND: 404,
  NOT_OWNER: 403,
  INVALID_STATUS: 400,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/availability-ads
 * Body: { categories, governorate, lat, lng, radiusKm, minDailyWage, maxDailyWage, availableFrom, availableUntil, notes? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleCreateAd(req, res) {
  try {
    const workerId = req.user.id;
    const body = req.body || {};

    const result = await createAd(workerId, {
      categories: body.categories,
      governorate: body.governorate,
      lat: body.lat,
      lng: body.lng,
      radiusKm: body.radiusKm,
      minDailyWage: body.minDailyWage,
      maxDailyWage: body.maxDailyWage,
      availableFrom: body.availableFrom,
      availableUntil: body.availableUntil,
      notes: body.notes,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, ad: result.ad });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/availability-ads/mine
 * Lists worker's own ads (all statuses, newest first)
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleListMyAds(req, res) {
  try {
    const workerId = req.user.id;
    const ads = await listByWorker(workerId);
    sendJSON(res, 200, { ok: true, ads, count: ads.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/availability-ads/:id
 * Withdraw an active ad
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleWithdrawAd(req, res) {
  try {
    const adId = req.params.id;
    const workerId = req.user.id;

    const result = await withdrawAd(adId, workerId);
    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, ad: result.ad });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/availability-ads/:id
 * View a single ad. If viewer is an employer, increments viewCount.
 * Requires: requireAuth
 */
export async function handleGetAd(req, res) {
  try {
    const adId = req.params.id;
    const ad = await findById(adId);

    if (!ad) {
      return sendJSON(res, 404, { error: 'الإعلان غير موجود', code: 'AD_NOT_FOUND' });
    }

    // Increment viewCount if viewer is an employer (not the ad owner)
    if (req.user && req.user.role === 'employer' && req.user.id !== ad.workerId) {
      incrementViewCount(adId).catch(() => { /* fire-and-forget */ });
    }

    sendJSON(res, 200, { ok: true, ad });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/admin/availability-ads/stats
 * Admin stats endpoint
 * Requires: requireAdmin
 */
export async function handleAdStats(req, res) {
  try {
    const stats = await getStats();
    sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب إحصائيات الإعلانات', code: 'AD_STATS_ERROR' });
  }
}
