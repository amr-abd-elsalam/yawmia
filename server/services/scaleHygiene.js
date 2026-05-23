// ═══════════════════════════════════════════════════════════════
// server/services/scaleHygiene.js — Scale Hygiene Overview (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Aggregates queue/workroom/audit/trust/predictive/scheduler hygiene.
// Admin-only consumption.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

function isEnabled() {
  return !!(config.SCALE_HYGIENE && config.SCALE_HYGIENE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function severityRank(level) {
  return ({ info: 1, warning: 2, medium: 2, high: 3, critical: 4, error: 4 })[level] || 1;
}

function normalizeWarning(source, warning) {
  if (!warning) return null;
  return {
    source,
    level: warning.level || warning.status || 'warning',
    message: warning.message || warning.type || String(warning),
    details: warning,
  };
}

function normalizeAction(action) {
  if (!action) return null;
  return {
    id: action.id || 'ops_action',
    label: action.label || action.message || 'راجع الحالة التشغيلية',
    severity: action.severity || action.level || 'warning',
    command: action.command || null,
    adminRoute: action.adminRoute || null,
    reason: action.reason || action.message || null,
  };
}

async function collectPostmortemBacklog() {
  try {
    const { listIncidents } = await import('./incidentTimeline.js');
    const { isPostmortemRequired, getPostmortemByIncident } = await import('./postmortemRecords.js');

    const result = await listIncidents({ limit: 100, offset: 0 });
    const incidents = result.incidents || [];

    const missing = [];
    for (const inc of incidents) {
      if (!isPostmortemRequired(inc)) continue;
      const pm = await getPostmortemByIncident(inc.id);
      if (!pm) {
        missing.push({
          incidentId: inc.id,
          severity: inc.severity,
          title: inc.title,
          status: inc.status,
        });
      }
    }

    return {
      missing,
      missingCount: missing.length,
    };
  } catch (err) {
    return { error: err.message, missing: [], missingCount: 0 };
  }
}

/**
 * Get unified scale hygiene overview.
 */
export async function getScaleHygieneOverview() {
  if (!isEnabled()) {
    return {
      enabled: false,
      generatedAt: nowIso(),
      warnings: [],
    };
  }

  const warnings = [];

  const [
    queueStats,
    queueArchiveStats,
    auditHygiene,
    workroomHygiene,
    trustRetention,
    predictiveArchiveIndex,
    schedulerHistory,
    queueRecommendations,
    marketplaceFreshness,
    restoreDrillFreshness,
    schedulerCadence,
    weeklyOpsReviewFreshness,
    postmortemBacklog,
    rbacMatrix,
    storagePressure,
  ] = await Promise.all([
    import('./opsQueue.js').then(m => m.getQueueStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./queueCompaction.js').then(m => m.getQueueArchiveStats()).catch(err => ({ error: err.message })),
    import('./auditLogIndex.js').then(m => m.getAuditIndexHygieneStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./workroomHygiene.js').then(m => m.getWorkroomHygieneOverview({ limit: 200 })).catch(err => ({ enabled: false, error: err.message })),
    import('./trustSnapshotRollups.js').then(m => m.getTrustRetentionStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./predictiveArchiveIndex.js').then(m => m.getPredictiveArchiveIndexStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./schedulerRunHistory.js').then(m => m.getSchedulerHistoryStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./queueHealthVerify.js').then(m => m.getQueueOperationalRecommendations()).catch(err => ([{
      id: 'queue_recommendations_unavailable',
      label: 'تعذّر توليد توصيات الطابور',
      severity: 'warning',
      command: 'node scripts/verify-queue.js',
      reason: err.message,
    }])),
    import('./marketplaceIntelligenceRollups.js').then(m => m.getMarketplaceRollupFreshness()).catch(err => ({ enabled: false, error: err.message })),
    import('./backupRestoreDrill.js').then(m => m.getLatestRestoreDrillFreshness()).catch(err => ({ enabled: false, error: err.message })),
    import('./schedulerRegistry.js').then(m => m.getSchedulerCadenceReport()).catch(err => ({ enabled: false, error: err.message })),
    import('./opsReviewRecords.js')
      .then(m => m.getReviewFreshness('weekly_ops_review', config.OPS_REVIEW_RECORDS?.weeklyReviewMaxAgeDays || 7))
      .catch(err => ({ enabled: false, error: err.message })),
    collectPostmortemBacklog().catch(err => ({ error: err.message, missing: [] })),
    import('./adminRbac.js')
      .then(m => m.getRbacMatrix())
      .catch(err => ({ enabled: false, error: err.message })),
    import('./storagePressure.js')
      .then(m => m.getStoragePressure({ persist: false }))
      .catch(err => ({ enabled: false, error: err.message })),
  ]);

  if (queueStats.summary && queueStats.summary.stale) {
    warnings.push({
      source: 'queue',
      level: 'warning',
      message: 'Queue summary is stale',
      details: queueStats.summary,
    });
  }

  if ((queueStats.byStatus?.['dead-letter'] || 0) > 0) {
    warnings.push({
      source: 'queue',
      level: 'warning',
      message: 'Queue has dead-letter jobs',
      details: { deadLetter: queueStats.byStatus['dead-letter'] },
    });
  }

  for (const w of auditHygiene.warnings || []) {
    const normalized = normalizeWarning('audit', w);
    if (normalized) warnings.push(normalized);
  }

  for (const w of workroomHygiene.warnings || []) {
    const normalized = normalizeWarning('workroom', w);
    if (normalized) warnings.push(normalized);
  }

  if (predictiveArchiveIndex.enabled && predictiveArchiveIndex.status !== 'healthy') {
    warnings.push({
      source: 'predictive_archive',
      level: 'warning',
      message: 'Predictive archive index is missing or stale',
      details: predictiveArchiveIndex,
    });
  }

  if (marketplaceFreshness && marketplaceFreshness.enabled && marketplaceFreshness.stale) {
    warnings.push({
      source: 'marketplace_rollup',
      level: config.DEPLOYMENT_DISCIPLINE?.requireMarketplaceRollupFreshInProduction ? 'critical' : 'warning',
      message: marketplaceFreshness.latestGeneratedAt
        ? 'Marketplace intelligence rollup is stale'
        : 'Marketplace intelligence rollup is missing',
      details: marketplaceFreshness,
    });
  }

  if (restoreDrillFreshness && restoreDrillFreshness.enabled) {
    if (!restoreDrillFreshness.latest) {
      warnings.push({
        source: 'restore_drill',
        level: 'warning',
        message: 'No backup restore drill has been recorded',
        details: restoreDrillFreshness,
      });
    } else if (!restoreDrillFreshness.passed) {
      warnings.push({
        source: 'restore_drill',
        level: 'critical',
        message: 'Latest backup restore drill failed',
        details: restoreDrillFreshness,
      });
    } else if (!restoreDrillFreshness.fresh) {
      warnings.push({
        source: 'restore_drill',
        level: 'warning',
        message: 'Latest backup restore drill is stale',
        details: restoreDrillFreshness,
      });
    }
  }

  if (schedulerCadence && schedulerCadence.staleCount > 0) {
    warnings.push({
      source: 'scheduler',
      level: 'warning',
      message: `${schedulerCadence.staleCount} scheduler job(s) are stale or failed`,
      details: {
        staleCount: schedulerCadence.staleCount,
        failedCount: schedulerCadence.failedCount || 0,
      },
    });
  }

  // Phase 58 — Governance warnings.
  if (!rbacMatrix || rbacMatrix.enabled === false) {
    warnings.push({
      source: 'governance',
      level: 'critical',
      message: 'Admin RBAC is disabled or unavailable',
      details: rbacMatrix || {},
    });
  }

  if (weeklyOpsReviewFreshness && weeklyOpsReviewFreshness.fresh === false) {
    warnings.push({
      source: 'governance',
      level: 'warning',
      message: weeklyOpsReviewFreshness.status === 'missing'
        ? 'Weekly ops review record is missing'
        : 'Weekly ops review record is stale',
      details: weeklyOpsReviewFreshness,
    });
  }

  if (postmortemBacklog && postmortemBacklog.missingCount > 0) {
    warnings.push({
      source: 'postmortems',
      level: 'critical',
      message: `${postmortemBacklog.missingCount} incident(s) require postmortem`,
      details: postmortemBacklog,
    });
  }

  // Phase 59 — Storage pressure warnings.
  if (storagePressure && storagePressure.enabled !== false) {
    for (const c of storagePressure.criticals || []) {
      warnings.push({
        source: 'storage_pressure',
        level: 'critical',
        message: c.message || c.code || 'Storage pressure critical finding',
        details: c,
      });
    }

    for (const w of storagePressure.warnings || []) {
      warnings.push({
        source: 'storage_pressure',
        level: w.level || 'warning',
        message: w.message || w.code || 'Storage pressure warning',
        details: w,
      });
    }
  } else if (storagePressure && storagePressure.error) {
    warnings.push({
      source: 'storage_pressure',
      level: 'warning',
      message: 'Storage pressure could not be evaluated',
      details: storagePressure,
    });
  }

  const recommendedActions = [];

  for (const action of queueRecommendations || []) {
    const normalized = normalizeAction(action);
    if (normalized) recommendedActions.push(normalized);
  }

  // Phase 59 — Storage pressure recommended actions.
  if (storagePressure && Array.isArray(storagePressure.recommendations)) {
    for (const action of storagePressure.recommendations) {
      const normalized = normalizeAction(action);
      if (normalized) recommendedActions.push(normalized);
    }
  }

  if (storagePressure && storagePressure.status === 'critical') {
    recommendedActions.push({
      id: 'storage_pressure_critical_review',
      label: 'مراجعة ضغط التخزين الحرج',
      severity: 'critical',
      command: 'node scripts/verify-scale-thresholds.js --strict',
      adminRoute: '/api/admin/storage-pressure',
      reason: 'Storage pressure has critical findings. ابدأ بالتحقق والضغط/الإصلاح قبل أي Phase 60 externalization.',
    });
  } else if (storagePressure && storagePressure.status === 'warning') {
    recommendedActions.push({
      id: 'storage_pressure_warning_review',
      label: 'مراجعة ضغط التخزين',
      severity: 'warning',
      command: 'node scripts/measure-storage-pressure.js',
      adminRoute: '/api/admin/storage-pressure',
      reason: 'Storage pressure has warnings. التحذير لا يعني نقل قاعدة البيانات فوراً.',
    });
  }

  if (marketplaceFreshness && marketplaceFreshness.enabled && marketplaceFreshness.stale) {
    recommendedActions.push({
      id: 'marketplace_rollup_run',
      label: 'تحديث ملخص ذكاء السوق',
      severity: 'warning',
      command: 'node scripts/rollup-product-intelligence.js',
      adminRoute: '/api/admin/marketplace-intelligence/rollup/run',
      reason: 'Marketplace rollup is stale or missing.',
    });
  }

  if (restoreDrillFreshness && restoreDrillFreshness.enabled && (!restoreDrillFreshness.latest || !restoreDrillFreshness.passed || !restoreDrillFreshness.fresh)) {
    recommendedActions.push({
      id: 'restore_drill_run',
      label: 'تشغيل اختبار استعادة النسخة الاحتياطية',
      severity: restoreDrillFreshness.latest && !restoreDrillFreshness.passed ? 'critical' : 'warning',
      command: 'node scripts/run-backup-restore-drill.js',
      adminRoute: '/api/admin/backups/restore-drill',
      reason: 'Latest restore drill is missing, stale, or failing.',
    });
  }

  if (schedulerCadence && schedulerCadence.staleCount > 0) {
    recommendedActions.push({
      id: 'scheduler_cadence_review',
      label: 'مراجعة مهام الجدولة المتأخرة',
      severity: 'warning',
      command: 'node scripts/scheduler-cadence-report.js',
      adminRoute: '/api/admin/schedulers',
      reason: `${schedulerCadence.staleCount} scheduler job(s) require review.`,
    });
  }

  if (auditHygiene && auditHygiene.warnings && auditHygiene.warnings.length > 0) {
    recommendedActions.push({
      id: 'audit_index_hygiene_review',
      label: 'مراجعة فهرس سجل العمليات',
      severity: 'warning',
      command: 'node scripts/verify-audit-index.js',
      adminRoute: '/api/admin/audit-index/status',
      reason: 'Audit index hygiene warnings detected.',
    });
  }

  // Phase 58 — Governance recommended actions.
  if (!rbacMatrix || rbacMatrix.enabled === false) {
    recommendedActions.push({
      id: 'admin_rbac_enable',
      label: 'تفعيل صلاحيات الأدمن RBAC',
      severity: 'critical',
      command: 'node scripts/verify-admin-rbac.js --strict',
      adminRoute: '/api/admin/rbac/matrix',
      reason: 'RBAC يحمي إجراءات الأدمن الحساسة بمبدأ أقل صلاحية.',
    });
  }

  if (weeklyOpsReviewFreshness && weeklyOpsReviewFreshness.fresh === false) {
    recommendedActions.push({
      id: 'weekly_ops_review_persist',
      label: 'تسجيل مراجعة التشغيل الأسبوعية',
      severity: 'warning',
      command: 'node scripts/ops-weekly-review.js --persist',
      adminRoute: '/api/admin/ops/reviews',
      reason: 'لا توجد مراجعة تشغيل حديثة موثقة.',
    });
  }

  if (postmortemBacklog && postmortemBacklog.missingCount > 0) {
    recommendedActions.push({
      id: 'incident_postmortems_required',
      label: 'إنشاء Postmortem للحوادث الحرجة',
      severity: 'critical',
      command: 'راجع /api/admin/incidents ثم أنشئ postmortem',
      adminRoute: '/api/admin/postmortems',
      reason: 'بعض الحوادث تتطلب تحليل سبب جذري وخطة منع تكرار.',
    });
  }

  warnings.sort((a, b) => severityRank(b.level) - severityRank(a.level));
  recommendedActions.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  const status = warnings.some(w => severityRank(w.level) >= 4)
    ? 'critical'
    : warnings.length > 0
      ? 'warnings'
      : 'healthy';

  return {
    enabled: true,
    status,
    generatedAt: nowIso(),
    queue: {
      stats: queueStats,
      archives: queueArchiveStats,
    },
    audit: auditHygiene,
    workrooms: workroomHygiene,
    trust: trustRetention,
    predictiveArchive: predictiveArchiveIndex,
    schedulerHistory,
    storagePressure: storagePressure || {
      enabled: false,
      status: 'unknown',
    },
    marketplace: {
      freshness: marketplaceFreshness,
    },
    restoreDrill: {
      freshness: restoreDrillFreshness,
    },
    schedulerCadence,
    governance: {
      rbac: rbacMatrix || { enabled: false },
      reviews: {
        weeklyOpsReview: weeklyOpsReviewFreshness || null,
      },
      postmortems: postmortemBacklog || { missingCount: 0, missing: [] },
      privacy: {
        enabled: !!(config.PRIVACY_REQUESTS && config.PRIVACY_REQUESTS.enabled),
        exportEnabled: !!(config.PRIVACY_REQUESTS && config.PRIVACY_REQUESTS.exportEnabled),
        anonymizeEnabled: !!(config.PRIVACY_REQUESTS && config.PRIVACY_REQUESTS.anonymizeEnabled),
      },
    },
    recommendedActions: recommendedActions.slice(0, 12),
    warnings: warnings.slice(0, 100),
    warningCount: warnings.length,
  };
}
