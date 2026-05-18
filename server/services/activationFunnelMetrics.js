// ═══════════════════════════════════════════════════════════════
// server/services/activationFunnelMetrics.js — Activation Funnel Metrics (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Aggregate/admin-only activation funnel telemetry.
// Storage:
//   data/metrics/product-intelligence/activation-YYYY-MM.json
//
// Tracks:
//   - profile task shown/clicked/completed
//   - profile completeness reached 80/100
//   - first application
//   - first job posted
//   - first accepted
//   - first check-in
//   - first payment
//   - first rating
//
// Privacy:
//   - aggregate counters only
//   - no phone/name/message text
//   - userId may appear only in transient EventBus payload, not persisted
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
  return `activation-${month}`;
}

function metricsPath(month) {
  return getRecordPath('product_intelligence', metricsId(month));
}

function safeTaskId(taskId) {
  if (!taskId || typeof taskId !== 'string') return 'unknown';
  const clean = taskId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  return clean || 'unknown';
}

function safeRole(role) {
  if (role === 'worker' || role === 'employer' || role === 'admin') return role;
  return 'unknown';
}

function emptyMetrics(month) {
  const now = nowIso();
  return {
    id: metricsId(month),
    kind: 'activation_funnel',
    version: 1,
    month,
    totals: {
      profileTaskShown: 0,
      profileTaskClicked: 0,
      profileTaskCompleted: 0,
      profileCompleteness80: 0,
      firstApplication: 0,
      firstJobPosted: 0,
      firstAccepted: 0,
      firstCheckin: 0,
      firstPayment: 0,
      firstRating: 0,
    },
    byRole: {},
    byTask: {},
    byDay: {},
    createdAt: now,
    updatedAt: now,
  };
}

function ensureRole(data, role) {
  if (!data.byRole) data.byRole = {};
  if (!data.byRole[role]) {
    data.byRole[role] = {
      profileTaskShown: 0,
      profileTaskClicked: 0,
      profileTaskCompleted: 0,
      profileCompleteness80: 0,
      firstApplication: 0,
      firstJobPosted: 0,
      firstAccepted: 0,
      firstCheckin: 0,
      firstPayment: 0,
      firstRating: 0,
    };
  }
  return data.byRole[role];
}

function ensureTask(data, taskId) {
  if (!data.byTask) data.byTask = {};
  if (!data.byTask[taskId]) {
    data.byTask[taskId] = {
      taskId,
      shown: 0,
      clicked: 0,
      completed: 0,
      lastSeenAt: null,
    };
  }
  return data.byTask[taskId];
}

function ensureDay(data, day) {
  if (!data.byDay) data.byDay = {};
  if (!data.byDay[day]) {
    data.byDay[day] = {
      date: day,
      profileTaskShown: 0,
      profileTaskClicked: 0,
      profileTaskCompleted: 0,
      profileCompleteness80: 0,
      firstApplication: 0,
      firstJobPosted: 0,
      firstAccepted: 0,
      firstCheckin: 0,
      firstPayment: 0,
      firstRating: 0,
    };
  }
  return data.byDay[day];
}

async function mutate(timestamp, fn) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const month = monthKey(timestamp);
  return withLock(`activation-funnel:${month}`, async () => {
    const filePath = metricsPath(month);
    const data = (await readJSON(filePath)) || emptyMetrics(month);

    await fn(data);

    data.updatedAt = nowIso();
    await atomicWrite(filePath, data);

    return { ok: true, month, data };
  });
}

function incLifecycle(data, key, role, timestamp) {
  if (!data.totals[key]) data.totals[key] = 0;
  data.totals[key]++;

  const roleRow = ensureRole(data, role);
  if (!roleRow[key]) roleRow[key] = 0;
  roleRow[key]++;

  const day = ensureDay(data, dayKey(timestamp));
  if (!day[key]) day[key] = 0;
  day[key]++;
}

/**
 * Record profile task shown.
 */
export async function recordProfileTaskShown(params = {}) {
  const timestamp = params.timestamp || nowIso();
  const taskId = safeTaskId(params.taskId);
  const role = safeRole(params.role);

  await mutate(timestamp, async (data) => {
    incLifecycle(data, 'profileTaskShown', role, timestamp);
    const task = ensureTask(data, taskId);
    task.shown++;
    task.lastSeenAt = timestamp;
  });

  return { recorded: true, taskId, role };
}

/**
 * Record profile task clicked.
 */
export async function recordProfileTaskClicked(params = {}) {
  const timestamp = params.timestamp || nowIso();
  const taskId = safeTaskId(params.taskId);
  const role = safeRole(params.role);

  await mutate(timestamp, async (data) => {
    incLifecycle(data, 'profileTaskClicked', role, timestamp);
    const task = ensureTask(data, taskId);
    task.clicked++;
    task.lastSeenAt = timestamp;
  });

  eventBus.emit('profile_task:clicked_recorded', {
    taskId,
    role,
    timestamp,
  });

  return { recorded: true, taskId, role };
}

