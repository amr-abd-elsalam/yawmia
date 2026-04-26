// ═══════════════════════════════════════════════════════════════
// server/services/availabilityWindow.js — Time-Windowed Availability
// ═══════════════════════════════════════════════════════════════
// Recurring (daysOfWeek + hour range) + one-time windows.
// Egypt timezone-aware (UTC+2). Storage: flat data/availability_windows/.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath, getCollectionPath, listJSON,
} from './database.js';
import { logger } from './logger.js';

/**
 * Generate window record ID
 */
function generateId() {
  return 'aw_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Validate window fields.
 * @param {object} fields
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validateFields(fields) {
  if (!fields || typeof fields !== 'object') {
    return { valid: false, error: 'بيانات النافذة غير صالحة', code: 'INVALID_FIELDS' };
  }
  const { type } = fields;
  if (type !== 'recurring' && type !== 'one_time') {
    return { valid: false, error: 'نوع النافذة غير صالح', code: 'INVALID_TYPE' };
  }

  if (type === 'recurring') {
    if (!Array.isArray(fields.daysOfWeek) || fields.daysOfWeek.length === 0) {
      return { valid: false, error: 'أيام الأسبوع مطلوبة', code: 'DAYS_REQUIRED' };
    }
    for (const d of fields.daysOfWeek) {
      if (typeof d !== 'number' || d < 0 || d > 6) {
        return { valid: false, error: 'أيام الأسبوع غير صالحة (0-6)', code: 'INVALID_DAYS' };
      }
    }
    if (typeof fields.startHour !== 'number' || fields.startHour < 0 || fields.startHour > 23) {
      return { valid: false, error: 'ساعة البدء غير صالحة', code: 'INVALID_START_HOUR' };
    }
    if (typeof fields.endHour !== 'number' || fields.endHour < 1 || fields.endHour > 24) {
      return { valid: false, error: 'ساعة الانتهاء غير صالحة', code: 'INVALID_END_HOUR' };
    }
    if (fields.endHour <= fields.startHour) {
      return { valid: false, error: 'ساعة الانتهاء لازم تكون بعد ساعة البدء', code: 'INVALID_HOUR_RANGE' };
    }
  } else {
    // one_time
    if (!fields.startAt || typeof fields.startAt !== 'string') {
      return { valid: false, error: 'وقت البدء مطلوب', code: 'START_AT_REQUIRED' };
    }
    if (!fields.endAt || typeof fields.endAt !== 'string') {
      return { valid: false, error: 'وقت الانتهاء مطلوب', code: 'END_AT_REQUIRED' };
    }
    const startMs = new Date(fields.startAt).getTime();
    const endMs = new Date(fields.endAt).getTime();
    if (isNaN(startMs) || isNaN(endMs)) {
      return { valid: false, error: 'صيغة الوقت غير صالحة', code: 'INVALID_DATE_FORMAT' };
    }
    if (endMs <= startMs) {
      return { valid: false, error: 'وقت الانتهاء لازم يكون بعد وقت البدء', code: 'INVALID_TIME_RANGE' };
    }
  }

  return { valid: true };
}

/**
 * Create a new availability window for a user.
 * @param {string} userId
 * @param {object} fields
 * @returns {Promise<{ ok: boolean, window?: object, error?: string, code?: string }>}
 */
export async function createWindow(userId, fields) {
  if (!config.AVAILABILITY_WINDOWS || !config.AVAILABILITY_WINDOWS.enabled) {
    return { ok: false, error: 'نوافذ الإتاحة غير مفعّلة', code: 'WINDOWS_DISABLED' };
  }

  const validation = validateFields(fields);
  if (!validation.valid) {
    return { ok: false, error: validation.error, code: validation.code };
  }

  // Enforce max windows per user
  const existing = await listByUser(userId);
  if (existing.length >= config.AVAILABILITY_WINDOWS.maxWindowsPerUser) {
    return {
      ok: false,
      error: `وصلت للحد الأقصى (${config.AVAILABILITY_WINDOWS.maxWindowsPerUser} نوافذ)`,
      code: 'MAX_WINDOWS_REACHED',
    };
  }

  const id = generateId();
  const now = new Date().toISOString();

  const window = {
    id,
    userId,
    type: fields.type,
    enabled: fields.enabled !== false,
    createdAt: now,
  };

  if (fields.type === 'recurring') {
    window.daysOfWeek = fields.daysOfWeek;
    window.startHour = fields.startHour;
    window.endHour = fields.endHour;
  } else {
    window.startAt = fields.startAt;
    window.endAt = fields.endAt;
  }

  const filePath = getRecordPath('availability_windows', id);
  await atomicWrite(filePath, window);

  logger.info('Availability window created', { windowId: id, userId, type: window.type });

  return { ok: true, window };
}

/**
 * List all windows for a user (newest first).
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listByUser(userId) {
  const dir = getCollectionPath('availability_windows');
  const all = await listJSON(dir);
  const userWindows = all.filter(w => w.id && w.id.startsWith('aw_') && w.userId === userId);
  userWindows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return userWindows;
}

/**
 * Find a window by ID.
 * @param {string} windowId
 * @returns {Promise<object|null>}
 */
export async function findById(windowId) {
  return await readJSON(getRecordPath('availability_windows', windowId));
}

/**
 * Delete a window (with ownership check).
 * @param {string} windowId
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, error?: string, code?: string }>}
 */
export async function deleteWindow(windowId, userId) {
  const filePath = getRecordPath('availability_windows', windowId);
  const window = await readJSON(filePath);

  if (!window) {
    return { ok: false, error: 'النافذة غير موجودة', code: 'WINDOW_NOT_FOUND' };
  }
  if (window.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تحذف هذه النافذة', code: 'NOT_WINDOW_OWNER' };
  }

  await deleteJSON(filePath);
  logger.info('Availability window deleted', { windowId, userId });
  return { ok: true };
}

/**
 * Get current time in Egypt timezone (UTC+2) — returns getUTCDay/getUTCHours-compatible Date.
 * @returns {Date}
 */
function getEgyptNow() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000);
}

/**
 * Check if a single window is currently active.
 * @param {object} window
 * @param {Date} egyptNow
 * @param {number} nowMs — Unix ms (for one_time)
 * @returns {boolean}
 */
function isWindowActive(window, egyptNow, nowMs) {
  if (!window.enabled) return false;

  if (window.type === 'recurring') {
    const day = egyptNow.getUTCDay();
    const hour = egyptNow.getUTCHours();
    if (!Array.isArray(window.daysOfWeek) || !window.daysOfWeek.includes(day)) return false;
    if (hour < window.startHour || hour >= window.endHour) return false;
    return true;
  }

  if (window.type === 'one_time') {
    const start = new Date(window.startAt).getTime();
    const end = new Date(window.endAt).getTime();
    return nowMs >= start && nowMs < end;
  }

  return false;
}

/**
 * Check if a user is currently available based on their windows.
 * If user has no windows: returns defaultBehavior === 'always_available'.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function isAvailableNow(userId) {
  if (!config.AVAILABILITY_WINDOWS || !config.AVAILABILITY_WINDOWS.enabled) return true;

  const windows = await listByUser(userId);
  if (windows.length === 0) {
    return config.AVAILABILITY_WINDOWS.defaultBehavior === 'always_available';
  }

  const egyptNow = getEgyptNow();
  const nowMs = Date.now();

  for (const w of windows) {
    if (isWindowActive(w, egyptNow, nowMs)) return true;
  }

  return false;
}

/**
 * For testing — exposed for unit test access.
 */
export const _testHelpers = { isWindowActive, getEgyptNow, validateFields };
