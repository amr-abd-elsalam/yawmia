// ═══════════════════════════════════════════════════════════════
// server/services/adminAlertChannels.js — Multi-Channel Admin Alerting (Phase 49)
// ═══════════════════════════════════════════════════════════════
// Adapter pattern for admin alerts:
//   - webhook channel via native fetch()
//   - email placeholder channel
//
// Delivery:
//   - Promise.allSettled across enabled channels
//   - per-event-type rate limiting
//   - bounded in-memory queue (drop oldest if full)
//   - fire-and-forget EventBus listeners
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

/** @type {Map<string, number[]>} eventType → timestamps */
const rateTracker = new Map();

/** @type {Array<object>} bounded queue of recent pending/delivered alert attempts */
const alertQueue = [];

let listenersRegistered = false;

const SEVERITY_ORDER = { low: 1, medium: 2, high: 3, critical: 4 };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function severityPasses(actual, minimum) {
  const a = SEVERITY_ORDER[actual] || 0;
  const m = SEVERITY_ORDER[minimum] || 0;
  return a >= m;
}

function isEnabled() {
  return !!(
    (config.ADMIN_ALERT_CHANNELS && config.ADMIN_ALERT_CHANNELS.enabled) ||
    process.env.ADMIN_ALERT_CHANNELS_ENABLED === 'true'
  );
}

function enqueue(entry) {
  const max = config.ADMIN_ALERT_CHANNELS?.queueMaxSize || 100;
  alertQueue.push(entry);
  while (alertQueue.length > max) {
    alertQueue.shift();
  }
}

function checkRateLimit(eventType) {
  const cfg = config.ADMIN_ALERT_CHANNELS || {};
  const max = cfg.rateLimitPerEventType || 5;
  const windowMs = cfg.rateLimitWindowMs || (60 * 60 * 1000);
  const now = Date.now();

  let timestamps = rateTracker.get(eventType) || [];
  timestamps = timestamps.filter(ts => now - ts < windowMs);

  if (timestamps.length >= max) {
    rateTracker.set(eventType, timestamps);
    return false;
  }

  timestamps.push(now);
  rateTracker.set(eventType, timestamps);
  return true;
}

function formatPayload(event) {
  const data = event.data || {};
  const timestamp = event.timestamp || new Date().toISOString();

  const summary = data.summary
    || data.message
    || data.flagType
    || data.fingerprint
    || data.offerId
    || data.sizeMB
    || event.type;

  let link = '/admin.html';
  if (data.fingerprint) {
    link = `/admin.html#abuseSignalsSection`;
  }

  return {
    event: event.type,
    severity: event.severity || 'medium',
    timestamp,
    summary: String(summary || event.type).slice(0, 500),
    link,
    details: sanitizeDetails(data),
  };
}

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === undefined) continue;
    if (typeof value === 'string') {
      out[key] = value.slice(0, 1000);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[key] = value;
    } else {
      try {
        out[key] = JSON.stringify(value).slice(0, 1000);
      } catch (_) {
        out[key] = '[unserializable]';
      }
    }
  }
  return out;
}

/**
 * Webhook adapter.
 *
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, channel: string, statusCode?: number, error?: string }>}
 */
export async function sendWebhook(payload) {
  const channel = 'webhook';
  const cfg = config.ADMIN_ALERT_CHANNELS?.webhook || {};

  const url = process.env.ADMIN_ALERT_WEBHOOK_URL || cfg.url;
  const enabled = cfg.enabled || !!process.env.ADMIN_ALERT_WEBHOOK_URL;

  if (!enabled || !url) {
    return { ok: false, channel, error: 'Webhook channel disabled or URL missing' };
  }

  const retryCount = cfg.retryCount || 3;
  const timeoutMs = cfg.timeoutMs || 5000;

  let lastError = null;
  let lastStatusCode = null;

  for (let attempt = 0; attempt < retryCount; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });

      lastStatusCode = res.status;

      if (res.ok) {
        return { ok: true, channel, statusCode: res.status };
      }

      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }

    if (attempt < retryCount - 1) {
      await sleep(500 * Math.pow(2, attempt));
    }
  }

  return { ok: false, channel, statusCode: lastStatusCode || undefined, error: lastError || 'Webhook failed' };
}

/**
 * Email adapter placeholder.
 *
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, channel: string, error?: string }>}
 */
export async function sendEmail(payload) {
  const channel = 'email';
  const cfg = config.ADMIN_ALERT_CHANNELS?.email || {};
  const enabled = cfg.enabled && cfg.apiKey && Array.isArray(cfg.toEmails) && cfg.toEmails.length > 0;

  if (!enabled) {
    return { ok: false, channel, error: 'Email channel disabled or not configured' };
  }

  // Deferred initial implementation — transactional provider can be wired later.
  logger.info('Admin alert email placeholder invoked', {
    toCount: cfg.toEmails.length,
    event: payload.event,
  });

  return { ok: false, channel, error: 'Email adapter placeholder — provider not configured' };
}