/**
 * Record profile task completed.
 */
export async function recordProfileTaskCompleted(params = {}) {
  const timestamp = params.timestamp || nowIso();
  const taskId = safeTaskId(params.taskId);
  const role = safeRole(params.role);

  await mutate(timestamp, async (data) => {
    incLifecycle(data, 'profileTaskCompleted', role, timestamp);
    const task = ensureTask(data, taskId);
    task.completed++;
    task.lastSeenAt = timestamp;
  });

  return { recorded: true, taskId, role };
}

/**
 * Record a lifecycle milestone.
 *
 * @param {{ milestone: string, role?: string, timestamp?: string }} params
 */
export async function recordActivationMilestone(params = {}) {
  const timestamp = params.timestamp || nowIso();
  const role = safeRole(params.role);

  const map = {
    profile_completeness_80: 'profileCompleteness80',
    first_application: 'firstApplication',
    first_job_posted: 'firstJobPosted',
    first_accepted: 'firstAccepted',
    first_checkin: 'firstCheckin',
    first_payment: 'firstPayment',
    first_rating: 'firstRating',
  };

  const key = map[params.milestone];
  if (!key) return { recorded: false, error: 'INVALID_MILESTONE' };

  await mutate(timestamp, async (data) => {
    incLifecycle(data, key, role, timestamp);
  });

  return { recorded: true, milestone: params.milestone, role };
}

/**
 * Get activation funnel metrics.
 */
export async function getActivationFunnel(options = {}) {
  if (!isEnabled()) return { enabled: false, totals: {}, byTask: [] };

  const month = options.month || monthKey();
  const data = (await readJSON(metricsPath(month))) || emptyMetrics(month);

  let tasks = Object.values(data.byTask || {});
  tasks.sort((a, b) => (b.clicked || 0) - (a.clicked || 0) || (b.shown || 0) - (a.shown || 0));

  const totals = data.totals || {};
  const clickRate = totals.profileTaskShown > 0
    ? Math.round((totals.profileTaskClicked / totals.profileTaskShown) * 100)
    : 0;
  const completionRate = totals.profileTaskShown > 0
    ? Math.round((totals.profileTaskCompleted / totals.profileTaskShown) * 100)
    : 0;

  return {
    enabled: true,
    month,
    totals,
    byRole: data.byRole || {},
    byDay: Object.values(data.byDay || {}).sort((a, b) => a.date.localeCompare(b.date)),
    byTask: tasks,
    rates: {
      profileTaskClickRate: clickRate,
      profileTaskCompletionRate: completionRate,
    },
    updatedAt: data.updatedAt || null,
  };
}

/**
 * Rollup wrapper for queue/scheduler.
 */
export async function rollupActivationFunnel(options = {}) {
  if (!isEnabled()) return { skipped: true, reason: 'disabled' };

  const month = options.month || monthKey();
  const result = await getActivationFunnel({ month });

  eventBus.emit('activation_funnel:rollup_completed', {
    month,
    profileTaskShown: result.totals?.profileTaskShown || 0,
    profileTaskClicked: result.totals?.profileTaskClicked || 0,
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

// Event listeners — guard globally for test cache-busting.
const LISTENER_FLAG = '__yawmiaActivationFunnelListenersRegistered';

if (isEnabled() && !globalThis[LISTENER_FLAG]) {
  globalThis[LISTENER_FLAG] = true;

  eventBus.on('profile_task:shown', (data) => {
    recordProfileTaskShown(data).catch(err => {
      logger.warn('activationFunnel: recordProfileTaskShown failed', { error: err.message });
    });
  });

  eventBus.on('profile_task:clicked', (data) => {
    recordProfileTaskClicked(data).catch(err => {
      logger.warn('activationFunnel: recordProfileTaskClicked failed', { error: err.message });
    });
  });

  eventBus.on('profile_task:completed', (data) => {
    recordProfileTaskCompleted(data).catch(err => {
      logger.warn('activationFunnel: recordProfileTaskCompleted failed', { error: err.message });
    });
  });

  const milestoneEvents = {
    'activation:first_application': 'first_application',
    'activation:first_job_posted': 'first_job_posted',
    'activation:first_accepted': 'first_accepted',
    'activation:first_checkin': 'first_checkin',
    'activation:first_payment': 'first_payment',
    'activation:first_rating': 'first_rating',
  };

  for (const [eventName, milestone] of Object.entries(milestoneEvents)) {
    eventBus.on(eventName, (data = {}) => {
      recordActivationMilestone({
        milestone,
        role: data.role || 'unknown',
        timestamp: data.timestamp || nowIso(),
      }).catch(() => {});
    });
  }
}

export const _testHelpers = {
  isEnabled,
  monthKey,
  dayKey,
  metricsId,
  metricsPath,
  safeTaskId,
  safeRole,
  emptyMetrics,
};
