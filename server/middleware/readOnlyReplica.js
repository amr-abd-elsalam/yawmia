// ═══════════════════════════════════════════════════════════════
// server/middleware/readOnlyReplica.js — Read-Only Replica Write Guard (Phase 57)
// ═══════════════════════════════════════════════════════════════
// Blocks write APIs when INSTANCE_MODE=read_only_replica.
// Static files are served before global middleware, so they are unaffected.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { isReadOnlyReplica } from '../services/instanceMode.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function isWriteMethod(method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

function isAlwaysAllowed(req) {
  if (!req || !req.pathname) return false;

  if (req.method === 'OPTIONS') return true;

  if (config.READ_ONLY_REPLICA_GUARD?.allowHealthAndConfig) {
    if (req.pathname === '/api/health') return true;
    if (req.pathname === '/api/config') return true;
    if (req.pathname === '/api/docs') return true;
  }

  if (config.READ_ONLY_REPLICA_GUARD?.allowMaintenanceRead) {
    if (req.method === 'GET' && req.pathname === '/api/admin/maintenance') return true;
  }

  return false;
}

/**
 * Allow all GET requests on read-only replica.
 * This preserves public reads and admin read-only ops dashboards.
 */
function isAllowedRead(req) {
  if (!req || req.method !== 'GET') return false;
  if (!req.pathname || !req.pathname.startsWith('/api/')) return false;

  if (config.READ_ONLY_REPLICA_GUARD?.allowPublicReadApis) return true;
  if (config.READ_ONLY_REPLICA_GUARD?.allowAdminReadOnlyOps && req.pathname.startsWith('/api/admin/')) return true;

  return false;
}

export function readOnlyReplicaMiddleware(req, res, next) {
  const guard = config.READ_ONLY_REPLICA_GUARD || {};

  if (!guard.enabled || !guard.blockWriteApisInReadOnlyReplica) {
    return next();
  }

  if (!isReadOnlyReplica()) {
    return next();
  }

  if (isAlwaysAllowed(req)) {
    return next();
  }

  if (!isWriteMethod(req.method)) {
    if (isAllowedRead(req)) return next();
    return next();
  }

  return sendJSON(res, 403, {
    error: guard.message || 'هذه النسخة للقراءة فقط. حاول من النسخة الرئيسية.',
    code: 'READ_ONLY_REPLICA_WRITE_BLOCKED',
    readOnlyReplica: true,
  });
}

export const _testHelpers = {
  isWriteMethod,
  isAlwaysAllowed,
  isAllowedRead,
};
