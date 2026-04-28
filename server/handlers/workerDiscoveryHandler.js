// ═══════════════════════════════════════════════════════════════
// server/handlers/workerDiscoveryHandler.js — Talent Discovery Endpoints
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { discoverWorkers, getWorkerCard } from '../services/workerDiscovery.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/workers/discover?lat=&lng=&radius=&category=&minWage=&maxWage=&governorate=&sortBy=&limit=&offset=
 * Returns 3-tier worker pool with composite scoring + privacy-first cards.
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleDiscoverWorkers(req, res) {
  try {
    if (!config.WORKER_DISCOVERY || !config.WORKER_DISCOVERY.enabled) {
      return sendJSON(res, 503, { error: 'اكتشاف العمال غير مفعّل', code: 'DISCOVERY_DISABLED' });
    }

    const q = req.query || {};

    // Parse coordinates
    let lat;
    let lng;
    if (q.lat !== undefined && q.lat !== '') {
      lat = parseFloat(q.lat);
      if (isNaN(lat)) {
        return sendJSON(res, 400, { error: 'lat غير صالح', code: 'INVALID_LAT' });
      }
    }
    if (q.lng !== undefined && q.lng !== '') {
      lng = parseFloat(q.lng);
      if (isNaN(lng)) {
        return sendJSON(res, 400, { error: 'lng غير صالح', code: 'INVALID_LNG' });
      }
    }

    // Fall back to employer's stored location if not provided
    if (lat === undefined || lng === undefined) {
      const user = req.user;
      if (typeof user.lat === 'number' && typeof user.lng === 'number') {
        lat = user.lat;
        lng = user.lng;
      } else {
        // Resolve from governorate
        try {
          const { resolveCoordinates } = await import('../services/geo.js');
          const coords = resolveCoordinates({ governorate: user.governorate });
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        } catch (_) { /* non-blocking */ }
      }
    }

    const radiusKm = q.radius !== undefined && q.radius !== ''
      ? Math.min(parseFloat(q.radius) || config.WORKER_DISCOVERY.defaultRadiusKm, config.WORKER_DISCOVERY.maxRadiusKm)
      : config.WORKER_DISCOVERY.defaultRadiusKm;

    const categories = [];
    if (q.category) categories.push(q.category);
    if (q.categories && typeof q.categories === 'string') {
      const parts = q.categories.split(',').map(s => s.trim()).filter(Boolean);
      for (const p of parts) {
        if (!categories.includes(p)) categories.push(p);
      }
    }

    const options = {
      lat,
      lng,
      radiusKm,
      categories: categories.length > 0 ? categories : undefined,
      governorate: q.governorate || undefined,
      minWage: q.minWage !== undefined && q.minWage !== '' ? parseFloat(q.minWage) : undefined,
      maxWage: q.maxWage !== undefined && q.maxWage !== '' ? parseFloat(q.maxWage) : undefined,
      sortBy: q.sortBy || 'composite',
      limit: q.limit !== undefined && q.limit !== '' ? Math.min(parseInt(q.limit) || 20, 50) : 20,
      offset: q.offset !== undefined && q.offset !== '' ? Math.max(parseInt(q.offset) || 0, 0) : 0,
    };

    const result = await discoverWorkers(options);
    sendJSON(res, 200, {
      ok: true,
      workers: result.workers,
      total: result.total,
      filters: {
        lat: options.lat || null,
        lng: options.lng || null,
        radiusKm: options.radiusKm,
        categories: options.categories || null,
        governorate: options.governorate || null,
      },
    });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في اكتشاف العمال', code: 'DISCOVER_ERROR' });
  }
}

/**
 * GET /api/workers/:id/card
 * Returns a privacy-first worker card.
 * Requires: requireAuth (any role)
 */
export async function handleGetWorkerCard(req, res) {
  try {
    const workerId = req.params.id;
    const card = await getWorkerCard(workerId);

    if (!card) {
      return sendJSON(res, 404, { error: 'العامل غير موجود', code: 'WORKER_NOT_FOUND' });
    }

    sendJSON(res, 200, { ok: true, card });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ في جلب بيانات العامل', code: 'CARD_ERROR' });
  }
}

/**
 * POST /api/workers/:id/quick-offer
 * Phase 42: real implementation — delegates to directOffer.create().
 * Body: { adId?, category, governorate, proposedDailyWage, proposedStartDate, proposedDurationDays?, message? }
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleQuickOffer(req, res) {
  try {
    const employerId = req.user.id;
    const workerId = req.params.id;
    const body = req.body || {};

    if (!body.category || !body.governorate || typeof body.proposedDailyWage !== 'number' || !body.proposedStartDate) {
      return sendJSON(res, 400, { error: 'بيانات العرض غير مكتملة', code: 'INVALID_OFFER_FIELDS' });
    }

    const { create } = await import('../services/directOffer.js');
    const result = await create(employerId, workerId, {
      adId: body.adId || null,
      category: body.category,
      governorate: body.governorate,
      proposedDailyWage: body.proposedDailyWage,
      proposedStartDate: body.proposedStartDate,
      proposedDurationDays: body.proposedDurationDays || 1,
      message: body.message || null,
    });

    if (!result.ok) {
      const statusMap = {
        OFFERS_DISABLED: 503,
        SELF_OFFER: 400,
        INVALID_EMPLOYER: 403,
        INVALID_WORKER: 404,
        INVALID_FIELDS: 400,
        INVALID_CATEGORY: 400,
        INVALID_GOVERNORATE: 400,
        INVALID_WAGE: 400,
        INVALID_START_DATE: 400,
        INVALID_DURATION: 400,
        MESSAGE_TOO_LONG: 400,
        CONTENT_BLOCKED: 400,
        EMPLOYER_PENDING_CAP: 429,
        WORKER_PENDING_CAP: 429,
        EMPLOYER_DAILY_CAP: 429,
        DUPLICATE_PENDING: 409,
        INVALID_AD: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, offer: result.offer });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
