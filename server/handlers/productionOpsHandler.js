// ═══════════════════════════════════════════════════════════════
// server/handlers/productionOpsHandler.js — Production Ops Admin APIs (Phase 54)
// ═══════════════════════════════════════════════════════════════
// Admin-only production operations endpoints:
// - readiness
// - instance mode
// - process locks
// - scheduler registry
// - ops rollups/SLO
// - incidents
// - backup restore drills
// - maintenance mode
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

// ═══════════════════════════════════════════════════════════════
// Production Readiness + Instance Mode
// ═══════════════════════════════════════════════════════════════

export async function handleProductionReadiness(req, res) {
  try {
    const { getProductionReadiness } = await import('../services/productionReadiness.js');
    const result = await getProductionReadiness();
    return sendJSON(res, 200, { ok: true, readiness: result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في فحص جاهزية الإنتاج',
      code: 'PRODUCTION_READINESS_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/deployment-gate
 * Phase 57 — lightweight deployment gate for admin UI/scripts.
 */
export async function handleDeploymentGate(req, res) {
  try {
    const { getProductionReadiness } = await import('../services/productionReadiness.js');
    const { getScaleHygieneOverview } = await import('../services/scaleHygiene.js');
    const { getMarketplaceRollupFreshness } = await import('../services/marketplaceIntelligenceRollups.js');
    const { getLatestRestoreDrillFreshness } = await import('../services/backupRestoreDrill.js');

    const [readiness, scale, marketplace, restoreDrill] = await Promise.all([
      getProductionReadiness(),
      getScaleHygieneOverview().catch(err => ({ error: err.message, recommendedActions: [] })),
      getMarketplaceRollupFreshness().catch(err => ({ error: err.message })),
      getLatestRestoreDrillFreshness().catch(err => ({ error: err.message })),
    ]);

    const checks = readiness.checks || [];
    const failCount = checks.filter(c => c.status === 'fail').length;
    const warnCount = checks.filter(c => c.status === 'warn').length;

    const recommendedActions = [
      ...(scale.recommendedActions || []),
    ];

    if (marketplace.enabled && marketplace.stale) {
      recommendedActions.push({
        id: 'marketplace_rollup_run',
        label: 'تحديث ملخص ذكاء السوق',
        severity: 'warning',
        command: 'node scripts/rollup-product-intelligence.js',
        adminRoute: '/api/admin/marketplace-intelligence/rollup/run',
        reason: 'Marketplace rollup is stale or missing.',
      });
    }

    if (restoreDrill.enabled && (!restoreDrill.latest || !restoreDrill.fresh || !restoreDrill.passed)) {
      recommendedActions.push({
        id: 'restore_drill_run',
        label: 'تشغيل Restore Drill',
        severity: restoreDrill.latest && !restoreDrill.passed ? 'critical' : 'warning',
        command: 'node scripts/run-backup-restore-drill.js',
        adminRoute: '/api/admin/backups/restore-drill',
        reason: 'Latest restore drill is missing, stale, or failing.',
      });
    }

    return sendJSON(res, 200, {
      ok: failCount === 0,
      status: failCount > 0 ? 'blocked' : (warnCount > 0 ? 'warnings' : 'ready'),
      generatedAt: new Date().toISOString(),
      readiness,
      marketplace,
      restoreDrill,
      scaleSummary: {
        status: scale.status || 'unknown',
        warningCount: scale.warningCount || 0,
      },
      recommendedActions: recommendedActions.slice(0, 12),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Deployment Gate',
      code: 'DEPLOYMENT_GATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/scheduler-cadence
 * Phase 57 — scheduler cadence visibility.
 */
export async function handleSchedulerCadence(req, res) {
  try {
    const { registerDefaultSchedulerJobs, getSchedulerCadenceReport } = await import('../services/schedulerRegistry.js');

    await registerDefaultSchedulerJobs().catch(() => {});
    const report = await getSchedulerCadenceReport();

    return sendJSON(res, 200, { ok: true, report });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تقرير الجدولة',
      code: 'SCHEDULER_CADENCE_ERROR',
    });
  }
}

/**
 * GET /api/admin/production/ops-review
 * Phase 57 — compact weekly-review style summary for admin UI.
 */
export async function handleOpsReview(req, res) {
  try {
    const { getProductionReadiness } = await import('../services/productionReadiness.js');
    const { getQueueStats } = await import('../services/opsQueue.js');
    const { computeOpsSlo } = await import('../services/metricsRollups.js');
    const { getScaleHygieneOverview } = await import('../services/scaleHygiene.js');
    const { getMarketplaceIntelligenceDashboard } = await import('../services/marketplaceIntelligenceRollups.js');
    const { getPredictivePrecisionStats } = await import('../services/predictiveSignalRetention.js');
    const { getPaymentDisputeAnalytics } = await import('../services/paymentDisputeAnalytics.js');

    const [
      readiness,
      queue,
      slo,
      scale,
      marketplace,
      predictivePrecision,
      paymentDisputes,
    ] = await Promise.all([
      getProductionReadiness().catch(err => ({ error: err.message })),
      getQueueStats().catch(err => ({ error: err.message })),
      computeOpsSlo().catch(err => ({ error: err.message, violations: [] })),
      getScaleHygieneOverview().catch(err => ({ error: err.message, recommendedActions: [] })),
      getMarketplaceIntelligenceDashboard().catch(err => ({ error: err.message })),
      getPredictivePrecisionStats().catch(err => ({ error: err.message })),
      getPaymentDisputeAnalytics().catch(err => ({ error: err.message })),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      summary: {
        readinessStatus: readiness.status || 'unknown',
        queueDeadLetter: queue.byStatus?.['dead-letter'] || queue.deadLetter || 0,
        opsSloViolations: (slo.violations || []).length,
        scaleStatus: scale.status || 'unknown',
        marketplaceWarnings: marketplace.summary?.warningCount || 0,
        predictivePrecisionRate: predictivePrecision.precisionRate || 0,
        paymentDisputeRate: paymentDisputes.totals?.disputeRate || 0,
      },
      recommendedActions: scale.recommendedActions || [],
      readiness,
      queue,
      slo,
      scale,
      marketplace,
      predictivePrecision,
      paymentDisputes,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مراجعة التشغيل',
      code: 'OPS_REVIEW_ERROR',
    });
  }
}

export async function handleInstanceMode(req, res) {
  try {
    const { getInstanceInfo } = await import('../services/instanceMode.js');
    const { getWorkerStats } = await import('../services/queueWorkers.js');

    return sendJSON(res, 200, {
      ok: true,
      instance: getInstanceInfo(),
      queueWorker: getWorkerStats(),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب وضع التشغيل',
      code: 'INSTANCE_MODE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Process Locks
// ═══════════════════════════════════════════════════════════════

export async function handleProcessLocks(req, res) {
  try {
    const { listProcessLocks } = await import('../services/processLock.js');
    const locks = await listProcessLocks();

    return sendJSON(res, 200, {
      ok: true,
      locks,
      total: locks.length,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب أقفال العمليات',
      code: 'PROCESS_LOCKS_ERROR',
    });
  }
}

export async function handleReleaseProcessLock(req, res) {
  try {
    const lockName = req.params.name;
    const { forceReleaseLock } = await import('../services/processLock.js');

    const result = await forceReleaseLock(lockName, adminId(req));

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تحرير القفل',
        code: result.code || 'LOCK_RELEASE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'process_lock_force_released',
      targetType: 'process_lock',
      targetId: lockName,
      details: {
        released: !!result.released,
        previousOwnerId: result.previousLock?.ownerId || null,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      released: !!result.released,
      previousLock: result.previousLock || null,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحرير القفل',
      code: 'PROCESS_LOCK_RELEASE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Scheduler Registry
// ═══════════════════════════════════════════════════════════════

export async function handleListSchedulers(req, res) {
  try {
    const { registerDefaultSchedulerJobs, listSchedulerJobs } = await import('../services/schedulerRegistry.js');

    // Ensure default records exist for visibility.
    await registerDefaultSchedulerJobs().catch(() => {});

    const schedulers = await listSchedulerJobs();

    return sendJSON(res, 200, {
      ok: true,
      schedulers,
      total: schedulers.length,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل الجدولة',
      code: 'SCHEDULERS_LIST_ERROR',
    });
  }
}

export async function handleGetScheduler(req, res) {
  try {
    const { registerDefaultSchedulerJobs, getSchedulerJob } = await import('../services/schedulerRegistry.js');

    await registerDefaultSchedulerJobs().catch(() => {});

    const scheduler = await getSchedulerJob(req.params.name);
    if (!scheduler) {
      return sendJSON(res, 404, {
        error: 'مهمة الجدولة غير موجودة',
        code: 'SCHEDULER_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, scheduler });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مهمة الجدولة',
      code: 'SCHEDULER_GET_ERROR',
    });
  }
}

export async function handleRunSchedulerNow(req, res) {
  try {
    const { registerDefaultSchedulerJobs, runSchedulerJobNow } = await import('../services/schedulerRegistry.js');

    await registerDefaultSchedulerJobs().catch(() => {});

    const body = req.body || {};
    const result = await runSchedulerJobNow(req.params.name, {
      createdBy: adminId(req),
      force: parseBool(body.force) || parseBool(req.query.force),
      payload: body.payload || undefined,
      priority: body.priority || undefined,
    });

    if (!result.ok) {
      const statusMap = {
        SCHEDULER_NOT_FOUND: 404,
        SCHEDULER_DISABLED: 400,
        LEASE_HELD: 409,
        QUEUE_ENQUEUE_FAILED: 500,
        SCHEDULERS_DISABLED_BY_INSTANCE_MODE: 403,
      };
      return sendJSON(res, statusMap[result.code] || 400, {
        error: result.error || result.code || 'تعذّر تشغيل مهمة الجدولة',
        code: result.code || 'SCHEDULER_RUN_FAILED',
        details: result,
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'scheduler_manual_run',
      targetType: 'scheduler',
      targetId: req.params.name,
      details: {
        queueJobId: result.queueJob?.id || null,
        deduped: !!result.deduped,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 202, {
      ok: true,
      queued: true,
      queueJob: result.queueJob,
      scheduler: result.scheduler,
      deduped: !!result.deduped,
      idempotencyKey: result.idempotencyKey,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل مهمة الجدولة',
      code: 'SCHEDULER_RUN_ERROR',
    });
  }
}

export async function handleEnableScheduler(req, res) {
  return setSchedulerEnabled(req, res, true);
}

export async function handleDisableScheduler(req, res) {
  return setSchedulerEnabled(req, res, false);
}

async function setSchedulerEnabled(req, res, enabled) {
  try {
    const { enableSchedulerJob } = await import('../services/schedulerRegistry.js');
    const result = await enableSchedulerJob(req.params.name, enabled);

    if (!result.ok) {
      const status = result.code === 'SCHEDULER_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code || 'تعذّر تحديث حالة الجدولة',
        code: result.code || 'SCHEDULER_UPDATE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: enabled ? 'scheduler_enabled' : 'scheduler_disabled',
      targetType: 'scheduler',
      targetId: req.params.name,
      details: { enabled },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      scheduler: result.record,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحديث حالة الجدولة',
      code: 'SCHEDULER_ENABLE_DISABLE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Ops Rollups / SLO
// ═══════════════════════════════════════════════════════════════

export async function handleOpsRollups(req, res) {
  try {
    const { listOpsRollups, captureOpsRollup } = await import('../services/metricsRollups.js');

    if (parseBool(req.query.capture)) {
      await captureOpsRollup({ reason: 'admin_requested' }).catch(() => {});
    }

    const result = await listOpsRollups({
      from: req.query.from || undefined,
      to: req.query.to || undefined,
      limit: parseInt(req.query.limit) || 24,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب rollups التشغيل',
      code: 'OPS_ROLLUPS_ERROR',
    });
  }
}

export async function handleOpsSlo(req, res) {
  try {
    const { computeOpsSlo, captureOpsRollup } = await import('../services/metricsRollups.js');

    if (parseBool(req.query.refresh)) {
      await captureOpsRollup({ reason: 'admin_requested' }).catch(() => {});
    }

    const result = await computeOpsSlo();
    return sendJSON(res, 200, { ok: true, slo: result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب SLO التشغيل',
      code: 'OPS_SLO_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Incidents
// ═══════════════════════════════════════════════════════════════

export async function handleListIncidents(req, res) {
  try {
    const { listIncidents } = await import('../services/incidentTimeline.js');

    const result = await listIncidents({
      status: req.query.status || undefined,
      severity: req.query.severity || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب الحوادث التشغيلية',
      code: 'INCIDENTS_LIST_ERROR',
    });
  }
}

export async function handleGetIncident(req, res) {
  try {
    const { getIncident } = await import('../services/incidentTimeline.js');

    const incident = await getIncident(req.params.id);
    if (!incident) {
      return sendJSON(res, 404, {
        error: 'الحادث غير موجود',
        code: 'INCIDENT_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, incident });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب الحادث',
      code: 'INCIDENT_GET_ERROR',
    });
  }
}

export async function handleResolveIncident(req, res) {
  try {
    const { resolveIncident } = await import('../services/incidentTimeline.js');

    const note = req.body && typeof req.body.note === 'string'
      ? req.body.note.trim().slice(0, 1000)
      : null;

    const result = await resolveIncident(req.params.id, adminId(req), note);

    if (!result.ok) {
      const status = result.code === 'INCIDENT_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code || 'تعذّر حل الحادث',
        code: result.code || 'INCIDENT_RESOLVE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'incident_resolved',
      targetType: 'incident',
      targetId: req.params.id,
      details: { note },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, incident: result.incident });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حل الحادث',
      code: 'INCIDENT_RESOLVE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Backup Restore Drills
// ═══════════════════════════════════════════════════════════════

export async function handleRunBackupRestoreDrill(req, res) {
  try {
    const { enqueueJob } = await import('../services/opsQueue.js');

    const body = req.body || {};
    const minuteBucket = new Date().toISOString().slice(0, 16);

    const enqueueResult = await enqueueJob({
      type: 'backup_restore_drill',
      priority: body.priority || 'normal',
      payload: {
        options: {
          backupPath: body.backupPath || undefined,
          keepRestoreTarget: parseBool(body.keepRestoreTarget),
          reason: 'admin_requested',
        },
      },
      idempotencyKey: `backup_restore_drill:manual:${adminId(req)}:${minuteBucket}`,
      createdBy: adminId(req),
    });

    if (!enqueueResult.ok) {
      return sendJSON(res, 500, {
        error: enqueueResult.error || 'تعذّر إضافة Restore Drill للطابور',
        code: 'BACKUP_RESTORE_DRILL_QUEUE_ERROR',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'backup_restore_drill_queued',
      targetType: 'backup_restore_drill',
      targetId: enqueueResult.job.id,
      details: {
        queueJobId: enqueueResult.job.id,
        deduped: !!enqueueResult.deduped,
        backupPathProvided: !!body.backupPath,
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
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل Restore Drill',
      code: 'BACKUP_RESTORE_DRILL_ERROR',
    });
  }
}

export async function handleListBackupRestoreDrills(req, res) {
  try {
    const { listRestoreDrills } = await import('../services/backupRestoreDrill.js');

    const result = await listRestoreDrills({
      status: req.query.status || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Restore Drills',
      code: 'BACKUP_RESTORE_DRILLS_LIST_ERROR',
    });
  }
}

export async function handleGetBackupRestoreDrill(req, res) {
  try {
    const { getRestoreDrill } = await import('../services/backupRestoreDrill.js');

    const drill = await getRestoreDrill(req.params.id);
    if (!drill) {
      return sendJSON(res, 404, {
        error: 'Restore Drill غير موجود',
        code: 'BACKUP_RESTORE_DRILL_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, drill });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Restore Drill',
      code: 'BACKUP_RESTORE_DRILL_GET_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Maintenance Mode
// ═══════════════════════════════════════════════════════════════

export async function handleGetMaintenanceMode(req, res) {
  try {
    const { getMaintenanceMode } = await import('../services/maintenanceMode.js');
    const maintenance = await getMaintenanceMode();

    return sendJSON(res, 200, { ok: true, maintenance });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب وضع الصيانة',
      code: 'MAINTENANCE_GET_ERROR',
    });
  }
}

export async function handleEnableMaintenanceMode(req, res) {
  try {
    const { enableMaintenanceMode } = await import('../services/maintenanceMode.js');

    const message = req.body && typeof req.body.message === 'string'
      ? req.body.message.trim().slice(0, 500)
      : undefined;

    const result = await enableMaintenanceMode(adminId(req), message);

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تفعيل وضع الصيانة',
        code: result.code || 'MAINTENANCE_ENABLE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'maintenance_enabled',
      targetType: 'maintenance',
      targetId: 'maintenance',
      details: { message: result.maintenance.message },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, maintenance: result.maintenance });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تفعيل وضع الصيانة',
      code: 'MAINTENANCE_ENABLE_ERROR',
    });
  }
}

export async function handleDisableMaintenanceMode(req, res) {
  try {
    const { disableMaintenanceMode } = await import('../services/maintenanceMode.js');

    const result = await disableMaintenanceMode(adminId(req));

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code || 'تعذّر تعطيل وضع الصيانة',
        code: result.code || 'MAINTENANCE_DISABLE_FAILED',
      });
    }

    logAction({
      adminId: adminId(req),
      action: 'maintenance_disabled',
      targetType: 'maintenance',
      targetId: 'maintenance',
      details: {},
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, maintenance: result.maintenance });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تعطيل وضع الصيانة',
      code: 'MAINTENANCE_DISABLE_ERROR',
    });
  }
}
