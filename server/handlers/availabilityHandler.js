// ═══════════════════════════════════════════════════════════════
// server/handlers/availabilityHandler.js — Availability Windows CRUD
// ═══════════════════════════════════════════════════════════════

import { createWindow, listByUser, deleteWindow } from '../services/availabilityWindow.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const ERROR_STATUS = {
  WINDOWS_DISABLED: 503,
  INVALID_FIELDS: 400,
  INVALID_TYPE: 400,
  DAYS_REQUIRED: 400,
  INVALID_DAYS: 400,
  INVALID_START_HOUR: 400,
  INVALID_END_HOUR: 400,
  INVALID_HOUR_RANGE: 400,
  START_AT_REQUIRED: 400,
  END_AT_REQUIRED: 400,
  INVALID_DATE_FORMAT: 400,
  INVALID_TIME_RANGE: 400,
  MAX_WINDOWS_REACHED: 429,
  WINDOW_NOT_FOUND: 404,
  NOT_WINDOW_OWNER: 403,
};

function errorStatus(code) {
  return ERROR_STATUS[code] || 400;
}

/**
 * POST /api/availability/windows
 * Body: { type, daysOfWeek?, startHour?, endHour?, startAt?, endAt?, enabled? }
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleCreateWindow(req, res) {
  try {
    const userId = req.user.id;
    const body = req.body || {};
    const result = await createWindow(userId, body);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 201, { ok: true, window: result.window });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * GET /api/availability/windows
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleListWindows(req, res) {
  try {
    const userId = req.user.id;
    const windows = await listByUser(userId);
    sendJSON(res, 200, { ok: true, windows, count: windows.length });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}

/**
 * DELETE /api/availability/windows/:id
 * Requires: requireAuth + requireRole('worker')
 */
export async function handleDeleteWindow(req, res) {
  try {
    const userId = req.user.id;
    const windowId = req.params.id;
    const result = await deleteWindow(windowId, userId);

    if (!result.ok) {
      return sendJSON(res, errorStatus(result.code), { error: result.error, code: result.code });
    }

    sendJSON(res, 200, { ok: true });
  } catch (err) {
    sendJSON(res, 500, { error: 'خطأ داخلي في السيرفر', code: 'INTERNAL_ERROR' });
  }
}
