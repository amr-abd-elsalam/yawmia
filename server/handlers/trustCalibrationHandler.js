// ═══════════════════════════════════════════════════════════════
// server/handlers/trustCalibrationHandler.js — Trust Calibration Admin APIs (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Admin-only endpoints for Trust Score V2 calibration:
//   - dashboard
//   - snapshots
//   - queue snapshot batch
//   - queue/generate calibration report
//
// No automatic trust weight changes.
// ═══════════════════════════════════════════════════════════════

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

/**
 * GET /api/admin/trust/calibration/dashboard
 */
export async function handleAdminTrustCalibrationDashboard(req, res) {
  try {
    const { getCalibrationDashboard } = await import('../services/trustCalibration.js');

    const result = await getCalibrationDashboard({
      role: req.query.role || undefined,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب لوحة معايرة الثقة',
      code: 'TRUST_CALIBRATION_DASHBOARD_ERROR',
    });
  }
}

/**
 * GET /api/admin/trust/snapshots?userId=&role=&from=&to=&limit=&offset=
 */
export async function handleAdminTrustSnapshots(req, res) {
  try {
    const { listTrustSnapshots } = await import('../services/trustCalibration.js');

    const result = await listTrustSnapshots({
      userId: req.query.userId || undefined,
      role: req.query.role || undefined,
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب snapshots الثقة',
      code: 'TRUST_SNAPSHOTS_ERROR',
    });
  }
}

/**
 * POST /api/admin/trust/calibration/snapshot-batch?async=1
 * Body: { role?, limit?, force? }
 */
export async function handleAdminRunTrustSnapshotBatch(req, res) {
  try {
    const body = req.body || {};
    const useAsync = parseBool(req.query.async);

    if (useAsync) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const minuteBucket = new Date().toISOString().slice(0, 16);
      const role = body.role || req.query.role || 'all';

      const enqueueResult = await enqueueJob({
        type: 'trust_snapshot_batch',
        priority: 'normal',
        payload: {
          role: body.role || req.query.role || undefined,
          limit: body.limit ? parseInt(body.limit) : undefined,
          force: parseBool(body.force),
          reason: 'admin_requested',
        },
        idempotencyKey: `trust_snapshot_batch:manual:${adminId(req)}:${role}:${minuteBucket}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة snapshot batch للطابور',
          code: 'QUEUE_ENQUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'trust_snapshot_batch_queued',
        targetType: 'trust_calibration',
        targetId: 'snapshot_batch',
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          role: body.role || req.query.role || null,
          limit: body.limit || null,
          force: parseBool(body.force),
        },
        ip: requestIp(req),
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

    const { createSnapshotsForActiveUsers } = await import('../services/trustCalibration.js');

    const result = await createSnapshotsForActiveUsers({
      role: body.role || req.query.role || undefined,
      limit: body.limit ? parseInt(body.limit) : undefined,
      force: parseBool(body.force),
      reason: 'admin_requested',
    });

    logAction({
      adminId: adminId(req),
      action: 'trust_snapshot_batch_run',
      targetType: 'trust_calibration',
      targetId: 'snapshot_batch',
      details: {
        scanned: result.scanned || 0,
        created: result.created || 0,
        deduped: result.deduped || 0,
        failed: result.failed || 0,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل snapshot batch',
      code: 'TRUST_SNAPSHOT_BATCH_ERROR',
    });
  }
}

/**
 * POST /api/admin/trust/calibration/report?async=1
 * Body: { from?, to?, role?, outcomeWindowDays? }
 */
export async function handleAdminRunTrustCalibrationReport(req, res) {
  try {
    const body = req.body || {};
    const useAsync = parseBool(req.query.async);

    const from = body.from || req.query.from || undefined;
    const to = body.to || req.query.to || undefined;
    const role = body.role || req.query.role || undefined;
    const outcomeWindowDays = body.outcomeWindowDays
      ? parseInt(body.outcomeWindowDays)
      : (req.query.outcomeWindowDays ? parseInt(req.query.outcomeWindowDays) : undefined);

    if (useAsync) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const fromKey = from || 'default_from';
      const toKey = to || 'default_to';
      const roleKey = role || 'all';

      const enqueueResult = await enqueueJob({
        type: 'trust_calibration_report',
        priority: 'normal',
        payload: {
          from,
          to,
          role,
          outcomeWindowDays,
          persist: true,
        },
        idempotencyKey: `trust_calibration_report:${fromKey}:${toKey}:${roleKey}:${outcomeWindowDays || 'default'}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة تقرير المعايرة للطابور',
          code: 'QUEUE_ENQUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'trust_calibration_report_queued',
        targetType: 'trust_calibration',
        targetId: 'report',
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          from,
          to,
          role,
          outcomeWindowDays,
        },
        ip: requestIp(req),
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

    const { generateCalibrationReport } = await import('../services/trustCalibration.js');

    const result = await generateCalibrationReport({
      from,
      to,
      role,
      outcomeWindowDays,
      persist: true,
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || 'تعذّر إنشاء التقرير',
        code: result.code || 'TRUST_CALIBRATION_REPORT_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'trust_calibration_report_run',
      targetType: 'trust_calibration',
      targetId: result.report?.id || 'report',
      details: {
        sampleCount: result.report?.sampleCount || 0,
        driftWarningCount: result.report?.driftWarnings?.length || 0,
        from,
        to,
        role,
        outcomeWindowDays,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, report: result.report });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء تقرير معايرة الثقة',
      code: 'TRUST_CALIBRATION_REPORT_ERROR',
    });
  }
}


