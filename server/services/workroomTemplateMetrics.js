// ═══════════════════════════════════════════════════════════════
// server/services/workroomTemplateMetrics.js — Template Usage Metrics (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Tracks Workroom quick template usage.
// Storage: data/metrics/workroom-template-usage.json
//
// Metrics:
//   - byRole
//   - byTemplateKey
//   - byDay
//   - total
//
// Fire-and-forget safe. Atomic writes. Single-writer lock.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const METRICS_ID = 'workroom-template-usage';

function isEnabled() {
  return !!(
    config.WORKROOM_V2 &&
    config.WORKROOM_V2.enabled &&
    config.WORKROOM_V2.templateAnalyticsEnabled
  );
}

function nowIso() {
  return new Date().toISOString();
}

function metricsPath() {
  return getRecordPath('workroom_template_metrics', METRICS_ID);
}

function toEgyptDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  const egyptMs = d.getTime() + 2 * 60 * 60 * 1000;
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(egyptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyMetrics() {
  return {
    id: METRICS_ID,
    version: 1,
    total: 0,
    byRole: {
      worker: 0,
      employer: 0,
      unknown: 0,
    },
    byTemplateKey: {},
    byDay: {},
    lastUsedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function normalizeRole(role) {
  if (role === 'worker' || role === 'employer') return role;
  return 'unknown';
}

function safeTemplateKey(templateKey) {
  if (!templateKey || typeof templateKey !== 'string') return '';
  const clean = templateKey.trim().slice(0, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return '';
  return clean;
}

/**
 * Record one template usage event.
 *
 * @param {{
 *   jobId: string,
 *   messageId?: string,
 *   userId: string,
 *   role: 'worker'|'employer',
 *   templateKey: string,
 *   timestamp?: string
 * }} params
 */
export async function recordTemplateUsage(params = {}) {
  if (!isEnabled()) return { recorded: false, disabled: true };

  const templateKey = safeTemplateKey(params.templateKey);
  if (!templateKey) return { recorded: false, error: 'INVALID_TEMPLATE_KEY' };

  const role = normalizeRole(params.role);
  const timestamp = params.timestamp || nowIso();
  const day = toEgyptDate(timestamp);

  return withLock('workroom-template-metrics', async () => {
    const filePath = metricsPath();
    const metrics = (await readJSON(filePath)) || emptyMetrics();

    metrics.total = (metrics.total || 0) + 1;

    if (!metrics.byRole) metrics.byRole = {};
    metrics.byRole[role] = (metrics.byRole[role] || 0) + 1;

    if (!metrics.byTemplateKey) metrics.byTemplateKey = {};
    if (!metrics.byTemplateKey[templateKey]) {
      metrics.byTemplateKey[templateKey] = {
        templateKey,
        count: 0,
        byRole: {},
        lastUsedAt: null,
      };
    }

    metrics.byTemplateKey[templateKey].count++;
    metrics.byTemplateKey[templateKey].byRole[role] =
      (metrics.byTemplateKey[templateKey].byRole[role] || 0) + 1;
    metrics.byTemplateKey[templateKey].lastUsedAt = timestamp;

    if (!metrics.byDay) metrics.byDay = {};
    if (!metrics.byDay[day]) {
      metrics.byDay[day] = {
        date: day,
        total: 0,
        byRole: {},
        byTemplateKey: {},
      };
    }

    metrics.byDay[day].total++;
    metrics.byDay[day].byRole[role] = (metrics.byDay[day].byRole[role] || 0) + 1;
    metrics.byDay[day].byTemplateKey[templateKey] =
      (metrics.byDay[day].byTemplateKey[templateKey] || 0) + 1;

    metrics.lastUsedAt = timestamp;
    metrics.updatedAt = nowIso();
    if (!metrics.createdAt) metrics.createdAt = metrics.updatedAt;

    await atomicWrite(filePath, metrics);

    eventBus.emit('workroom:template_used', {
      jobId: params.jobId || null,
      messageId: params.messageId || null,
      userId: params.userId || null,
      role,
      templateKey,
      timestamp,
    });

    return {
      recorded: true,
      templateKey,
      role,
      day,
    };
  });
}

/**
 * Get template usage stats.
 *
 * @param {{ from?: string, to?: string, role?: string, limit?: number }} options
 */
export async function getTemplateUsageStats(options = {}) {
  if (!isEnabled()) {
    return {
      enabled: false,
      total: 0,
      byRole: {},
      topTemplates: [],
      byDay: [],
    };
  }

  let metrics;
  try {
    metrics = (await readJSON(metricsPath())) || emptyMetrics();
  } catch (err) {
    logger.warn('workroomTemplateMetrics: read failed', { error: err.message });
    metrics = emptyMetrics();
  }

  const from = options.from ? String(options.from).slice(0, 10) : null;
  const to = options.to ? String(options.to).slice(0, 10) : null;
  const role = options.role ? normalizeRole(options.role) : null;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 10));

  let byDay = Object.values(metrics.byDay || {});
  if (from) byDay = byDay.filter(d => d.date >= from);
  if (to) byDay = byDay.filter(d => d.date <= to);

  byDay = byDay.map(d => {
    if (!role) return d;
    return {
      date: d.date,
      total: d.byRole?.[role] || 0,
      byRole: { [role]: d.byRole?.[role] || 0 },
      byTemplateKey: d.byTemplateKey || {},
    };
  }).sort((a, b) => a.date.localeCompare(b.date));

  let topTemplates = Object.values(metrics.byTemplateKey || {});
  if (role) {
    topTemplates = topTemplates.map(t => ({
      templateKey: t.templateKey,
      count: t.byRole?.[role] || 0,
      byRole: { [role]: t.byRole?.[role] || 0 },
      lastUsedAt: t.lastUsedAt || null,
    }));
  }

  topTemplates = topTemplates
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    enabled: true,
    total: metrics.total || 0,
    byRole: metrics.byRole || {},
    topTemplates,
    byDay,
    lastUsedAt: metrics.lastUsedAt || null,
    updatedAt: metrics.updatedAt || null,
  };
}

/**
 * Reset metrics — test helper / operational recovery.
 */
export async function resetTemplateUsageStats() {
  const metrics = emptyMetrics();
  await atomicWrite(metricsPath(), metrics);
  return metrics;
}

export const _testHelpers = {
  isEnabled,
  metricsPath,
  toEgyptDate,
  emptyMetrics,
  normalizeRole,
  safeTemplateKey,
};
