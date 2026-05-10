// ═══════════════════════════════════════════════════════════════
// server/services/alertDeliveryHistory.js — Persistent Alert Delivery History (Phase 52)
// ═══════════════════════════════════════════════════════════════
// Durable delivery records for admin alerts.
// Used by queued webhook/email delivery handlers.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  deleteJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';
import { enqueueJob } from './opsQueue.js';

function isEnabled() {
  return !!(config.ALERT_DELIVERY && config.ALERT_DELIVERY.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'adl_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function deliveryPath(deliveryId) {
  return getRecordPath('alert_deliveries', deliveryId);
}

function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (typeof value === 'string') out[key] = value.slice(0, 2000);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) out[key] = value;
    else {
      try {
        out[key] = JSON.parse(JSON.stringify(value));
      } catch (_) {
        out[key] = String(value).slice(0, 1000);
      }
    }
  }
  return out;
}

/**
 * Create persistent delivery record.
 */
export async function createDelivery(params = {}) {
  if (!isEnabled()) return null;

  const id = params.id || generateId();

  return withLock(`alert-delivery:${id}`, async () => {
    const existing = await readJSON(deliveryPath(id));
    if (existing) return existing;

    const now = nowIso();

    const record = {
      id,
      eventType: params.eventType || 'unknown',
      severity: params.severity || 'medium',
      channel: params.channel || 'webhook',
      status: 'queued',
      payload: sanitizePayload(params.payload || {}),
      queueJobId: params.queueJobId || null,
      attempts: [],
      lastAttemptAt: null,
      deliveredAt: null,
      failedAt: null,
      deadLetteredAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await atomicWrite(deliveryPath(id), record);

    eventBus.emit('alert_delivery:created', {
      deliveryId: id,
      eventType: record.eventType,
      channel: record.channel,
      severity: record.severity,
      timestamp: now,
    });

    return record;
  });
}

export async function getDelivery(deliveryId) {
  if (!deliveryId || typeof deliveryId !== 'string') return null;
  return await readJSON(deliveryPath(deliveryId));
}

/**
 * Mark delivery as running when a queue worker starts delivery.
 * @param {string} deliveryId
 */
export async function markRunning(deliveryId) {
  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return null;

    if (record.status === 'delivered' || record.status === 'dead-letter') {
      return record;
    }

    record.status = 'running';
    record.updatedAt = nowIso();

    await atomicWrite(deliveryPath(deliveryId), record);

    eventBus.emit('alert_delivery:running', {
      deliveryId,
      eventType: record.eventType,
      channel: record.channel,
      timestamp: record.updatedAt,
    });

    return record;
  });
}

export async function listDeliveries(options = {}) {
  if (!isEnabled()) {
    return { deliveries: [], total: 0, limit: 20, offset: 0 };
  }

  const dir = getCollectionPath('alert_deliveries');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('adl_'));

  if (options.status) rows = rows.filter(r => r.status === options.status);
  if (options.channel) rows = rows.filter(r => r.channel === options.channel);
  if (options.eventType) rows = rows.filter(r => r.eventType === options.eventType);
  if (options.severity) rows = rows.filter(r => r.severity === options.severity);

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    deliveries: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Append one attempt record.
 */
export async function recordAttempt(deliveryId, attempt) {
  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return null;

    const now = nowIso();
    record.attempts = Array.isArray(record.attempts) ? record.attempts : [];
    record.attempts.push({
      attempt: attempt.attempt || record.attempts.length + 1,
      startedAt: attempt.startedAt || now,
      completedAt: attempt.completedAt || now,
      ok: !!attempt.ok,
      statusCode: attempt.statusCode || null,
      error: attempt.error ? String(attempt.error).slice(0, 2000) : null,
      channel: attempt.channel || record.channel,
    });

    record.lastAttemptAt = now;
    record.status = attempt.ok ? record.status : 'failed';
    record.updatedAt = now;

    await atomicWrite(deliveryPath(deliveryId), record);

    if (!attempt.ok) {
      eventBus.emit('alert_delivery:failed', {
        deliveryId,
        eventType: record.eventType,
        channel: record.channel,
        error: attempt.error || null,
        timestamp: now,
      });
    }

    return record;
  });
}

export async function markDelivered(deliveryId, result = {}) {
  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return null;

    const now = nowIso();
    record.status = 'delivered';
    record.deliveredAt = now;
    record.failedAt = null;
    record.deadLetteredAt = null;
    record.result = result || {};
    record.updatedAt = now;

    await atomicWrite(deliveryPath(deliveryId), record);

    eventBus.emit('alert_delivery:delivered', {
      deliveryId,
      eventType: record.eventType,
      channel: record.channel,
      timestamp: now,
    });

    return record;
  });
}

export async function markFailed(deliveryId, error) {
  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return null;

    const now = nowIso();
    record.status = 'failed';
    record.failedAt = now;
    record.lastError = error ? String(error).slice(0, 2000) : null;
    record.updatedAt = now;

    await atomicWrite(deliveryPath(deliveryId), record);

    eventBus.emit('alert_delivery:failed', {
      deliveryId,
      eventType: record.eventType,
      channel: record.channel,
      error: record.lastError,
      timestamp: now,
    });

    return record;
  });
}

