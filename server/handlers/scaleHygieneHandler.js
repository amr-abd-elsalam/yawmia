// ═══════════════════════════════════════════════════════════════
// server/handlers/scaleHygieneHandler.js — Scale Hygiene Admin APIs (Phase 55)
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

async function enqueueOrRun(req, res, {
  asyncJobType,
  idempotencyKey,
  priority = 'normal',
  payload = {},
  syncFn,
  auditAction,
  auditTargetType,
  auditTargetId,
}) {
  const useAsync = parseBool(req.query.async);

  if (useAsync) {
    const { enqueueJob } = await import('../services/opsQueue.js');

    const enqueueResult = await enqueueJob({
      type: asyncJobType,
      priority,
      payload,
      idempotencyKey,
      createdBy: adminId(req),
    });

    if (!enqueueResult.ok) {
      return sendJSON(res, 500, {
        error: enqueueResult.error || 'تعذّر إضافة المهمة للطابور',
        code: 'QUEUE_ENQUEUE_ERROR',
      });
    }

    logAction({
      adminId: adminId(req),
      action: auditAction + '_queued',
      targetType: auditTargetType,
      targetId: auditTargetId,
      details: {
        queueJobId: enqueueResult.job.id,
        deduped: !!enqueueResult.deduped,
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

  const result = await syncFn();

  logAction({
    adminId: adminId(req),
    action: auditAction,
    targetType: auditTargetType,
    targetId: auditTargetId,
    details: result,
    ip: requestIp(req),
  }).catch(() => {});

  return sendJSON(res, 200, { ok: true, ...result });
}

export async function handleScaleHygieneOverview(req, res) {
  try {
    const { getScaleHygieneOverview } = await import('../services/scaleHygiene.js');

    // Phase 61.1:
    // Admin HTTP overview must be fast and artifact/summary based.
    // Heavy scans remain script/queue/manual.
    //
    // Phase 61.1 hardening:
    // Smoke/readiness paths must never hang behind a slow artifact reader,
    // stale lock, or accidental expensive dependency. If lightweight overview
    // does not finish quickly, return a degraded advisory response instead of
    // timing out the deploy smoke test.
    const timeoutMs = Math.min(4000, Math.max(500, parseInt(req.query.timeoutMs) || 3500));

    const overview = await Promise.race([
      getScaleHygieneOverview({ lightweight: true }),
      new Promise(resolve => setTimeout(() => resolve({
        enabled: true,
        generatedAt: new Date().toISOString(),
        status: 'warning',
        degraded: true,
        timeoutMs,
        warnings: [
          {
            source: 'scale_hygiene',
            level: 'warning',
            message: 'Scale hygiene lightweight overview timed out and returned degraded smoke-safe response',
            details: {
              timeoutMs,
              recommendation: 'Run node scripts/measure-storage-pressure.js --json --persist and inspect server logs.',
            },
          },
        ],
        recommendedActions: [
          {
            id: 'scale_hygiene_overview_timeout',
            label: 'راجع Scale Hygiene HTTP overview',
            severity: 'warning',
            command: 'node scripts/measure-storage-pressure.js --json --persist',
            adminRoute: '/api/admin/scale-hygiene/overview',
            reason: 'Lightweight scale hygiene overview exceeded the smoke-safe timeout.',
          },
        ],
      }), timeoutMs)),
    ]);

    return sendJSON(res, 200, { ok: true, overview });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب نظافة التوسع', code: 'SCALE_HYGIENE_ERROR' });
  }
}

export async function handleQueueHealth(req, res) {
  try {
    const { verifyQueueHealth } = await import('../services/queueHealthVerify.js');
    const health = await verifyQueueHealth();
    return sendJSON(res, 200, { ok: true, health });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص Queue', code: 'QUEUE_HEALTH_ERROR' });
  }
}

export async function handleQueueVerify(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'queue_verify',
      priority: 'normal',
      payload: { options: req.body || {} },
      idempotencyKey: `queue_verify:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { verifyQueueHealth } = await import('../services/queueHealthVerify.js');
        return await verifyQueueHealth(req.body?.options || {});
      },
      auditAction: 'queue_verify',
      auditTargetType: 'queue',
      auditTargetId: 'queue',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص Queue', code: 'QUEUE_VERIFY_ERROR' });
  }
}

export async function handleQueueCompact(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'queue_compaction',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `queue_compaction:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { compactQueue } = await import('../services/queueCompaction.js');
        return await compactQueue(req.body || {});
      },
      auditAction: 'queue_compaction',
      auditTargetType: 'queue',
      auditTargetId: 'queue',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في ضغط Queue', code: 'QUEUE_COMPACT_ERROR' });
  }
}

export async function handleQueueRepair(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'queue_repair',
      priority: 'high',
      payload: { options: req.body || {} },
      idempotencyKey: `queue_repair:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { repairQueueStorage } = await import('../services/queueHealthVerify.js');
        return await repairQueueStorage(req.body || {});
      },
      auditAction: 'queue_repair',
      auditTargetType: 'queue',
      auditTargetId: 'queue',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إصلاح Queue', code: 'QUEUE_REPAIR_ERROR' });
  }
}

export async function handleWorkroomHygieneOverview(req, res) {
  try {
    const { getWorkroomHygieneOverview } = await import('../services/workroomHygiene.js');
    const overview = await getWorkroomHygieneOverview({ limit: parseInt(req.query.limit) || 200 });
    return sendJSON(res, 200, { ok: true, overview });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب نظافة Workrooms', code: 'WORKROOM_HYGIENE_ERROR' });
  }
}

export async function handleWorkroomCompact(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'workroom_hygiene_compaction',
      priority: 'low',
      payload: { jobId: req.body?.jobId || null, options: req.body || {} },
      idempotencyKey: `workroom_hygiene_compaction:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { compactAllWorkrooms, compactWorkroom } = await import('../services/workroomHygiene.js');
        if (req.body?.jobId) return await compactWorkroom(req.body.jobId, req.body || {});
        return await compactAllWorkrooms(req.body || {});
      },
      auditAction: 'workroom_hygiene_compaction',
      auditTargetType: 'workroom_hygiene',
      auditTargetId: req.body?.jobId || 'all',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في ضغط Workrooms', code: 'WORKROOM_COMPACT_ERROR' });
  }
}

