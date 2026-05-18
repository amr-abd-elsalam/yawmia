// ═══════════════════════════════════════════════════════════════
// server/services/workroomAdoptionMetrics.js — Workroom Adoption Metrics (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Aggregate/admin-only Workroom V2 adoption telemetry.
// Storage:
//   data/metrics/product-intelligence/workroom-adoption-YYYY-MM.json
//
// Tracks:
//   - workroom opened
//   - message sent
//   - quick template used
//   - attachment uploaded
//   - checklist item created/completed
//   - message pinned
//   - search used
//   - timeline viewed
//   - read receipt created
//
// Privacy:
//   - no message text
//   - no attachment content
//   - no phone/name
//   - aggregate by role/day/event only
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

function dayKey(iso = nowIso()) {
  return String(iso).slice(0, 10);
}

function metricsId(month) {
  return `workroom-adoption-${month}`;
}

function metricsPath(month) {
  return getRecordPath('product_intelligence', metricsId(month));
}

function safeRole(role) {
  if (role === 'worker' || role === 'employer' || role === 'admin') return role;
  return 'unknown';
}

function safeEventType(eventType) {
  if (!eventType || typeof eventType !== 'string') return 'unknown';
  const clean = eventType.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return clean || 'unknown';
}

function emptyMetrics(month) {
  const now = nowIso();
  return {
    id: metricsId(month),
    kind: 'workroom_adoption',
    version: 1,
    month,
    totals: {
      opened: 0,
      messageSent: 0,
      templateUsed: 0,
      attachmentUploaded: 0,
      checklistCreated: 0,
      checklistCompleted: 0,
      messagePinned: 0,
      searchUsed: 0,
      timelineViewed: 0,
      readReceiptCreated: 0,
    },
    byRole: {},
    byEvent: {},
    byDay: {},
    createdAt: now,
    updatedAt: now,
  };
}

function ensureRole(data, role) {
  if (!data.byRole) data.byRole = {};
  if (!data.byRole[role]) {
    data.byRole[role] = {
      opened: 0,
      messageSent: 0,
      templateUsed: 0,
      attachmentUploaded: 0,
      checklistCreated: 0,
      checklistCompleted: 0,
      messagePinned: 0,
      searchUsed: 0,
      timelineViewed: 0,
      readReceiptCreated: 0,
    };
  }
  return data.byRole[role];
}

function ensureEvent(data, eventType) {
  if (!data.byEvent) data.byEvent = {};
  if (!data.byEvent[eventType]) {
    data.byEvent[eventType] = {
      eventType,
      count: 0,
      byRole: {},
      lastSeenAt: null,
    };
  }
  return data.byEvent[eventType];
}

function ensureDay(data, day) {
  if (!data.byDay) data.byDay = {};
  if (!data.byDay[day]) {
    data.byDay[day] = {
      date: day,
      opened: 0,
      messageSent: 0,
      templateUsed: 0,
      attachmentUploaded: 0,
      checklistCreated: 0,
      checklistCompleted: 0,
      messagePinned: 0,
      searchUsed: 0,
      timelineViewed: 0,
      readReceiptCreated: 0,
    };
  }
  return data.byDay[day];
}

const EVENT_TO_TOTAL_KEY = {
  opened: 'opened',
  message_sent: 'messageSent',
  template_used: 'templateUsed',
  attachment_uploaded: 'attachmentUploaded',
  checklist_item_created: 'checklistCreated',
  checklist_item_completed: 'checklistCompleted',
  message_pinned: 'messagePinned',
  search_used: 'searchUsed',
  timeline_viewed: 'timelineViewed',
  read_receipt_created: 'readReceiptCreated',
};

async function mutate(timestamp, fn) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const month = monthKey(timestamp);
  return withLock(`workroom-adoption:${month}`, async () => {
    const filePath = metricsPath(month);
    const data = (await readJSON(filePath)) || emptyMetrics(month);

    await fn(data);

    data.updatedAt = nowIso();
    await atomicWrite(filePath, data);

    return { ok: true, month, data };
  });
}

/**
 * Record one workroom adoption event.
 *
 * @param {{
 *   eventType: string,
 *   role?: string,
 *   jobId?: string,
 *   userId?: string,
 *   timestamp?: string
 * }} params
 */
