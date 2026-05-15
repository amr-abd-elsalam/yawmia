// ═══════════════════════════════════════════════════════════════
// server/services/incidentTimeline.js — Incident Timeline (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Admin-only operational incident reconstruction.
// Auto-opens incidents for critical operational events.
// Storage: data/metrics/incidents/inc_xxx.json
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

let listenersRegistered = false;

const AUTO_EVENTS = [
  'counters:file_size_critical',
  'counters:auto_rebuild_triggered',
  'ops_queue:job_dead_lettered',
  'alert_delivery:dead_lettered',
  'predictive_abuse:scan_failed',
  'backup_restore_drill:failed',
  'ops_slo:violated',
  'scheduler:stale',
];

function isEnabled() {
  return !!(config.INCIDENT_TIMELINE && config.INCIDENT_TIMELINE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'inc_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function incidentPath(id) {
  return getRecordPath('incidents', id);
}

function sanitizeDetails(data) {
  if (!data || typeof data !== 'object') return {};
  const out = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // Avoid accidental secret leakage.
    if (/token|secret|password|apikey|api_key|authorization/i.test(key)) {
      out[key] = '[redacted]';
      continue;
    }

    if (typeof value === 'string') out[key] = value.slice(0, 1000);
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

function refsFromEvent(type, data = {}) {
  return {
    queueJobId: data.queueJobId || data.jobId || null,
    deliveryId: data.deliveryId || null,
    exportId: data.exportId || null,
    signalId: data.signalId || null,
    rollupId: data.rollupId || null,
    drillId: data.drillId || null,
    lockName: data.lockName || null,
    schedulerName: data.name || data.schedulerName || null,
  };
}

function summarizeEvent(type, data = {}) {
  const map = {
    'counters:file_size_critical': 'Counter file size is critical',
    'counters:auto_rebuild_triggered': 'Counter auto rebuild triggered',
    'ops_queue:job_dead_lettered': 'Queue job moved to dead-letter',
    'alert_delivery:dead_lettered': 'Alert delivery moved to dead-letter',
    'predictive_abuse:scan_failed': 'Predictive abuse scan failed',
    'backup_restore_drill:failed': 'Backup restore drill failed',
    'ops_slo:violated': 'Operational SLO violation detected',
    'scheduler:stale': 'Scheduler job is stale',
  };

  return data.summary || data.message || map[type] || type;
}

function severityForEvent(type, data = {}) {
  if (data.severity) return data.severity;
  if (type === 'counters:file_size_critical') return 'critical';
  if (type === 'ops_queue:job_dead_lettered') return 'high';
  if (type === 'alert_delivery:dead_lettered') return 'high';
  if (type === 'backup_restore_drill:failed') return 'high';
  if (type === 'predictive_abuse:scan_failed') return 'medium';
  if (type === 'ops_slo:violated') return 'medium';
  return 'medium';
}

function buildIncidentTitle(type, data = {}) {
  return summarizeEvent(type, data).slice(0, 140);
}

async function findOpenIncidentByFingerprint(fingerprint) {
  if (!fingerprint) return null;

  const result = await listIncidents({ status: 'open', limit: 100, offset: 0 });
  return result.incidents.find(i => i.fingerprint === fingerprint) || null;
}

function fingerprintForEvent(type, data = {}) {
  const refs = refsFromEvent(type, data);
  const raw = [
    type,
    refs.queueJobId,
    refs.deliveryId,
    refs.exportId,
    refs.signalId,
    refs.rollupId,
    refs.drillId,
    refs.schedulerName,
    refs.lockName,
  ].filter(Boolean).join(':');

  if (!raw) return null;

  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export async function openIncident(params = {}) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const id = params.id || generateId();
  const now = nowIso();

  const incident = {
    id,
    title: String(params.title || 'Operational incident').slice(0, 200),
    severity: params.severity || 'medium',
    status: 'open',
    fingerprint: params.fingerprint || null,
    sourceType: params.sourceType || null,
    refs: sanitizeDetails(params.refs || {}),
    events: [],
    openedAt: now,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
  };

  if (params.initialEvent) {
    incident.events.push(normalizeIncidentEvent(params.initialEvent));
  }

  await atomicWrite(incidentPath(id), incident);

  eventBus.emit('incident:opened', {
    incidentId: id,
    severity: incident.severity,
    title: incident.title,
    timestamp: now,
  });

  return { ok: true, incident };
}

function normalizeIncidentEvent(event = {}) {
  return {
    timestamp: event.timestamp || nowIso(),
    type: event.type || 'unknown',
    summary: String(event.summary || event.type || 'event').slice(0, 500),
    refs: sanitizeDetails(event.refs || {}),
    data: sanitizeDetails(event.data || {}),
  };
}

export async function appendIncidentEvent(incidentId, event) {
  if (!isEnabled()) return { ok: false, disabled: true };
  if (!incidentId) return { ok: false, code: 'INCIDENT_ID_REQUIRED' };

  return withLock(`incident:${incidentId}`, async () => {
    const path = incidentPath(incidentId);
    const incident = await readJSON(path);

    if (!incident) return { ok: false, code: 'INCIDENT_NOT_FOUND' };

    const maxEvents = config.INCIDENT_TIMELINE?.maxEventsPerIncident || 500;
    incident.events = Array.isArray(incident.events) ? incident.events : [];
    incident.events.push(normalizeIncidentEvent(event));

    while (incident.events.length > maxEvents) {
      incident.events.shift();
    }

    incident.updatedAt = nowIso();

    await atomicWrite(path, incident);

    eventBus.emit('incident:event_appended', {
      incidentId,
      type: event.type || 'unknown',
      timestamp: incident.updatedAt,
    });

    return { ok: true, incident };
  });
}

export async function resolveIncident(incidentId, adminId, note) {
  if (!isEnabled()) return { ok: false, disabled: true };

  return withLock(`incident:${incidentId}`, async () => {
    const path = incidentPath(incidentId);
    const incident = await readJSON(path);

    if (!incident) return { ok: false, code: 'INCIDENT_NOT_FOUND' };

    incident.status = 'resolved';
    incident.resolvedAt = nowIso();
    incident.resolvedBy = adminId || 'admin_token';
    incident.resolutionNote = note ? String(note).slice(0, 1000) : null;
    incident.updatedAt = incident.resolvedAt;

    incident.events = Array.isArray(incident.events) ? incident.events : [];
    incident.events.push(normalizeIncidentEvent({
      type: 'incident:resolved',
      summary: 'Incident resolved by admin',
      refs: { adminId: incident.resolvedBy },
      data: { note: incident.resolutionNote },
    }));

    await atomicWrite(path, incident);

    eventBus.emit('incident:resolved', {
      incidentId,
      adminId: incident.resolvedBy,
      timestamp: incident.resolvedAt,
    });

    return { ok: true, incident };
  });
}

export async function listIncidents(options = {}) {
  if (!isEnabled()) return { incidents: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('incidents');
  let rows = await listJSON(dir);
  rows = rows.filter(i => i && i.id && i.id.startsWith('inc_'));

  if (options.status) rows = rows.filter(i => i.status === options.status);
  if (options.severity) rows = rows.filter(i => i.severity === options.severity);

  rows.sort((a, b) => new Date(b.openedAt || b.createdAt) - new Date(a.openedAt || a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    incidents: rows.slice(offset, offset + limit).map(i => ({
      ...i,
      events: Array.isArray(i.events) ? i.events.slice(-5) : [],
      eventCount: Array.isArray(i.events) ? i.events.length : 0,
    })),
    total,
    limit,
    offset,
  };
}

export async function getIncident(incidentId) {
  if (!incidentId || typeof incidentId !== 'string') return null;
  return await readJSON(incidentPath(incidentId));
}

export async function autoOpenIncidentForEvent(eventType, data = {}) {
  if (!isEnabled()) return { ok: false, disabled: true };
  if (!config.INCIDENT_TIMELINE?.autoOpenForCriticalEvents) return { ok: false, skipped: true };
  if (!AUTO_EVENTS.includes(eventType)) return { ok: false, skipped: true };

  const fingerprint = fingerprintForEvent(eventType, data);
  const event = {
    type: eventType,
    summary: summarizeEvent(eventType, data),
    refs: refsFromEvent(eventType, data),
    data,
    timestamp: data.timestamp || nowIso(),
  };

  try {
    const existing = await findOpenIncidentByFingerprint(fingerprint);
    if (existing) {
      return await appendIncidentEvent(existing.id, event);
    }

    return await openIncident({
      title: buildIncidentTitle(eventType, data),
      severity: severityForEvent(eventType, data),
      sourceType: eventType,
      fingerprint,
      refs: refsFromEvent(eventType, data),
      initialEvent: event,
    });
  } catch (err) {
    logger.warn('incidentTimeline: auto-open failed', { eventType, error: err.message });
    return { ok: false, error: err.message };
  }
}

export function registerIncidentListeners() {
  if (!isEnabled()) return;
  if (listenersRegistered) return;
  listenersRegistered = true;

  for (const eventName of AUTO_EVENTS) {
    eventBus.on(eventName, (data) => {
      autoOpenIncidentForEvent(eventName, data).catch(err => {
        logger.warn('incidentTimeline: listener failed', {
          eventName,
          error: err.message,
        });
      });
    });
  }

  logger.info('Incident timeline: listeners registered', { count: AUTO_EVENTS.length });
}

export const _testHelpers = {
  AUTO_EVENTS,
  sanitizeDetails,
  refsFromEvent,
  summarizeEvent,
  severityForEvent,
  fingerprintForEvent,
  normalizeIncidentEvent,
  resetListenersForTest: () => { listenersRegistered = false; },
};
