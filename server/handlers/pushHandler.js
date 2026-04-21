// ═══════════════════════════════════════════════════════════════
// server/handlers/pushHandler.js — Push Subscription Handlers
// ═══════════════════════════════════════════════════════════════

import { subscribe, unsubscribe } from '../services/webpush.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * POST /api/push/subscribe
 * Register a push subscription
 * Requires: requireAuth
 * Body: { endpoint, keys: { p256dh, auth } }
 */
export async function handlePushSubscribe(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const userAgent = req.headers['user-agent'] || '';

    const result = await subscribe(userId, {
      endpoint: body.endpoint,
      keys: body.keys,
    }, userAgent);

    if (!result.ok) {
      const statusMap = {
        PUSH_DISABLED: 503,
        INVALID_SUBSCRIPTION: 400,
      };
      const status = statusMap[result.code] || 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, subscriptionId: result.subscription.id });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/push/subscribe
 * Remove a push subscription
 * Requires: requireAuth
 * Body: { endpoint }
 */
export async function handlePushUnsubscribe(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};

    const result = await unsubscribe(userId, body.endpoint);

    if (!result.ok) {
      return sendJSON(res, 400, { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
