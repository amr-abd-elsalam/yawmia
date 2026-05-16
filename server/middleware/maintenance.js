// ═══════════════════════════════════════════════════════════════
// server/middleware/maintenance.js — Maintenance Guard (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Optional middleware. No-op unless MAINTENANCE_MODE.enabled=true and
// data/ops/maintenance.json has enabled=true.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function maintenanceMiddleware(req, res, next) {
  import('../services/maintenanceMode.js')
    .then(async ({ getMaintenanceMode, isRouteAllowedDuringMaintenance, isFeatureEnabled }) => {
      // Phase 55 hotfix:
      // MAINTENANCE_MODE_ENABLED=true must work even when config.MAINTENANCE_MODE.enabled=false.
      // The service is the source of truth for env override behavior.
      if (!isFeatureEnabled()) {
        return next();
      }

      const state = await getMaintenanceMode();

      if (!state || !state.enabled) {
        return next();
      }

      if (isRouteAllowedDuringMaintenance(req)) {
        return next();
      }

      return sendJSON(res, 503, {
        error: state.message || config.MAINTENANCE_MODE.message,
        code: 'MAINTENANCE_MODE',
        maintenance: true,
      });
    })
    .catch(() => {
      // Fail-open if maintenance check itself fails.
      next();
    });
}
