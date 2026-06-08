// ═══════════════════════════════════════════════════════════════
// server/handlers/adminSseHandler.js — Admin SSE Channel (Phase 48)
// ═══════════════════════════════════════════════════════════════
// Self-authenticated SSE for admin events.
// Token via X-Admin-Token header OR ?token= / ?_token= query param.
// Subscribed events:
//   - abuse_flag:snooze_expiring (Phase 47)
//   - abuse_flag:snooze_expired (Phase 47)
//   - abuse_flag:detected_high_severity (Phase 48)
//   - direct_offer:abuse_threshold_crossed (Phase 49)
//   - counters:auto_rebuild_triggered (Phase 48)
//   - csv_export:progress (Phase 49)
//   - predictive_abuse:signal_created (Phase 51)
//   - predictive_abuse:signal_escalated (Phase 51)
//   - predictive_abuse:scan_failed (Phase 51)
//   - ops_queue:job_failed (Phase 52)
//   - ops_queue:job_dead_lettered (Phase 52)
//   - alert_delivery:failed (Phase 52)
//   - alert_delivery:dead_lettered (Phase 52)
//   - export:job_completed (Phase 52)
//   - export:job_failed (Phase 52)
// In-memory connection map per admin, lazy event listener registration.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from '../services/eventBus.js';
import { formatSSE } from '../services/sseManager.js';
import { logger } from '../services/logger.js';

/** @type {Map<string, Set<{ res: any, connectedAt: number }>>} */
const adminConnections = new Map();

const SUBSCRIBED_EVENTS = [
  'abuse_flag:snooze_expiring',
  'abuse_flag:snooze_expired',
  'abuse_flag:detected_high_severity',
  'direct_offer:abuse_threshold_crossed',
  'counters:auto_rebuild_triggered',
  'csv_export:progress', // Phase 49 — streaming CSV export progress
  // Phase 51 — Predictive Abuse Intelligence
  'predictive_abuse:signal_created',
  'predictive_abuse:signal_escalated',
  'predictive_abuse:scan_failed',

  // Phase 52 — Persistent Ops Queue + Alert Delivery
  'ops_queue:job_failed',
  'ops_queue:job_dead_lettered',
  'alert_delivery:failed',
  'alert_delivery:dead_lettered',
  'export:job_completed',
  'export:job_failed',
  'workroom:template_used',

  // Phase 54 — Production Ops
  'ops_rollup:captured',
  'ops_slo:violated',
  'incident:opened',
  'incident:event_appended',
  'incident:resolved',
  'backup_restore_drill:started',
  'backup_restore_drill:passed',
  'backup_restore_drill:failed',
  'process_lock:stale_recovered',
  'process_lock:acquire_failed',
  'scheduler:job_failed',
  'scheduler:job_queued',
  'maintenance:enabled',
  'maintenance:disabled',

  // Phase 55 — Scale Hygiene
  'ops_queue:summary_updated',
  'ops_queue:record_moved',
  'ops_queue:legacy_record_detected',
  'queue:compaction_started',
  'queue:compaction_completed',
  'queue:compaction_failed',
  'queue:idempotency_cleanup_completed',
  'queue:slow_jobs_detected',
  'queue:health_verified',
  'queue:repair_completed',
  'queue:summary_rebuilt',

  'workroom_hygiene:inspection_completed',
  'workroom_hygiene:compaction_completed',
  'workroom_hygiene:attachment_cleanup_completed',
  'workroom_hygiene:warning_detected',
  'workroom_search:verified',
  'workroom_search:repair_completed',

  'audit_index:token_compaction_completed',
  'trust_retention:rollup_created',
  'predictive_archive_index:rebuilt',
  'scheduler:run_history_recorded',
  'scheduler:history_cleanup_completed',

  // Phase 56 — Marketplace/Product Intelligence
  'marketplace_intelligence:rollup_captured',
  'search_analytics:rollup_completed',
  'activation_funnel:rollup_completed',
  'workroom_adoption:rollup_completed',
  'payment_dispute_analytics:rollup_completed',

  // Phase 58 — Governance / Privacy / RBAC
  'admin_approval:created',
  'admin_approval:approved',
  'admin_approval:rejected',
  'admin_approval:expired',
  'admin_approval:consumed',
  'privacy_request:created',
  'privacy_request:queued',
  'privacy_request:completed',
  'privacy_request:failed',
  'privacy_request:cancelled',
  'ops_review:created',
  'ops_review:completed',
  'postmortem:created',
  'postmortem:updated',
  'postmortem:action_item_added',
  'postmortem:action_item_updated',
];

let listenersRegistered = false;

/**
 * Lazy register EventBus listeners on first admin connection.
 * Idempotent — guarded by listenersRegistered flag.
 */
function registerEventListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;
  for (const eventName of SUBSCRIBED_EVENTS) {
    eventBus.on(eventName, (data) => broadcastToAdmins(eventName, data));
  }
  logger.info('Admin SSE: event listeners registered', { count: SUBSCRIBED_EVENTS.length });
}

/**
 * Broadcast an event to all connected admins.
 * Fire-and-forget per connection — write errors silently ignored.
 *
 * @param {string} eventType
 * @param {*} data
 */
function broadcastToAdmins(eventType, data) {
  const eventId = `adm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const msg = formatSSE(eventType, data, eventId);
  for (const [, conns] of adminConnections) {
    for (const entry of conns) {
      try {
        if (!entry.res.writableEnded && !entry.res.destroyed) {
          entry.res.write(msg);
        }
      } catch (_) { /* ignore write errors */ }
    }
  }
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function envFlag(name) {
  return process.env[name] === 'true' || process.env[name] === '1';
}

function isAdminSseQueryTokenAllowed() {
  // ADMIN_QUERY_TOKEN_ENABLED is an unsafe umbrella legacy override.
  // ADMIN_SSE_QUERY_TOKEN_ENABLED is the narrower legacy override for EventSource.
  return envFlag('ADMIN_QUERY_TOKEN_ENABLED') || envFlag('ADMIN_SSE_QUERY_TOKEN_ENABLED');
}

/**
 * GET /api/admin/events
 * Self-authenticated SSE endpoint for admin events.
 * Auth: X-Admin-Token header OR ?token= / ?_token= query param.
 */
export async function handleAdminEventStream(req, res) {
  // ── Auth ──
  const headerAdminToken = req.headers['x-admin-token'];
  const queryAdminToken = req.query ? (req.query.token || req.query._token) : null;

  if (queryAdminToken && queryAdminToken === process.env.ADMIN_TOKEN && !isAdminSseQueryTokenAllowed()) {
    return sendJSON(res, 401, {
      error: 'Admin SSE query-token authentication is disabled',
      code: 'ADMIN_SSE_QUERY_TOKEN_DISABLED',
    });
  }

  const adminToken = headerAdminToken || (
    isAdminSseQueryTokenAllowed() ? queryAdminToken : null
  );

  const isValidAdmin =
    (adminToken && adminToken === process.env.ADMIN_TOKEN) ||
    (req.user && req.user.role === 'admin');

  if (!isValidAdmin) {
    return sendJSON(res, 401, { error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' });
  }

  const adminId = (req.user && req.user.id) || 'admin_token';

  // ── Lazy register listeners on first connection ──
  registerEventListeners();

  // ── Write SSE headers ──
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  if (req.socket) req.socket.setTimeout(0);

  // ── Suggest retry interval ──
  const retryMs = (config.SSE && config.SSE.reconnectMs) || 5000;
  res.write(`retry: ${retryMs}\n\n`);

  // ── Send init event ──
  res.write(formatSSE(
    'init',
    { adminId, subscribedEvents: SUBSCRIBED_EVENTS },
    'adm-init-' + Date.now()
  ));

  // ── Register connection ──
  if (!adminConnections.has(adminId)) {
    adminConnections.set(adminId, new Set());
  }
  const entry = { res, connectedAt: Date.now() };
  adminConnections.get(adminId).add(entry);

  // Phase 49 — Per-connection heartbeat.
  // Keeps admin SSE alive behind load balancers with ~60s idle timeout.
  const heartbeatTimer = setInterval(() => {
    try {
      if (!entry.res.writableEnded && !entry.res.destroyed) {
        entry.res.write(': heartbeat\n\n');
      } else {
        clearInterval(heartbeatTimer);
      }
    } catch (_) {
      clearInterval(heartbeatTimer);
    }
  }, 30000);
  if (heartbeatTimer.unref) heartbeatTimer.unref();

  // ── Cleanup on close ──
  res.on('close', () => {
    clearInterval(heartbeatTimer);
    const conns = adminConnections.get(adminId);
    if (conns) {
      conns.delete(entry);
      if (conns.size === 0) adminConnections.delete(adminId);
    }
  });
}

/**
 * Get aggregate admin connection stats.
 * @returns {{ admins: number, totalConnections: number }}
 */
export function getAdminConnectionStats() {
  let total = 0;
  for (const [, conns] of adminConnections) total += conns.size;
  return { admins: adminConnections.size, totalConnections: total };
}

// Test helpers
export const _testHelpers = {
  adminConnections,
  SUBSCRIBED_EVENTS,
  broadcastToAdmins,
  envFlag,
  isAdminSseQueryTokenAllowed,
  resetState: () => {
    adminConnections.clear();
    listenersRegistered = false;
  },
};
