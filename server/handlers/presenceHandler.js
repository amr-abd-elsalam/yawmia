// ═══════════════════════════════════════════════════════════════
// server/handlers/presenceHandler.js — Heartbeat + Online Workers
// ═══════════════════════════════════════════════════════════════

import { recordHeartbeat, countOnlineByFilters } from '../services/presenceService.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/presence/heartbeat
 * Body: { lat?, lng?, acceptingJobs?, sessionId? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleHeartbeat(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    const result = recordHeartbeat(userId, {
      lat: typeof body.lat === 'number' ? body.lat : undefined,
      lng: typeof body.lng === 'number' ? body.lng : undefined,
      acceptingJobs: typeof body.acceptingJobs === 'boolean' ? body.acceptingJobs : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : (req.session && req.session.token) || undefined,
    });

    if (!result.ok) {
      return sendJSON(res, 503, { error: 'خدمة الحضور اللحظي غير مفعّلة', code: 'PRESENCE_DISABLED' });
    }

    sendJSON(res, 200, {
      ok: true,
      status: result.status || 'online',
      throttled: !!result.throttled,
    });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/workers/online-count?governorate=X&category=Y
 * Requires: requireAuth (any authenticated user)
 */
export async function handleOnlineCount(req, res) {
  try {
    const filters = { acceptingJobs: true, includeAway: false };
    if (req.query.governorate) filters.governorate = req.query.governorate;
    if (req.query.category) filters.categories = [req.query.category];

    const count = await countOnlineByFilters(filters);
    sendJSON(res, 200, { ok: true, count });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
