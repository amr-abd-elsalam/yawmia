// ═══════════════════════════════════════════════════════════════
// server/handlers/storagePressureHandler.js — Phase 59 Admin APIs
// ═══════════════════════════════════════════════════════════════
// Admin handlers for:
// - storage pressure
// - scale thresholds
// - externalization readiness
// - multi-instance boundary
//
// All responses are advisory/additive.
// No external DB/search/queue implementation.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logAction } from '../services/auditLog.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function adminId(req) {
  return req.user?.id || 'admin_token';
}

function requestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function parseBool(value) {
  return value === true || value === '1' || value === 'true';
}

function audit(req, action, targetType, targetId, details = {}) {
  logAction({
    adminId: adminId(req),
    action,
    targetType,
    targetId,
    details,
    ip: requestIp(req),
  }).catch(() => {});
}

/**
 * GET /api/admin/storage-pressure
 */
export async function handleGetStoragePressure(req, res) {
  try {
    const { getStoragePressure } = await import('../services/storagePressure.js');

    const result = await getStoragePressure({
      force: parseBool(req.query.force),
      deep: parseBool(req.query.deep),
      collection: req.query.collection || undefined,
      persist: req.query.persist === 'false' ? false : true,
    });

    return sendJSON(res, 200, {
      ok: true,
      storagePressure: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب ضغط التخزين',
      code: 'STORAGE_PRESSURE_ERROR',
    });
  }
}

/**
 * POST /api/admin/storage-pressure/capture
 */
export async function handleCaptureStoragePressure(req, res) {
  try {
    const { captureStoragePressureSnapshot } = await import('../services/storagePressure.js');

    const body = req.body || {};
    const result = await captureStoragePressureSnapshot({
      deep: parseBool(body.deep) || parseBool(req.query.deep),
      collection: body.collection || req.query.collection || undefined,
      sampleJsonParseCount: body.sampleJsonParseCount,
    });

    audit(req, 'storage_pressure_captured', 'storage_pressure', result.id || 'snapshot', {
      status: result.status,
      mode: result.mode,
      scannedFiles: result.scannedFiles || 0,
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
      criticalCount: Array.isArray(result.criticals) ? result.criticals.length : 0,
    });

    return sendJSON(res, 201, {
      ok: true,
      storagePressure: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء قياس ضغط التخزين',
      code: 'STORAGE_PRESSURE_CAPTURE_ERROR',
    });
  }
}

/**
 * GET /api/admin/storage-pressure/snapshots
 */
