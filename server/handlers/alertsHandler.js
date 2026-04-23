// ═══════════════════════════════════════════════════════════════
// server/handlers/alertsHandler.js — Job Alert API Handlers
// ═══════════════════════════════════════════════════════════════

import { createAlert, listByUser, deleteAlert, toggleAlert } from '../services/jobAlerts.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  ALERTS_DISABLED: 503,
  NAME_REQUIRED: 400,
  CRITERIA_REQUIRED: 400,
  CATEGORIES_REQUIRED: 400,
  INVALID_CATEGORY: 400,
  INVALID_GOVERNORATE: 400,
  INVALID_MIN_WAGE: 400,
  INVALID_MAX_WAGE: 400,
  INVALID_WAGE_RANGE: 400,
  MAX_ALERTS_REACHED: 429,
  ALERT_NOT_FOUND: 404,
  NOT_ALERT_OWNER: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/alerts
 * Create a new job alert
 * Requires: requireAuth
 */
export async function handleCreateAlert(req, res) {
  try {
    const body = req.body || {};
    const result = await createAlert(req.user.id, {
      name: body.name,
      criteria: body.criteria,
    });

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, alert: result.alert });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/alerts
 * List my job alerts
 * Requires: requireAuth
 */
export async function handleListMyAlerts(req, res) {
  try {
    const alerts = await listByUser(req.user.id);
    sendJSON(res, 200, { ok: true, alerts, count: alerts.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/alerts/:id
 * Delete a job alert
 * Requires: requireAuth
 */
export async function handleDeleteAlert(req, res) {
  try {
    const alertId = req.params.id;
    const result = await deleteAlert(alertId, req.user.id);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * PUT /api/alerts/:id
 * Toggle alert enabled/disabled
 * Requires: requireAuth
 */
export async function handleToggleAlert(req, res) {
  try {
    const alertId = req.params.id;
    const body = req.body || {};

    if (typeof body.enabled !== 'boolean') {
      return sendJSON(res, 400, { error: 'الحقل enabled مطلوب (true أو false)', code: 'ENABLED_REQUIRED' });
    }

    const result = await toggleAlert(alertId, req.user.id, body.enabled);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true, alert: result.alert });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