const adapters = {
  webhook: sendWebhook,
  email: sendEmail,
};

function shouldQueueDeliveries(options = {}) {
  if (options.sync === true) return false;
  return !!(
    config.OPS_QUEUE &&
    config.OPS_QUEUE.enabled &&
    config.ALERT_DELIVERY &&
    config.ALERT_DELIVERY.enabled
  );
}

function priorityFromSeverity(severity) {
  if (severity === 'critical') return 'critical';
  if (severity === 'high') return 'high';
  if (severity === 'medium') return 'normal';
  return 'low';
}

function buildAlertIdentity(event, payload) {
  const data = event.data || {};
  const raw = data.fingerprint
    || data.signalId
    || data.offerId
    || data.exportId
    || data.deliveryId
    || data.sizeMB
    || payload.summary
    || event.type;

  return crypto
    .createHash('sha256')
    .update(String(raw || event.type))
    .digest('hex')
    .slice(0, 24);
}

/**
 * Queue persistent delivery jobs for enabled alert channels.
 */
async function queueAlertDeliveries(event, payload, enabledChannels, severity) {
  const deliveries = [];
  const results = [];

  const {
    createDelivery,
    getDelivery,
    setDeliveryQueueJobId,
    markFailed,
  } = await import('./alertDeliveryHistory.js');
  const { enqueueJob } = await import('./opsQueue.js');

  const identity = buildAlertIdentity(event, payload);

  for (const channel of enabledChannels) {
    try {
      const deliveryId = `adl_${channel}_${identity}`;
      const existingDelivery = await getDelivery(deliveryId);

      // If the exact same alert/channel is already queued/running/delivered,
      // do not create an orphan delivery. Return the existing durable record.
      if (
        existingDelivery &&
        ['queued', 'running', 'delivered'].includes(existingDelivery.status)
      ) {
        deliveries.push(existingDelivery);
        results.push({
          ok: true,
          channel,
          queued: existingDelivery.status !== 'delivered',
          delivered: existingDelivery.status === 'delivered',
          deliveryId: existingDelivery.id,
          queueJobId: existingDelivery.queueJobId || null,
          deduped: true,
        });
        continue;
      }

      const delivery = await createDelivery({
        id: deliveryId,
        eventType: event.type,
        severity,
        channel,
        payload,
      });

      const jobType = channel === 'email' ? 'admin_alert_email' : 'admin_alert_webhook';

      const enqueueResult = await enqueueJob({
        type: jobType,
        priority: priorityFromSeverity(severity),
        payload: {
          deliveryId: delivery.id,
          payload,
        },
        idempotencyKey: `alert:${event.type}:${channel}:${identity}`,
        maxAttempts: (config.ALERT_DELIVERY && config.ALERT_DELIVERY.maxAttempts) || (config.OPS_QUEUE && config.OPS_QUEUE.maxAttempts) || 5,
        backoffMs: (config.ALERT_DELIVERY && config.ALERT_DELIVERY.retryBackoffMs) || (config.OPS_QUEUE && config.OPS_QUEUE.defaultBackoffMs) || 30000,
        createdBy: 'system',
      });

      if (enqueueResult && enqueueResult.ok && enqueueResult.job) {
        const updatedDelivery = await setDeliveryQueueJobId(delivery.id, enqueueResult.job.id);
        deliveries.push(updatedDelivery || { ...delivery, queueJobId: enqueueResult.job.id });
        results.push({
          ok: true,
          channel,
          queued: true,
          deliveryId: delivery.id,
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
        });
      } else {
        await markFailed(delivery.id, enqueueResult?.error || 'QUEUE_ENQUEUE_FAILED').catch(() => {});
        deliveries.push(delivery);
        results.push({
          ok: false,
          channel,
          queued: false,
          deliveryId: delivery.id,
          error: enqueueResult?.error || 'QUEUE_ENQUEUE_FAILED',
        });
      }
    } catch (err) {
      results.push({
        ok: false,
        channel,
        queued: false,
        error: err.message,
      });
    }
  }

  return {
    delivered: results.some(r => r.delivered),
    queued: results.some(r => r.ok && r.queued),
    deliveries,
    results,
  };
}

/**
 * Main delivery router.
 *
 * @param {{ type: string, severity?: string, data?: object, timestamp?: string }} event
 * @returns {Promise<{ delivered: boolean, rateLimited?: boolean, results: object[] }>}
 */