export async function handleWorkroomVerifyIndexes(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'workroom_search_verify',
      priority: 'normal',
      payload: { jobId: req.body?.jobId || null, repair: !!req.body?.repair, options: req.body || {} },
      idempotencyKey: `workroom_search_verify:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const mod = await import('../services/workroomIndexHealth.js');
        if (req.body?.jobId && req.body?.repair) return await mod.repairWorkroomSearchIndex(req.body.jobId);
        if (req.body?.jobId) return await mod.verifyWorkroomSearchIndex(req.body.jobId, req.body || {});
        return await mod.verifyAllWorkroomSearchIndexes(req.body || {});
      },
      auditAction: 'workroom_search_verify',
      auditTargetType: 'workroom_search',
      auditTargetId: req.body?.jobId || 'all',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في فحص Workroom indexes', code: 'WORKROOM_VERIFY_ERROR' });
  }
}

export async function handleWorkroomCleanupAttachments(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'workroom_attachment_cleanup',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `workroom_attachment_cleanup:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { cleanupOrphanAttachments } = await import('../services/workroomHygiene.js');
        return await cleanupOrphanAttachments(req.body || {});
      },
      auditAction: 'workroom_attachment_cleanup',
      auditTargetType: 'workroom_attachments',
      auditTargetId: 'all',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تنظيف المرفقات', code: 'ATTACHMENT_CLEANUP_ERROR' });
  }
}

export async function handleTrustRollups(req, res) {
  try {
    const { listTrustSnapshotRollups, getTrustRetentionStats } = await import('../services/trustSnapshotRollups.js');

    const [rollups, stats] = await Promise.all([
      listTrustSnapshotRollups({
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0,
      }),
      getTrustRetentionStats(),
    ]);

    return sendJSON(res, 200, { ok: true, stats, ...rollups });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب Trust Rollups', code: 'TRUST_ROLLUPS_ERROR' });
  }
}

export async function handleRunTrustRollup(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'trust_snapshot_rollup',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `trust_snapshot_rollup:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { runTrustRetention } = await import('../services/trustSnapshotRollups.js');
        return await runTrustRetention(req.body || {});
      },
      auditAction: 'trust_snapshot_rollup',
      auditTargetType: 'trust_retention',
      auditTargetId: req.body?.month || 'current',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في تشغيل Trust Rollup', code: 'TRUST_ROLLUP_RUN_ERROR' });
  }
}

export async function handlePredictiveArchiveIndexStatus(req, res) {
  try {
    const { getPredictiveArchiveIndexStats } = await import('../services/predictiveArchiveIndex.js');
    const stats = await getPredictiveArchiveIndexStats();
    return sendJSON(res, 200, { ok: true, stats });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب فهرس أرشيف المخاطر', code: 'PREDICTIVE_ARCHIVE_INDEX_ERROR' });
  }
}

export async function handleRebuildPredictiveArchiveIndex(req, res) {
  try {
    return enqueueOrRun(req, res, {
      asyncJobType: 'predictive_archive_index_rebuild',
      priority: 'low',
      payload: { options: req.body || {} },
      idempotencyKey: `predictive_archive_index_rebuild:manual:${adminId(req)}:${new Date().toISOString().slice(0, 16)}`,
      syncFn: async () => {
        const { rebuildPredictiveArchiveIndex } = await import('../services/predictiveArchiveIndex.js');
        return await rebuildPredictiveArchiveIndex(req.body || {});
      },
      auditAction: 'predictive_archive_index_rebuild',
      auditTargetType: 'predictive_archive_index',
      auditTargetId: 'predictive_archive_index',
    });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في إعادة بناء فهرس أرشيف المخاطر', code: 'PREDICTIVE_ARCHIVE_REBUILD_ERROR' });
  }
}

export async function handleSchedulerHistory(req, res) {
  try {
    const { listSchedulerRuns } = await import('../services/schedulerRunHistory.js');
    const result = await listSchedulerRuns(req.params.name, {
      month: req.query.month || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, { error: 'خطأ في جلب سجل تشغيل الجدولة', code: 'SCHEDULER_HISTORY_ERROR' });
  }
}
