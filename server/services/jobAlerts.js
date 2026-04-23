// ═══════════════════════════════════════════════════════════════
// server/services/jobAlerts.js — Job Alert Subscription System
// ═══════════════════════════════════════════════════════════════
// CRUD for user-defined job alerts with criteria-based matching.
// Listens to 'job:created' events and notifies matching users.
// Fire-and-forget — NEVER blocks job creation flow.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, deleteJSON, getRecordPath,
  getCollectionPath, listJSON,
  addToSetIndex, getFromSetIndex, removeFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const USER_ALERTS_INDEX = config.DATABASE.indexFiles.userAlertsIndex;

/**
 * Generate alert record ID
 */
function generateId() {
  return 'alt_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Create a new job alert
 * @param {string} userId
 * @param {{ name: string, criteria: { categories: string[], governorate?: string, minWage?: number, maxWage?: number } }} fields
 * @returns {Promise<{ ok: boolean, alert?: object, error?: string, code?: string }>}
 */
export async function createAlert(userId, fields) {
  // 1. Feature flag
  if (!config.JOB_ALERTS || !config.JOB_ALERTS.enabled) {
    return { ok: false, error: 'تنبيهات الفرص غير مفعّلة حالياً', code: 'ALERTS_DISABLED' };
  }

  const { name, criteria } = fields || {};

  // 2. Validate name
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return { ok: false, error: 'اسم التنبيه مطلوب (حرفين على الأقل)', code: 'NAME_REQUIRED' };
  }

  // 3. Validate criteria object
  if (!criteria || typeof criteria !== 'object') {
    return { ok: false, error: 'معايير التنبيه مطلوبة', code: 'CRITERIA_REQUIRED' };
  }

  // 4. Validate categories (required, at least one)
  if (!criteria.categories || !Array.isArray(criteria.categories) || criteria.categories.length === 0) {
    return { ok: false, error: 'اختار تخصص واحد على الأقل', code: 'CATEGORIES_REQUIRED' };
  }

  // Validate each category ID
  const validCategoryIds = new Set(config.LABOR_CATEGORIES.map(c => c.id));
  for (const catId of criteria.categories) {
    if (!validCategoryIds.has(catId)) {
      return { ok: false, error: `التخصص "${catId}" غير موجود`, code: 'INVALID_CATEGORY' };
    }
  }

  // 5. Validate governorate (optional)
  if (criteria.governorate !== undefined && criteria.governorate !== null && criteria.governorate !== '') {
    const validGovIds = new Set(config.REGIONS.governorates.map(g => g.id));
    if (!validGovIds.has(criteria.governorate)) {
      return { ok: false, error: 'المحافظة غير موجودة', code: 'INVALID_GOVERNORATE' };
    }
  }

  // 6. Validate wage range (optional)
  if (criteria.minWage !== undefined && criteria.minWage !== null) {
    if (typeof criteria.minWage !== 'number' || isNaN(criteria.minWage) || criteria.minWage < 0) {
      return { ok: false, error: 'الحد الأدنى للأجر لازم يكون رقم صحيح', code: 'INVALID_MIN_WAGE' };
    }
  }
  if (criteria.maxWage !== undefined && criteria.maxWage !== null) {
    if (typeof criteria.maxWage !== 'number' || isNaN(criteria.maxWage) || criteria.maxWage < 0) {
      return { ok: false, error: 'الحد الأقصى للأجر لازم يكون رقم صحيح', code: 'INVALID_MAX_WAGE' };
    }
  }
  if (criteria.minWage != null && criteria.maxWage != null && criteria.minWage > criteria.maxWage) {
    return { ok: false, error: 'الحد الأدنى للأجر لازم يكون أقل من أو يساوي الحد الأقصى', code: 'INVALID_WAGE_RANGE' };
  }

  // 7. Enforce max alerts per user
  const existingIds = await getFromSetIndex(USER_ALERTS_INDEX, userId);
  if (existingIds.length >= config.JOB_ALERTS.maxAlertsPerUser) {
    return { ok: false, error: `وصلت للحد الأقصى (${config.JOB_ALERTS.maxAlertsPerUser} تنبيهات)`, code: 'MAX_ALERTS_REACHED' };
  }

  // 8. Create alert record
  const id = generateId();
  const now = new Date().toISOString();

  const alert = {
    id,
    userId,
    name: name.trim(),
    criteria: {
      categories: criteria.categories,
      governorate: criteria.governorate || null,
      minWage: (criteria.minWage != null) ? criteria.minWage : null,
      maxWage: (criteria.maxWage != null) ? criteria.maxWage : null,
    },
    enabled: true,
    matchCount: 0,
    lastMatchedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  const alertPath = getRecordPath('alerts', id);
  await atomicWrite(alertPath, alert);

  // Update user-alerts index
  await addToSetIndex(USER_ALERTS_INDEX, userId, id);

  logger.info('Job alert created', { alertId: id, userId });

  return { ok: true, alert };
}

/**
 * List alerts for a user (index-accelerated, newest first)
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listByUser(userId) {
  const indexedIds = await getFromSetIndex(USER_ALERTS_INDEX, userId);

  if (indexedIds.length > 0) {
    const results = [];
    for (const altId of indexedIds) {
      const alert = await readJSON(getRecordPath('alerts', altId));
      if (alert) results.push(alert);
    }
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return results;
  }

  // Fallback: full scan
  const alertsDir = getCollectionPath('alerts');
  const all = await listJSON(alertsDir);
  return all
    .filter(a => a.id && a.id.startsWith('alt_') && a.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Delete an alert
 * @param {string} alertId
 * @param {string} userId — ownership check
 * @returns {Promise<{ ok: boolean, error?: string, code?: string }>}
 */
export async function deleteAlert(alertId, userId) {
  const alertPath = getRecordPath('alerts', alertId);
  const alert = await readJSON(alertPath);

  if (!alert) {
    return { ok: false, error: 'التنبيه غير موجود', code: 'ALERT_NOT_FOUND' };
  }

  if (alert.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تحذف هذا التنبيه', code: 'NOT_ALERT_OWNER' };
  }

  await deleteJSON(alertPath);
  await removeFromSetIndex(USER_ALERTS_INDEX, userId, alertId);

  logger.info('Job alert deleted', { alertId, userId });

  return { ok: true };
}

/**
 * Toggle alert enabled/disabled
 * @param {string} alertId
 * @param {string} userId — ownership check
 * @param {boolean} enabled
 * @returns {Promise<{ ok: boolean, alert?: object, error?: string, code?: string }>}
 */
export async function toggleAlert(alertId, userId, enabled) {
  const alertPath = getRecordPath('alerts', alertId);
  const alert = await readJSON(alertPath);

  if (!alert) {
    return { ok: false, error: 'التنبيه غير موجود', code: 'ALERT_NOT_FOUND' };
  }

  if (alert.userId !== userId) {
    return { ok: false, error: 'مش مسموحلك تعدّل هذا التنبيه', code: 'NOT_ALERT_OWNER' };
  }

  alert.enabled = !!enabled;
  alert.updatedAt = new Date().toISOString();

  await atomicWrite(alertPath, alert);

  return { ok: true, alert };
}

/**
 * Match a newly created job against all enabled alerts
 * Called by EventBus on 'job:created' — fire-and-forget
 * @param {object} job — full job object
 * @returns {Promise<number>} count of matched alerts
 */
export async function matchJobToAlerts(job) {
  if (!config.JOB_ALERTS || !config.JOB_ALERTS.enabled || !config.JOB_ALERTS.matchOnCreation) {
    return 0;
  }

  if (!job || !job.id || job.status !== 'open') return 0;

  // Full scan of all alerts (acceptable — alerts are few)
  const alertsDir = getCollectionPath('alerts');
  let allAlerts;
  try {
    allAlerts = await listJSON(alertsDir);
  } catch (_) {
    return 0;
  }

  const enabledAlerts = allAlerts.filter(a => a.id && a.id.startsWith('alt_') && a.enabled);

  if (enabledAlerts.length === 0) return 0;

  const cooldownMs = (config.JOB_ALERTS.cooldownMinutes || 60) * 60 * 1000;
  const now = Date.now();
  let matchCount = 0;

  for (const alert of enabledAlerts) {
    try {
      const criteria = alert.criteria;
      if (!criteria || !criteria.categories || !Array.isArray(criteria.categories)) continue;

      // Category match (required)
      if (!criteria.categories.includes(job.category)) continue;

      // Governorate match (optional — null means all governorates)
      if (criteria.governorate && criteria.governorate !== job.governorate) continue;

      // Wage range match (optional)
      if (criteria.minWage != null && (job.dailyWage || 0) < criteria.minWage) continue;
      if (criteria.maxWage != null && (job.dailyWage || 0) > criteria.maxWage) continue;

      // Cooldown check
      if (alert.lastMatchedAt) {
        const lastMatched = new Date(alert.lastMatchedAt).getTime();
        if (now - lastMatched < cooldownMs) continue;
      }

      // ── Match found — create notification ──
      const { createNotification } = await import('./notifications.js');
      const message = `🔔 فرصة مطابقة لتنبيه "${alert.name}": ${job.title} — ${job.dailyWage} جنيه/يوم`;

      await createNotification(
        alert.userId,
        'job_alert_match',
        message,
        { jobId: job.id, alertId: alert.id, alertName: alert.name }
      );

      // Update alert stats
      alert.matchCount = (alert.matchCount || 0) + 1;
      alert.lastMatchedAt = new Date().toISOString();
      alert.updatedAt = alert.lastMatchedAt;

      const alertPath = getRecordPath('alerts', alert.id);
      await atomicWrite(alertPath, alert);

      matchCount++;
    } catch (_) {
      // Fire-and-forget per alert — continue to next
    }
  }

  if (matchCount > 0) {
    logger.info('Job alerts matched', { jobId: job.id, matchCount });
  }

  return matchCount;
}

/**
 * Setup EventBus listener for job alert matching.
 * Registers 'job:created' listener if JOB_ALERTS.enabled is true.
 * Must be called after setupJobMatching().
 */
export function setupJobAlerts() {
  if (!config.JOB_ALERTS || !config.JOB_ALERTS.enabled) {
    logger.info('Job alerts: disabled via config');
    return;
  }

  eventBus.on('job:created', (data) => {
    if (!data || !data.jobId) return;
    // Fire-and-forget: load job and match against alerts
    import('./jobs.js').then(({ findById }) => {
      findById(data.jobId).then(job => {
        if (job) matchJobToAlerts(job).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  });

  logger.info('Job alerts: enabled');
}
