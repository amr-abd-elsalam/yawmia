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
 * Phase 41 STUB: returns 501 NOT_IMPLEMENTED.
 * Phase 42 will implement direct offer flow.
 * Requires: requireAuth + requireRole('employer')
 */
export async function handleQuickOffer(req, res) {
  sendJSON(res, 501, {
    error: 'إرسال العروض المباشرة هيكون متاح في التحديث القادم',
    code: 'PHASE_42_PENDING',
  });
}