export async function markDeadLettered(deliveryId, reason) {
  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return null;

    const now = nowIso();
    record.status = 'dead-letter';
    record.deadLetteredAt = now;
    record.lastError = reason ? String(reason).slice(0, 2000) : record.lastError || null;
    record.updatedAt = now;

    await atomicWrite(deliveryPath(deliveryId), record);

    eventBus.emit('alert_delivery:dead_lettered', {
      deliveryId,
      eventType: record.eventType,
      channel: record.channel,
      reason: record.lastError,
      timestamp: now,
    });

    return record;
  });
}

/**
 * Attach queue job ID after enqueue.
 * @param {string} deliveryId
 * @param {string} queueJobId
 */
export async function setDeliveryQueueJobId(deliveryId, queueJobId) {
  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return null;

    record.queueJobId = queueJobId || null;
    record.updatedAt = nowIso();

    await atomicWrite(deliveryPath(deliveryId), record);
    return record;
  });
}

/**
 * Manual retry for failed/dead-letter delivery.
 */
export async function retryDelivery(deliveryId, adminId = 'admin_token') {
  if (!config.ALERT_DELIVERY?.manualRetryEnabled) {
    return { ok: false, error: 'MANUAL_RETRY_DISABLED' };
  }

  return withLock(`alert-delivery:${deliveryId}`, async () => {
    const record = await getDelivery(deliveryId);
    if (!record) return { ok: false, error: 'DELIVERY_NOT_FOUND' };

    if (record.status === 'delivered') {
      return { ok: false, error: 'DELIVERY_ALREADY_DELIVERED', delivery: record };
    }

    const now = nowIso();
    record.status = 'queued';
    record.failedAt = null;
    record.deadLetteredAt = null;
    record.updatedAt = now;

    await atomicWrite(deliveryPath(deliveryId), record);

    const type = record.channel === 'email'
      ? 'admin_alert_email'
      : 'admin_alert_webhook';

    const enqueueResult = await enqueueJob({
      type,
      priority: record.severity === 'critical' || record.severity === 'high' ? 'high' : 'normal',
      payload: {
        deliveryId: record.id,
        payload: record.payload,
      },
      idempotencyKey: `alert_delivery_retry:${deliveryId}:${Date.now()}`,
      maxAttempts: config.ALERT_DELIVERY?.maxAttempts || config.OPS_QUEUE?.maxAttempts || 5,
      backoffMs: config.ALERT_DELIVERY?.retryBackoffMs || config.OPS_QUEUE?.defaultBackoffMs || 30000,
      createdBy: adminId || 'admin_token',
    });

    if (enqueueResult.ok && enqueueResult.job) {
      record.queueJobId = enqueueResult.job.id;
      record.updatedAt = nowIso();
      await atomicWrite(deliveryPath(deliveryId), record);
    }

    eventBus.emit('alert_delivery:retried', {
      deliveryId,
      queueJobId: record.queueJobId,
      adminId,
      timestamp: nowIso(),
    });

    return { ok: true, delivery: record, queueJob: enqueueResult.job || null };
  });
}

export async function getAlertDeliveryStats() {
  if (!isEnabled()) return { enabled: false };

  const dir = getCollectionPath('alert_deliveries');
  const rows = await listJSON(dir);
  const deliveries = rows.filter(r => r && r.id && r.id.startsWith('adl_'));

  const byStatus = {
    queued: 0,
    running: 0,
    delivered: 0,
    failed: 0,
    'dead-letter': 0,
    cancelled: 0,
  };

  const byChannel = {};
  let attempts = 0;

  for (const d of deliveries) {
    if (byStatus[d.status] !== undefined) byStatus[d.status]++;
    byChannel[d.channel] = (byChannel[d.channel] || 0) + 1;
    attempts += Array.isArray(d.attempts) ? d.attempts.length : 0;
  }

  return {
    enabled: true,
    total: deliveries.length,
    byStatus,
    byChannel,
    attempts,
    deliveredRate: deliveries.length > 0
      ? Math.round((byStatus.delivered / deliveries.length) * 100)
      : 0,
  };
}

export async function cleanupOldDeliveries() {
  if (!isEnabled()) return 0;

  const retentionDays = config.ALERT_DELIVERY?.historyRetentionDays || 90;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const dir = getCollectionPath('alert_deliveries');
  const rows = await listJSON(dir);

  let cleaned = 0;
  for (const d of rows) {
    if (!d || !d.id) continue;
    const basis = d.deliveredAt || d.deadLetteredAt || d.failedAt || d.updatedAt || d.createdAt;
    if (basis && new Date(basis).getTime() < cutoff) {
      await deleteJSON(deliveryPath(d.id)).catch(() => {});
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info('alertDeliveryHistory: cleaned old deliveries', { cleaned });
  }

  return cleaned;
}

export const _testHelpers = {
  generateId,
  sanitizePayload,
  deliveryPath,
};
