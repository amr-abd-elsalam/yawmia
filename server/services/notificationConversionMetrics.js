// ═══════════════════════════════════════════════════════════════
// server/services/notificationConversionMetrics.js — Notification Conversion Metrics (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Aggregate/admin-only notification action telemetry.
// Storage:
//   data/metrics/product-intelligence/notification-conversions-YYYY-MM.json
//
// Tracks:
//   - notification type
//   - action type
//   - clicks
//   - conversions
//   - CTR / conversion rate
//
// Privacy:
//   - no message body
//   - no phone/name
//   - notificationId not persisted in aggregate rows
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

function isEnabled() {
  return !!(config.PRODUCT_INTELLIGENCE && config.PRODUCT_INTELLIGENCE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function metricsId(month) {
  return `notification-conversions-${month}`;
}

function metricsPath(month) {
  return getRecordPath('product_intelligence', metricsId(month));
}

function safeKey(value, fallback = 'unknown') {
  if (!value || typeof value !== 'string') return fallback;
  const clean = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return clean || fallback;
}

function emptyMetrics(month) {
  const now = nowIso();
  return {
    id: metricsId(month),
    kind: 'notification_conversions',
    version: 1,
    month,
    totals: {
      clicks: 0,
      conversions: 0,
    },
    byType: {},
    byAction: {},
    matrix: {},
    createdAt: now,
    updatedAt: now,
  };
}

function ensureType(data, type) {
  if (!data.byType) data.byType = {};
  if (!data.byType[type]) {
    data.byType[type] = { type, clicks: 0, conversions: 0 };
  }
  return data.byType[type];
}

function ensureAction(data, actionType) {
  if (!data.byAction) data.byAction = {};
  if (!data.byAction[actionType]) {
    data.byAction[actionType] = { actionType, clicks: 0, conversions: 0 };
  }
  return data.byAction[actionType];
}

function ensureMatrix(data, type, actionType) {
  if (!data.matrix) data.matrix = {};
  const key = `${type}:${actionType}`;
  if (!data.matrix[key]) {
    data.matrix[key] = { key, type, actionType, clicks: 0, conversions: 0 };
  }
  return data.matrix[key];
}

async function mutate(timestamp, fn) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const month = monthKey(timestamp);
  return withLock(`notification-conversions:${month}`, async () => {
    const filePath = metricsPath(month);
    const data = (await readJSON(filePath)) || emptyMetrics(month);

    await fn(data);

    data.updatedAt = nowIso();
    await atomicWrite(filePath, data);

    return { ok: true, month, data };
  });
}

/**
 * Record notification action click.
 *
 * @param {{ notificationType?: string, actionType?: string, timestamp?: string }} params
 */
export async function recordNotificationActionClick(params = {}) {
  const timestamp = params.timestamp || nowIso();
  const type = safeKey(params.notificationType || params.type);
  const actionType = safeKey(params.actionType || params.action);

  await mutate(timestamp, async (data) => {
    data.totals.clicks++;

    ensureType(data, type).clicks++;
    ensureAction(data, actionType).clicks++;
    ensureMatrix(data, type, actionType).clicks++;
  });

  eventBus.emit('notification:action_click_recorded', {
    notificationType: type,
    actionType,
    timestamp,
  });

  return { recorded: true, notificationType: type, actionType };
}

/**
 * Record conversion after notification click/action.
 *
 * @param {{ notificationType?: string, actionType?: string, conversionType?: string, timestamp?: string }} params
 */
export async function recordNotificationConversion(params = {}) {
  const timestamp = params.timestamp || nowIso();
  const type = safeKey(params.notificationType || params.type);
  const actionType = safeKey(params.actionType || params.action);

  await mutate(timestamp, async (data) => {
    data.totals.conversions++;

    ensureType(data, type).conversions++;
    ensureAction(data, actionType).conversions++;
    ensureMatrix(data, type, actionType).conversions++;
  });

  eventBus.emit('notification:conversion_metric_recorded', {
    notificationType: type,
    actionType,
    conversionType: params.conversionType || 'unknown',
    timestamp,
  });

  return { recorded: true, notificationType: type, actionType };
}

/**
 * Get notification conversion metrics.
 */
export async function getNotificationConversionMetrics(options = {}) {
  if (!isEnabled()) return { enabled: false, totals: {}, rows: [] };

  const month = options.month || monthKey();
  const data = (await readJSON(metricsPath(month))) || emptyMetrics(month);

  const rows = Object.values(data.matrix || {}).map(row => {
    const ctrBase = row.clicks || 0;
    const conversionRate = ctrBase > 0 ? Math.round((row.conversions / ctrBase) * 100) : 0;
    return { ...row, conversionRate };
  }).sort((a, b) => b.clicks - a.clicks || b.conversions - a.conversions);

  return {
    enabled: true,
    month,
    totals: data.totals || {},
    byType: data.byType || {},
    byAction: data.byAction || {},
    rows,
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Rollup wrapper.
 */
export async function rollupNotificationConversions(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const month = options.month || monthKey();
  const result = await getNotificationConversionMetrics({ month });

  return {
    ok: true,
    month,
    totals: result.totals,
    rows: result.rows.slice(0, 20),
    generatedAt: nowIso(),
  };
}

const LISTENER_FLAG = '__yawmiaNotificationConversionListenersRegistered';

if (isEnabled() && !globalThis[LISTENER_FLAG]) {
  globalThis[LISTENER_FLAG] = true;

  eventBus.on('notification:action_clicked', (data) => {
    recordNotificationActionClick(data).catch(err => {
      logger.warn('notificationConversionMetrics: click failed', { error: err.message });
    });
  });

  eventBus.on('notification:conversion_recorded', (data) => {
    recordNotificationConversion(data).catch(err => {
      logger.warn('notificationConversionMetrics: conversion failed', { error: err.message });
    });
  });
}

export const _testHelpers = {
  isEnabled,
  monthKey,
  metricsId,
  metricsPath,
  safeKey,
  emptyMetrics,
};
