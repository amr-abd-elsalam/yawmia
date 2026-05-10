// ═══════════════════════════════════════════════════════════════
// server/handlers/queueHandler.js — Ops Queue + Alert Delivery Admin APIs (Phase 52)
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

// ═══════════════════════════════════════════════════════════════
// Ops Queue
// ═══════════════════════════════════════════════════════════════

export async function handleAdminQueueStats(req, res) {
  try {
    const { getQueueStats } = await import('../services/opsQueue.js');
    const { getWorkerStats } = await import('../services/queueWorkers.js');

    const stats = await getQueueStats();
    const workers = getWorkerStats();

    return sendJSON(res, 200, { ok: true, stats, workers });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب حالة الطابور', code: 'QUEUE_STATS_ERROR' });
  }
}

export async function handleAdminQueueJobs(req, res) {
  try {
    const { listJobs } = await import('../services/opsQueue.js');

    const result = await listJobs({
      status: req.query.status || undefined,
      type: req.query.type || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب وظائف الطابور', code: 'QUEUE_JOBS_ERROR' });
  }
}

export async function handleAdminQueueJobDetail(req, res) {
  try {
    const { getJob } = await import('../services/opsQueue.js');

    const job = await getJob(req.params.id);
    if (!job) {
      return sendJSON(res, 404, { error: 'وظيفة الطابور غير موجودة', code: 'QUEUE_JOB_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب وظيفة الطابور', code: 'QUEUE_JOB_DETAIL_ERROR' });
  }
}

export async function handleAdminRetryQueueJob(req, res) {
  try {
    const { retryJob } = await import('../services/opsQueue.js');

    const result = await retryJob(req.params.id, {
      resetAttempts: req.body?.resetAttempts !== false,
    });

    if (!result.ok) {
      const status = result.error === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    logAction({
      adminId: adminId(req),
      action: 'ops_queue_job_retried',
      targetType: 'ops_queue_job',
      targetId: req.params.id,
      details: { resetAttempts: req.body?.resetAttempts !== false },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, job: result.job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة تشغيل وظيفة الطابور', code: 'QUEUE_JOB_RETRY_ERROR' });
  }
}

export async function handleAdminCancelQueueJob(req, res) {
  try {
    const { cancelJob } = await import('../services/opsQueue.js');

    const reason = req.body && typeof req.body.reason === 'string'
      ? req.body.reason.slice(0, 500)
      : 'cancelled_by_admin';

    const result = await cancelJob(req.params.id, reason);

    if (!result.ok) {
      const status = result.error === 'JOB_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    logAction({
      adminId: adminId(req),
      action: 'ops_queue_job_cancelled',
      targetType: 'ops_queue_job',
      targetId: req.params.id,
      details: { reason },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, { ok: true, job: result.job });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إلغاء وظيفة الطابور', code: 'QUEUE_JOB_CANCEL_ERROR' });
  }
}

export async function handleAdminDeadLetterJobs(req, res) {
  try {
    const { listJobs } = await import('../services/opsQueue.js');

    const result = await listJobs({
      status: 'dead-letter',
      deadLetter: true,
      type: req.query.type || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب Dead Letter Queue', code: 'QUEUE_DLQ_ERROR' });
  }
}

export async function handleAdminRetryDeadLetterJob(req, res) {
  // Same retryJob implementation supports active/dead-letter source.
  return handleAdminRetryQueueJob(req, res);
}

// ═══════════════════════════════════════════════════════════════
// Alert Deliveries
// ═══════════════════════════════════════════════════════════════

export async function handleAdminAlertDeliveries(req, res) {
  try {
    const { listDeliveries } = await import('../services/alertDeliveryHistory.js');

    const result = await listDeliveries({
      status: req.query.status || undefined,
      channel: req.query.channel || undefined,
      eventType: req.query.eventType || undefined,
      severity: req.query.severity || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل تسليم التنبيهات', code: 'ALERT_DELIVERIES_ERROR' });
  }
}

export async function handleAdminAlertDeliveryDetail(req, res) {
  try {
    const { getDelivery } = await import('../services/alertDeliveryHistory.js');

    const delivery = await getDelivery(req.params.id);
    if (!delivery) {
      return sendJSON(res, 404, { error: 'سجل التسليم غير موجود', code: 'DELIVERY_NOT_FOUND' });
    }

    return sendJSON(res, 200, { ok: true, delivery });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل التسليم', code: 'ALERT_DELIVERY_DETAIL_ERROR' });
  }
}

export async function handleAdminRetryAlertDelivery(req, res) {
  try {
    const { retryDelivery } = await import('../services/alertDeliveryHistory.js');

    const result = await retryDelivery(req.params.id, adminId(req));

    if (!result.ok) {
      const status = result.error === 'DELIVERY_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, { error: result.error, code: result.error });
    }

    logAction({
      adminId: adminId(req),
      action: 'alert_delivery_retried',
      targetType: 'alert_delivery',
      targetId: req.params.id,
      details: { queueJobId: result.queueJob?.id || result.delivery?.queueJobId || null },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 200, {
      ok: true,
      delivery: result.delivery,
      queueJob: result.queueJob,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة إرسال التنبيه', code: 'ALERT_DELIVERY_RETRY_ERROR' });
  }
}

export async function handleAdminAlertDeliveryHealth(req, res) {
  try {
    const { getAlertDeliveryStats } = await import('../services/alertDeliveryHistory.js');
    const stats = await getAlertDeliveryStats();
    return sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب صحة تسليم التنبيهات', code: 'ALERT_DELIVERY_HEALTH_ERROR' });
  }
}

// ═══════════════════════════════════════════════════════════════
// Async Audit Export
// ═══════════════════════════════════════════════════════════════

export async function handleAdminCreateAuditExportJob(req, res) {
  try {
    const { createExport, updateExportProgress } = await import('../services/exportRegistry.js');
    const { enqueueJob } = await import('../services/opsQueue.js');
    const { getCollectionPath } = await import('../services/database.js');
    const { readdir } = await import('node:fs/promises');

    const body = req.body || {};
    const filters = {
      from: body.from || req.query.from || undefined,
      to: body.to || req.query.to || undefined,
      action: body.action || req.query.action || undefined,
    };

    let totalEstimate = 0;
    try {
      const auditDir = getCollectionPath('audit');
      const files = await readdir(auditDir);
      totalEstimate = files.filter(f =>
        f.startsWith('aud_') && f.endsWith('.json') && !f.endsWith('.tmp')
      ).length;
    } catch (_) {
      totalEstimate = 0;
    }

    const exportRecord = await createExport({
      type: 'audit_csv',
      filters,
      requestedBy: adminId(req),
      totalEstimate,
    });

    if (!exportRecord) {
      return sendJSON(res, 503, { error: 'سجل التصديرات غير مفعّل', code: 'EXPORTS_DISABLED' });
    }

    await updateExportProgress(exportRecord.id, {
      status: 'pending',
      rowsProcessed: 0,
      totalEstimate,
    }).catch(() => {});

    const enqueueResult = await enqueueJob({
      type: 'audit_csv_export',
      priority: 'normal',
      payload: {
        exportId: exportRecord.id,
        filters,
      },
      // Phase 52: one queue job per export record.
      // Dedupe-by-filters would orphan newly-created export records unless done before createExport().
      idempotencyKey: `audit_csv_export:${exportRecord.id}`,
      createdBy: adminId(req),
    });

    if (!enqueueResult.ok) {
      try {
        const { failExport } = await import('../services/exportRegistry.js');
        await failExport(exportRecord.id, enqueueResult.error || 'EXPORT_QUEUE_ERROR');
      } catch (_) { /* non-fatal */ }

      return sendJSON(res, 500, { error: enqueueResult.error || 'تعذّر إضافة التصدير للطابور', code: 'EXPORT_QUEUE_ERROR' });
    }

    logAction({
      adminId: adminId(req),
      action: 'async_audit_export_created',
      targetType: 'export',
      targetId: exportRecord.id,
      details: {
        filters,
        queueJobId: enqueueResult.job.id,
        deduped: !!enqueueResult.deduped,
      },
      ip: requestIp(req),
    }).catch(() => {});

    return sendJSON(res, 202, {
      ok: true,
      exportId: exportRecord.id,
      queueJobId: enqueueResult.job.id,
      export: exportRecord,
      job: enqueueResult.job,
      deduped: !!enqueueResult.deduped,
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إنشاء تصدير بالخلفية', code: 'ASYNC_EXPORT_CREATE_ERROR' });
  }
}