export async function deliverAdminAlert(event, options = {}) {
  if (!event || !event.type) {
    return { delivered: false, queued: false, results: [{ ok: false, error: 'Invalid event' }] };
  }

  if (!isEnabled()) {
    return { delivered: false, queued: false, results: [{ ok: false, error: 'ADMIN_ALERT_CHANNELS disabled' }] };
  }

  const routing = event.type === 'test'
    ? { enabled: true, minSeverity: 'low' } // webhook test endpoint
    : config.ADMIN_ALERT_CHANNELS.eventRouting?.[event.type];

  if (!routing || !routing.enabled) {
    return { delivered: false, queued: false, results: [{ ok: false, error: 'Event routing disabled' }] };
  }

  const severity = event.severity || 'medium';
  if (!severityPasses(severity, routing.minSeverity || 'medium')) {
    return { delivered: false, queued: false, results: [{ ok: false, error: 'Severity below route threshold' }] };
  }

  if (!checkRateLimit(event.type)) {
    logger.warn('Admin alert rate limited', { eventType: event.type });
    return { delivered: false, queued: false, rateLimited: true, results: [{ ok: false, error: 'RATE_LIMITED' }] };
  }

  const payload = formatPayload({ ...event, severity });
  enqueue({ payload, queuedAt: new Date().toISOString() });

  const configuredChannels = config.ADMIN_ALERT_CHANNELS.channels || [];
  const enabledChannels = configuredChannels.filter(ch => adapters[ch]);

  if (enabledChannels.length === 0) {
    return { delivered: false, queued: false, results: [{ ok: false, error: 'No configured channels' }] };
  }

  // Phase 52 default: durable queued delivery.
  // Existing direct behavior is preserved via deliverAdminAlert(event, { sync: true }).
  if (shouldQueueDeliveries(options)) {
    const queuedResult = await queueAlertDeliveries(event, payload, enabledChannels, severity);

    if (!queuedResult.queued) {
      logger.warn('Admin alert queueing failed on all channels', {
        eventType: event.type,
        results: queuedResult.results,
      });
    } else {
      logger.info('Admin alert queued for durable delivery', {
        eventType: event.type,
        deliveries: queuedResult.deliveries.length,
        channels: enabledChannels,
      });
    }

    return queuedResult;
  }

  // Legacy sync path.
  const settled = await Promise.allSettled(
    enabledChannels.map(channel => adapters[channel](payload))
  );

  const results = settled.map((r, idx) => {
    if (r.status === 'fulfilled') return r.value;
    return { ok: false, channel: enabledChannels[idx], error: r.reason?.message || String(r.reason) };
  });

  const delivered = results.some(r => r && r.ok);

  if (!delivered) {
    logger.warn('Admin alert delivery failed on all channels', {
      eventType: event.type,
      results,
    });
  } else {
    logger.info('Admin alert delivered', {
      eventType: event.type,
      channels: results.filter(r => r.ok).map(r => r.channel),
    });
  }

  return { delivered, queued: false, results };
}

/**
 * Register EventBus listeners once.
 */
export function registerListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  const subscribed = [
    'abuse_flag:detected_high_severity',
    'direct_offer:abuse_threshold_crossed',
    'counters:auto_rebuild_triggered',
    'audit_retention:cleanup_failed_threshold',
    'counters:file_size_critical',
  ];

  for (const eventName of subscribed) {
    eventBus.on(eventName, (data) => {
      deliverAdminAlert({
        type: eventName,
        severity: data?.severity || inferSeverity(eventName),
        data,
        timestamp: new Date().toISOString(),
      }).catch(err => {
        logger.warn('Admin alert listener failed', { eventName, error: err.message });
      });
    });
  }

  logger.info('Admin alert channels: listeners registered', { count: subscribed.length });
}

function inferSeverity(eventName) {
  if (eventName === 'abuse_flag:detected_high_severity') return 'high';
  if (eventName === 'direct_offer:abuse_threshold_crossed') return 'high';
  if (eventName === 'counters:file_size_critical') return 'high';
  if (eventName === 'counters:auto_rebuild_triggered') return 'medium';
  if (eventName === 'audit_retention:cleanup_failed_threshold') return 'medium';
  return 'medium';
}

/**
 * Cleanup stale rate-limit timestamps hourly.
 */
function cleanupRateTracker() {
  const now = Date.now();
  const windowMs = config.ADMIN_ALERT_CHANNELS?.rateLimitWindowMs || (60 * 60 * 1000);

  for (const [eventType, timestamps] of rateTracker) {
    const recent = timestamps.filter(ts => now - ts < windowMs);
    if (recent.length === 0) rateTracker.delete(eventType);
    else rateTracker.set(eventType, recent);
  }
}

const cleanupTimer = setInterval(cleanupRateTracker, 60 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

export function getStats() {
  return {
    enabled: isEnabled(),
    listenersRegistered,
    queueSize: alertQueue.length,
    rateTrackedEventTypes: rateTracker.size,
    channels: config.ADMIN_ALERT_CHANNELS?.channels || [],
  };
}

// Test helpers
export const _testHelpers = {
  rateTracker,
  alertQueue,
  checkRateLimit,
  formatPayload,
  sanitizeDetails,
  cleanupRateTracker,
  reset: () => {
    rateTracker.clear();
    alertQueue.length = 0;
    listenersRegistered = false;
  },
};
