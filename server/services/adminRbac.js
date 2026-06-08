// ═══════════════════════════════════════════════════════════════
// server/services/adminRbac.js — Admin RBAC Capability Model (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Central capability checks for admin routes.
// Compatible with existing requireAdmin behavior:
//   - X-Admin-Token maps to config.ADMIN_RBAC.tokenRole
//   - admin session maps to user.adminRole || defaultSessionAdminRole
//   - ADMIN_RBAC.enabled=false preserves legacy admin behavior
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { verifySession } from './sessions.js';
import { findById } from './users.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function envFlag(name) {
  return process.env[name] === 'true' || process.env[name] === '1';
}

function isAdminQueryTokenAllowed(req) {
  if (!req || !req.query) return false;

  // Umbrella legacy override. Keep false by default.
  if (envFlag('ADMIN_QUERY_TOKEN_ENABLED')) return true;

  const isDownloadRoute =
    req.method === 'GET' &&
    (
      req.pathname === '/api/admin/audit-log/export' ||
      req.pathname.startsWith('/api/admin/export/') ||
      (req.pathname.startsWith('/api/admin/exports/') && req.pathname.endsWith('/download'))
    );

  return isDownloadRoute && envFlag('ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED');
}

function cfg() {
  return config.ADMIN_RBAC || {};
}

function isEnabled() {
  return !!(cfg().enabled);
}

function validRoles() {
  return new Set(cfg().roles || ['super_admin']);
}

/**
 * Return admin role from req or user.
 *
 * @param {object} reqOrUser
 * @returns {string}
 */
export function getAdminRole(reqOrUser) {
  const c = cfg();

  if (!isEnabled()) return 'super_admin';

  if (!reqOrUser) return c.defaultSessionAdminRole || 'super_admin';

  // Request object with admin token.
  if (reqOrUser.isAdmin && !reqOrUser.user) {
    return c.tokenRole || 'super_admin';
  }

  // Request object with session user.
  if (reqOrUser.user) {
    if (reqOrUser.user.adminRole) return reqOrUser.user.adminRole;
    if (reqOrUser.user.role === 'admin') return c.defaultSessionAdminRole || 'super_admin';
  }

  // User object.
  if (reqOrUser.adminRole) return reqOrUser.adminRole;
  if (reqOrUser.role === 'admin') return c.defaultSessionAdminRole || 'super_admin';

  return c.defaultSessionAdminRole || 'super_admin';
}

/**
 * Check role capability.
 *
 * @param {string} adminRole
 * @param {string} capability
 * @returns {boolean}
 */
export function hasCapability(adminRole, capability) {
  if (!isEnabled()) return true;

  if (!adminRole || !capability) return false;

  const matrix = cfg().capabilities || {};
  const caps = matrix[adminRole] || [];

  if (caps.includes('*')) return true;
  if (caps.includes(capability)) return true;

  // Allow parent read capability for admin.read where useful.
  if (capability !== 'admin.read' && caps.includes('admin.read') && capability.endsWith('.read')) {
    return true;
  }

  return false;
}

/**
 * List capabilities for one role.
 *
 * @param {string} role
 * @returns {string[]}
 */
export function listRoleCapabilities(role) {
  const matrix = cfg().capabilities || {};
  return Array.isArray(matrix[role]) ? matrix[role].slice() : [];
}

/**
 * Return full RBAC matrix, safe for admin UI.
 */
export function getRbacMatrix() {
  const roles = cfg().roles || [];
  const matrix = {};

  for (const role of roles) {
    matrix[role] = listRoleCapabilities(role);
  }

  return {
    enabled: isEnabled(),
    tokenRole: cfg().tokenRole || 'super_admin',
    defaultSessionAdminRole: cfg().defaultSessionAdminRole || 'super_admin',
    roles,
    capabilities: matrix,
    dangerousActionsRequireApproval: !!cfg().dangerousActionsRequireApproval,
    allowSuperAdminBypassApproval: cfg().allowSuperAdminBypassApproval !== false,
  };
}

/**
 * Check if action is dangerous.
 *
 * @param {string} action
 * @returns {boolean}
 */
export function isDangerousAction(action) {
  if (!action || typeof action !== 'string') return false;
  const dangerous = config.ADMIN_APPROVALS?.dangerousActions || [];
  return dangerous.includes(action);
}

/**
 * Check if action needs approval for admin role.
 *
 * @param {string} action
 * @param {string} adminRole
 * @returns {boolean}
 */
