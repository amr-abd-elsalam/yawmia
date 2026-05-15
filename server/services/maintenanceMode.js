// ═══════════════════════════════════════════════════════════════
// server/services/maintenanceMode.js — Maintenance Mode (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Optional deploy safety switch.
// Disabled by default. Admin can enable/disable via production ops API.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import { atomicWrite, readJSON } from './database.js';
import { eventBus } from './eventBus.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function cfg() {
  return config.MAINTENANCE_MODE || {};
}

function isFeatureEnabled() {
  return !!cfg().enabled || process.env.MAINTENANCE_MODE_ENABLED === 'true';
}

function maintenancePath() {
  return join(BASE_PATH, cfg().filePath || 'ops/maintenance.json');
}

function nowIso() {
  return new Date().toISOString();
}

function defaultState() {
  return {
    enabled: false,
    message: cfg().message || 'المنصة تحت الصيانة مؤقتاً. حاول بعد قليل.',
    enabledBy: null,
    enabledAt: null,
    disabledBy: null,
    disabledAt: null,
    updatedAt: nowIso(),
  };
}

export async function getMaintenanceMode() {
  if (!isFeatureEnabled()) {
    return {
      ...defaultState(),
      featureEnabled: false,
    };
  }

  try {
    const state = await readJSON(maintenancePath());
    return {
      ...defaultState(),
      ...(state || {}),
      featureEnabled: true,
    };
  } catch (_) {
    return {
      ...defaultState(),
      featureEnabled: true,
    };
  }
}

export async function enableMaintenanceMode(adminId, message) {
  if (!isFeatureEnabled()) {
    return { ok: false, disabled: true, code: 'MAINTENANCE_FEATURE_DISABLED' };
  }

  const now = nowIso();
  const state = {
    enabled: true,
    message: message || cfg().message || 'المنصة تحت الصيانة مؤقتاً. حاول بعد قليل.',
    enabledBy: adminId || 'admin_token',
    enabledAt: now,
    disabledBy: null,
    disabledAt: null,
    updatedAt: now,
  };

  await atomicWrite(maintenancePath(), state);

  eventBus.emit('maintenance:enabled', {
    enabledBy: state.enabledBy,
    timestamp: now,
  });

  return { ok: true, maintenance: { ...state, featureEnabled: true } };
}

export async function disableMaintenanceMode(adminId) {
  if (!isFeatureEnabled()) {
    return { ok: false, disabled: true, code: 'MAINTENANCE_FEATURE_DISABLED' };
  }

  const previous = await getMaintenanceMode();
  const now = nowIso();

  const state = {
    ...previous,
    enabled: false,
    disabledBy: adminId || 'admin_token',
    disabledAt: now,
    updatedAt: now,
  };

  await atomicWrite(maintenancePath(), state);

  eventBus.emit('maintenance:disabled', {
    disabledBy: state.disabledBy,
    timestamp: now,
  });

  return { ok: true, maintenance: { ...state, featureEnabled: true } };
}

export async function isMaintenanceActive() {
  if (!isFeatureEnabled()) return false;
  const state = await getMaintenanceMode();
  return !!state.enabled;
}

function isAdminRequest(req) {
  if (!req) return false;
  if (req.isAdmin) return true;
  if (req.user && req.user.role === 'admin') return true;

  const token = req.headers && req.headers['x-admin-token'];
  return !!(token && token === process.env.ADMIN_TOKEN);
}

function isStaticRequest(req) {
  if (!req || !req.pathname) return false;
  if (!req.pathname.startsWith('/api/')) return true;
  return false;
}

function isAlwaysAllowedApi(req) {
  if (!req || !req.pathname) return false;

  const path = req.pathname;
  if (path === '/api/health') return true;
  if (path === '/api/config') return true;
  if (path === '/api/docs') return true;
  if (path.startsWith('/api/admin/maintenance')) return true;
  if (path.startsWith('/api/admin/production')) return true;

  return false;
}

function isReadOnlyApi(req) {
  if (!req || req.method !== 'GET') return false;
  if (!req.pathname || !req.pathname.startsWith('/api/')) return false;

  const path = req.pathname;

  if (path === '/api/jobs') return true;
  if (path.startsWith('/api/jobs/')) return true;
  if (path.startsWith('/api/users/')) return true;
  if (path === '/api/health') return true;
  if (path === '/api/config') return true;
  if (path === '/api/docs') return true;

  return false;
}

export function isRouteAllowedDuringMaintenance(req) {
  if (!isFeatureEnabled()) return true;

  if (cfg().allowAdminBypass && isAdminRequest(req)) return true;
  if (isStaticRequest(req)) return true;
  if (isAlwaysAllowedApi(req)) return true;
  if (cfg().allowReadOnlyApi && isReadOnlyApi(req)) return true;

  return false;
}

export const _testHelpers = {
  maintenancePath,
  isFeatureEnabled,
  isAdminRequest,
  isStaticRequest,
  isAlwaysAllowedApi,
  isReadOnlyApi,
};