export async function handleListStoragePressureSnapshots(req, res) {
  try {
    const { listStoragePressureSnapshots } = await import('../services/storagePressure.js');

    const result = await listStoragePressureSnapshots({
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, {
      ok: true,
      ...result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب قياسات ضغط التخزين',
      code: 'STORAGE_PRESSURE_SNAPSHOTS_ERROR',
    });
  }
}

/**
 * GET /api/admin/scale-thresholds
 */
export async function handleGetScaleThresholds(req, res) {
  try {
    const { getScaleThresholdConfig } = await import('../services/scaleThresholds.js');

    return sendJSON(res, 200, {
      ok: true,
      scaleLimits: getScaleThresholdConfig(),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب حدود التوسع',
      code: 'SCALE_THRESHOLDS_ERROR',
    });
  }
}

/**
 * POST /api/admin/scale-thresholds/verify
 */
export async function handleVerifyScaleThresholds(req, res) {
  try {
    const { verifyScaleThresholds } = await import('../services/scaleThresholds.js');

    const body = req.body || {};
    const result = await verifyScaleThresholds({
      deep: parseBool(body.deep) || parseBool(req.query.deep),
      persist: body.persist === false ? false : true,
    });

    audit(req, 'scale_thresholds_verified', 'scale_thresholds', 'phase59', {
      status: result.status,
      warningCount: Array.isArray(result.warnings) ? result.warnings.length : 0,
      criticalCount: Array.isArray(result.criticals) ? result.criticals.length : 0,
    });

    return sendJSON(res, 200, {
      ok: true,
      verification: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في التحقق من حدود التوسع',
      code: 'SCALE_THRESHOLDS_VERIFY_ERROR',
    });
  }
}

/**
 * GET /api/admin/externalization/readiness
 */
export async function handleExternalizationReadiness(req, res) {
  try {
    const { getExternalizationReadiness } = await import('../services/externalizationReadiness.js');

    const result = await getExternalizationReadiness({
      captureIfMissing: parseBool(req.query.captureIfMissing),
      loadPressure: req.query.loadPressure === 'false' ? false : true,
    });

    return sendJSON(res, 200, {
      ok: true,
      readiness: result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب جاهزية النقل المستقبلي',
      code: 'EXTERNALIZATION_READINESS_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/multi-instance-boundary
 */
export async function handleMultiInstanceBoundary(req, res) {
  try {
    const { getInstanceInfo } = await import('../services/instanceMode.js');

    const instance = getInstanceInfo();

    return sendJSON(res, 200, {
      ok: true,
      boundary: {
        enabled: !!(config.MULTI_INSTANCE_BOUNDARY && config.MULTI_INSTANCE_BOUNDARY.enabled),
        phase: 59,
        implementationAllowed: {
          multiWriterProduction: false,
          distributedLocks: false,
          externalQueue: false,
          eventBusBridge: false,
          sseFanout: false,
        },
        currentInstance: instance,
        supportedModes: [
          {
            mode: 'single_writer',
            productionSafe: true,
            writesAllowed: true,
            queueWorkersAllowed: true,
            schedulersAllowed: true,
            notes: 'Production must run exactly one writer instance.',
          },
          {
            mode: 'read_only_replica',
            productionSafe: true,
            writesAllowed: false,
            queueWorkersAllowed: false,
            schedulersAllowed: false,
            notes: 'Read-only API serving only. Write methods are blocked by readOnlyReplicaMiddleware.',
          },
          {
            mode: 'experimental_multi_instance',
            productionSafe: false,
            writesAllowed: false,
            queueWorkersAllowed: false,
            schedulersAllowed: false,
            notes: 'Development experiment only. Not safe for production multi-writer.',
          },
        ],
        safeReadOnlyApis: [
          'GET /api/health',
          'GET /api/config',
          'GET /api/docs',
          'GET /api/jobs',
          'GET /api/jobs/:id',
          'GET /api/users/:id/public-profile',
          'GET /api/admin/storage-pressure',
          'GET /api/admin/externalization/readiness',
          'GET /api/admin/production/readiness',
          'GET /api/admin/scale-hygiene/overview',
        ],
        unsafeWriterApis: [
          'POST /api/auth/send-otp',
          'POST /api/auth/verify-otp',
          'POST /api/jobs',
          'POST /api/jobs/:id/apply',
          'POST /api/jobs/:id/accept',
          'POST /api/direct-offers',
          'POST /api/direct-offers/:id/accept',
          'POST /api/workrooms/:id/messages',
          'POST /api/admin/*',
          'PUT /api/*',
          'PATCH /api/*',
          'DELETE /api/*',
        ],
        limitations: [
          'File-backed process locks are guardrails, not distributed consensus.',
          'EventBus is in-memory and single-process.',
          'Admin SSE is single-instance.',
          'User SSE/live feed connections are per process.',
          'Queue workers and schedulers require single-writer discipline.',
          'Do not run PM2 cluster mode.',
          'Do not run multiple writers against the same writable data path.',
        ],
        phase60Requirements: [
          'external database',
          'external queue',
          'event bridge/pub-sub',
          'SSE fanout',
          'distributed scheduler/leader election',
          'migration snapshot and rollback plan',
        ],
      },
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب حدود التشغيل متعدد النسخ',
      code: 'MULTI_INSTANCE_BOUNDARY_ERROR',
    });
  }
}