export function needsApproval(action, adminRole) {
  if (!isEnabled()) return false;
  if (!config.ADMIN_APPROVALS?.enabled) return false;
  if (!cfg().dangerousActionsRequireApproval) return false;
  if (!isDangerousAction(action)) return false;

  if (
    adminRole === 'super_admin' &&
    cfg().allowSuperAdminBypassApproval === true
  ) {
    return false;
  }

  return true;
}

async function authenticateAdmin(req) {
  // Existing requireAdmin compatibility: already authenticated by previous middleware.
  if (req.isAdmin) {
    req.adminRole = getAdminRole(req);
    return { ok: true, role: req.adminRole };
  }

  if (req.user && req.user.role === 'admin') {
    req.isAdmin = true;
    req.adminRole = getAdminRole(req);
    return { ok: true, role: req.adminRole };
  }

  // X-Admin-Token path.
  const adminToken = req.headers['x-admin-token'];
  if (adminToken && adminToken === process.env.ADMIN_TOKEN) {
    req.isAdmin = true;
    req.adminRole = cfg().tokenRole || 'super_admin';
    return { ok: true, role: req.adminRole };
  }

  // Patch 38: query-string admin tokens are disabled by default.
  // They can leak via logs, browser history, referrers, reverse proxies, analytics,
  // screenshots, and browser extensions.
  //
  // Temporary legacy override:
  //   ADMIN_QUERY_TOKEN_ENABLED=true              => allow all legacy query-token admin paths
  //   ADMIN_DOWNLOAD_QUERY_TOKEN_ENABLED=true     => allow only direct-download query-token paths
  //
  // Preferred temporary path: X-Admin-Token header.
  // Future path: real admin sessions + short-lived signed download tokens.
  const queryToken = req.query && (req.query.token || req.query._token);
  if (queryToken && queryToken === process.env.ADMIN_TOKEN && isAdminQueryTokenAllowed(req)) {
    req.isAdmin = true;
    req.adminRole = cfg().tokenRole || 'super_admin';
    return { ok: true, role: req.adminRole };
  }

  if (queryToken && queryToken === process.env.ADMIN_TOKEN && !isAdminQueryTokenAllowed(req)) {
    return {
      ok: false,
      status: 401,
      error: 'Admin query-token authentication is disabled',
      code: 'ADMIN_QUERY_TOKEN_DISABLED',
    };
  }

  // Session admin path.
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return { ok: false, status: 401, error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' };
  }

  const session = await verifySession(token);
  if (!session) {
    return { ok: false, status: 401, error: 'الجلسة غير صالحة', code: 'SESSION_INVALID' };
  }

  const user = await findById(session.userId);
  if (!user || user.role !== 'admin') {
    return { ok: false, status: 403, error: 'صلاحيات الأدمن مطلوبة', code: 'ADMIN_REQUIRED' };
  }

  if (user.status !== 'active') {
    return { ok: false, status: 403, error: 'حساب الأدمن غير نشط', code: 'ADMIN_INACTIVE' };
  }

  req.user = user;
  req.session = session;
  req.isAdmin = true;
  req.adminRole = getAdminRole(req);

  return { ok: true, role: req.adminRole };
}

/**
 * Native middleware factory.
 *
 * @param {string} capability
 * @returns {Function}
 */
export function requireCapability(capability) {
  return function adminCapabilityMiddleware(req, res, next) {
    authenticateAdmin(req)
      .then((auth) => {
        if (!auth.ok) {
          return sendJSON(res, auth.status || 401, {
            error: auth.error || 'صلاحيات الأدمن مطلوبة',
            code: auth.code || 'ADMIN_REQUIRED',
          });
        }

        // Legacy compatibility: if RBAC disabled, admin auth is enough.
        if (!isEnabled()) {
          return next();
        }

        const role = auth.role || getAdminRole(req);

        if (!validRoles().has(role)) {
          return sendJSON(res, 403, {
            error: 'دور الأدمن غير صالح',
            code: 'ADMIN_ROLE_INVALID',
            role,
          });
        }

        if (!hasCapability(role, capability)) {
          return sendJSON(res, 403, {
            error: 'صلاحية الأدمن غير كافية',
            code: 'ADMIN_CAPABILITY_REQUIRED',
            capability,
            role,
          });
        }

        req.adminRole = role;
        req.adminCapability = capability;
        next();
      })
      .catch(() => {
        sendJSON(res, 500, { error: 'خطأ في التحقق من صلاحيات الأدمن', code: 'ADMIN_RBAC_ERROR' });
      });
  };
}

export const _testHelpers = {
  isEnabled,
  authenticateAdmin,
  validRoles,
  envFlag,
  isAdminQueryTokenAllowed,
};