export async function recordWorkroomAdoptionEvent(params = {}) {
  if (!isEnabled()) return { recorded: false, disabled: true };

  const timestamp = params.timestamp || nowIso();
  const eventType = safeEventType(params.eventType);
  const role = safeRole(params.role);
  const totalKey = EVENT_TO_TOTAL_KEY[eventType];

  if (!totalKey) {
    return { recorded: false, error: 'UNKNOWN_EVENT_TYPE', eventType };
  }

  await mutate(timestamp, async (data) => {
    if (!data.totals[totalKey]) data.totals[totalKey] = 0;
    data.totals[totalKey]++;

    const roleRow = ensureRole(data, role);
    if (!roleRow[totalKey]) roleRow[totalKey] = 0;
    roleRow[totalKey]++;

    const day = ensureDay(data, dayKey(timestamp));
    if (!day[totalKey]) day[totalKey] = 0;
    day[totalKey]++;

    const eventRow = ensureEvent(data, eventType);
    eventRow.count++;
    eventRow.byRole[role] = (eventRow.byRole[role] || 0) + 1;
    eventRow.lastSeenAt = timestamp;
  });

  return { recorded: true, eventType, role };
}

/**
 * Get aggregate adoption metrics.
 */
export async function getWorkroomAdoptionMetrics(options = {}) {
  if (!isEnabled()) return { enabled: false, totals: {}, byEvent: [] };

  const month = options.month || monthKey();
  const data = (await readJSON(metricsPath(month))) || emptyMetrics(month);

  const byEvent = Object.values(data.byEvent || {})
    .sort((a, b) => b.count - a.count || String(a.eventType).localeCompare(String(b.eventType)));

  const totals = data.totals || {};
  const opened = totals.opened || 0;
  const messageSent = totals.messageSent || 0;
  const messagePerOpen = opened > 0
    ? Math.round((messageSent / opened) * 100) / 100
    : 0;

  const checklistUsage = (totals.checklistCreated || 0) + (totals.checklistCompleted || 0);
  const collaborationEvents =
    (totals.attachmentUploaded || 0) +
    checklistUsage +
    (totals.messagePinned || 0) +
    (totals.searchUsed || 0);

  return {
    enabled: true,
    month,
    totals,
    byRole: data.byRole || {},
    byEvent,
    byDay: Object.values(data.byDay || {}).sort((a, b) => a.date.localeCompare(b.date)),
    rates: {
      messagePerOpen,
      collaborationEvents,
    },
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Rollup wrapper for queue/scheduler.
 */
export async function rollupWorkroomAdoption(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const month = options.month || monthKey();
  const result = await getWorkroomAdoptionMetrics({ month });

  eventBus.emit('workroom_adoption:rollup_completed', {
    month,
    opened: result.totals?.opened || 0,
    messageSent: result.totals?.messageSent || 0,
    timestamp: nowIso(),
  });

  return {
    ok: true,
    month,
    totals: result.totals,
    rates: result.rates,
    generatedAt: nowIso(),
  };
}

// EventBus listeners.
const LISTENER_FLAG = '__yawmiaWorkroomAdoptionListenersRegistered';

if (isEnabled() && !globalThis[LISTENER_FLAG]) {
  globalThis[LISTENER_FLAG] = true;

  const eventMap = {
    'workroom:opened': 'opened',
    'workroom:message_sent': 'message_sent',
    'workroom:template_used': 'template_used',
    'workroom:attachment_uploaded': 'attachment_uploaded',
    'workroom:checklist_item_created': 'checklist_item_created',
    'workroom:checklist_item_completed': 'checklist_item_completed',
    'workroom:message_pinned': 'message_pinned',
    'workroom:search_used': 'search_used',
    'workroom:timeline_viewed': 'timeline_viewed',
    'workroom:read_receipt_created': 'read_receipt_created',
  };

  for (const [eventName, eventType] of Object.entries(eventMap)) {
    eventBus.on(eventName, (data = {}) => {
      recordWorkroomAdoptionEvent({
        eventType,
        role: data.role || data.userRole || data.senderRole || 'unknown',
        jobId: data.jobId || null,
        userId: data.userId || data.senderId || null,
        timestamp: data.timestamp || nowIso(),
      }).catch(err => {
        logger.warn('workroomAdoptionMetrics: record failed', {
          eventName,
          error: err.message,
        });
      });
    });
  }
}

export const _testHelpers = {
  isEnabled,
  monthKey,
  dayKey,
  metricsId,
  metricsPath,
  safeRole,
  safeEventType,
  emptyMetrics,
  EVENT_TO_TOTAL_KEY,
};
