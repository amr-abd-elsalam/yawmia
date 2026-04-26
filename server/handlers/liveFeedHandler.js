// ═══════════════════════════════════════════════════════════════
// server/handlers/liveFeedHandler.js — Live Feed SSE + Instant Accept
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { registerConnection, getInitialDump } from '../services/liveFeed.js';
import { tryAccept, findPendingByJob } from '../services/instantMatch.js';
import { formatSSE } from '../services/sseManager.js';
import { verifySession } from '../services/sessions.js';
import { findById as findUser } from '../services/users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * GET /api/jobs/live-feed?token=...&governorate=X&category=Y&lat=...&lng=...&radius=...
 * Self-authenticated SSE endpoint (worker only).
 */
export async function handleLiveFeedStream(req, res) {
  // Feature flag
  if (!config.LIVE_FEED || !config.LIVE_FEED.enabled) {
    return sendJSON(res, 503, { error: 'خلاصة الفرص الحية غير مفعّلة', code: 'LIVE_FEED_DISABLED' });
  }

  // Self-auth (token via Authorization header OR query param)
  let token = null;
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  if (!token) {
    return sendJSON(res, 401, { error: 'يجب تسجيل الدخول أولاً', code: 'AUTH_REQUIRED' });
  }

  const session = await verifySession(token);
  if (!session) {
    return sendJSON(res, 401, { error: 'الجلسة انتهت أو غير صالحة', code: 'SESSION_INVALID' });
  }

  const user = await findUser(session.userId);
  if (!user) {
    return sendJSON(res, 401, { error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' });
  }
  if (user.status !== 'active') {
    return sendJSON(res, 403, { error: 'الحساب غير نشط', code: 'ACCOUNT_INACTIVE' });
  }
  if (user.role !== 'worker') {
    return sendJSON(res, 403, { error: 'متاحة للعمال فقط', code: 'WORKER_ONLY' });
  }

  // Parse filters from query
  const filters = {
    governorate: req.query.governorate || user.governorate || null,
    categories: req.query.category
      ? [req.query.category]
      : (Array.isArray(user.categories) && user.categories.length > 0 ? user.categories : null),
    lat: req.query.lat ? parseFloat(req.query.lat) : (typeof user.lat === 'number' ? user.lat : null),
    lng: req.query.lng ? parseFloat(req.query.lng) : (typeof user.lng === 'number' ? user.lng : null),
    radiusKm: req.query.radius ? parseFloat(req.query.radius) : config.LIVE_FEED.maxRadiusKm,
  };

  // ── Auth passed — write SSE headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  if (req.socket) {
    req.socket.setTimeout(0);
  }

  // Suggest retry interval
  res.write(`retry: ${(config.SSE && config.SSE.reconnectMs) || 5000}\n\n`);

  // Send initial dump
  let initialJobs = [];
  try {
    initialJobs = await getInitialDump(user.id, filters);
  } catch (_) { /* non-blocking */ }

  res.write(formatSSE('init', { jobs: initialJobs, filters: { ...filters }, userId: user.id }));

  // Register connection
  registerConnection(user.id, res, filters);
}

/**
 * POST /api/jobs/:id/instant-accept
 * Body: { matchId? } — if omitted, finds pending match for the job
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleInstantAccept(req, res) {
  try {
    const workerId = req.user.id;
    const jobId = req.params.id;
    const body = req.body || {};

    let matchId = body.matchId;
    if (!matchId) {
      // Auto-resolve: find pending match for this job
      const pending = await findPendingByJob(jobId);
      if (!pending) {
        return sendJSON(res, 404, { error: 'مفيش عرض فوري لهذه الفرصة', code: 'NO_PENDING_MATCH' });
      }
      matchId = pending.id;
    }

    const result = await tryAccept(matchId, workerId);

    if (!result.ok) {
      const statusMap = {
        MATCH_NOT_FOUND: 404,
        TOO_LATE: 409,
        EXPIRED: 410,
        INVALID_STATUS: 400,
        NOT_CANDIDATE: 403,
        ACCEPT_FAILED: 500,
      };
      const code = result.code || 'ACCEPT_FAILED';
      const labels = {
        MATCH_NOT_FOUND: 'العرض غير موجود',
        TOO_LATE: 'حد آخر سبقك ⚡',
        EXPIRED: 'انتهت مهلة العرض',
        INVALID_STATUS: 'حالة العرض غير صالحة',
        NOT_CANDIDATE: 'مش ضمن المرشحين لهذا العرض',
        ACCEPT_FAILED: 'تعذّر قبول العرض',
      };
      return sendJSON(res, statusMap[code] || 400, { error: labels[code] || 'خطأ في القبول', code });
    }

    sendJSON(res, 200, { ok: true, application: result.application, jobId: result.jobId });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