// ═══════════════════════════════════════════════════════════════
// Phase 53 — Predictive Signal Precision + Retention Admin APIs
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/predictive-abuse/precision
 */
export async function handleAdminPredictivePrecision(req, res) {
  try {
    const { getPredictivePrecisionStats } = await import('../services/predictiveSignalRetention.js');

    const stats = await getPredictivePrecisionStats({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
    });

    return sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب دقة إشارات المخاطر',
      code: 'PREDICTIVE_PRECISION_ERROR',
    });
  }
}

/**
 * POST /api/admin/predictive-abuse/retention/run?async=1
 */
export async function handleAdminRunPredictiveSignalRetention(req, res) {
  try {
    const useAsync = parseBool(req.query.async);
    const body = req.body || {};

    if (useAsync) {
      const { enqueueJob } = await import('../services/opsQueue.js');

      const minuteBucket = new Date().toISOString().slice(0, 16);

      const enqueueResult = await enqueueJob({
        type: 'predictive_signal_retention',
        priority: 'normal',
        payload: {
          options: {
            force: parseBool(body.force),
            reason: 'admin_requested',
          },
        },
        idempotencyKey: `predictive_signal_retention:manual:${adminId(req)}:${minuteBucket}`,
        createdBy: adminId(req),
      });

      if (!enqueueResult.ok) {
        return sendJSON(res, 500, {
          error: enqueueResult.error || 'تعذّر إضافة retention للطابور',
          code: 'QUEUE_ENQUEUE_ERROR',
        });
      }

      logAction({
        adminId: adminId(req),
        action: 'predictive_signal_retention_queued',
        targetType: 'predictive_signal_retention',
        targetId: 'retention',
        details: {
          queueJobId: enqueueResult.job.id,
          deduped: !!enqueueResult.deduped,
          force: parseBool(body.force),
        },
        ip: requestIp(req),
      }).catch(() => {});

      return sendJSON(res, 202, {
        ok: true,
        queued: true,
        queueJobId: enqueueResult.job.id,
        job: enqueueResult.job,
        deduped: !!enqueueResult.deduped,
      });
    }

    const { runPredictiveSignalRetention } = await import('../services/predictiveSignalRetention.js');
    const result = await runPredictiveSignalRetention({
      force: parseBool(body.force),
      reason: 'admin_requested',
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تشغيل retention',
        code: result.code || 'PREDICTIVE_RETENTION_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'predictive_signal_retention_run',
      targetType: 'predictive_signal_retention',
      targetId: 'retention',
      details: {
        scanned: result.scanned,
        archived: result.archived,
        skipped: result.skipped,
        failed: result.failed,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل retention لإشارات المخاطر',
      code: 'PREDICTIVE_RETENTION_ERROR',
    });
  }
}

/**
 * POST /api/admin/predictive-abuse/signals/:id/false-positive
 * Body: { note? }
 */
export async function handleAdminMarkPredictiveFalsePositive(req, res) {
  try {
    const { markSignalFalsePositive } = await import('../services/predictiveAbuse.js');

    const signalId = req.params.id;
    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 500)
      : null;

    const result = await markSignalFalsePositive(signalId, adminId(req), note);

    if (!result.ok) {
      const status = result.code === 'SIGNAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    logAction({
      adminId: adminId(req),
      action: 'predictive_signal_false_positive',
      targetType: 'predictive_signal',
      targetId: signalId,
      details: { note },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, signal: result.signal });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تعليم الإشارة كـ False Positive',
      code: 'PREDICTIVE_FALSE_POSITIVE_ERROR',
    });
  }
}

/**
 * POST /api/admin/predictive-abuse/signals/:id/confirm
 * Body: { note? }
 */
export async function handleAdminMarkPredictiveConfirmed(req, res) {
  try {
    const { markSignalConfirmed } = await import('../services/predictiveAbuse.js');

    const signalId = req.params.id;
    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 500)
      : null;

    const result = await markSignalConfirmed(signalId, adminId(req), note);

    if (!result.ok) {
      const status = result.code === 'SIGNAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.code });
    }

    logAction({
      adminId: adminId(req),
      action: 'predictive_signal_confirmed',
      targetType: 'predictive_signal',
      targetId: signalId,
      details: { note },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, signal: result.signal });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تأكيد الإشارة',
      code: 'PREDICTIVE_CONFIRM_ERROR',
    });
  }
}
