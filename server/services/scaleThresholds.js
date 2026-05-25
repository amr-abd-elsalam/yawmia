// ═══════════════════════════════════════════════════════════════
// server/services/scaleThresholds.js — Scale Threshold Evaluation (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Central advisory evaluator for file-based scale thresholds.
//
// Important:
// - Pure helpers do NOT scan the filesystem.
// - Heavy/shallow scanning is delegated to storagePressure.js.
// - Default mode is advisory.
// - No external DB/search/queue implementation in Phase 59.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

function cfg() {
  return config.SCALE_LIMITS || {};
}

function thresholds() {
  return cfg().thresholds || {};
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStatus(status) {
  if (status === 'critical') return 'critical';
  if (status === 'warning') return 'warning';
  return 'ok';
}

function worseStatus(a, b) {
  const order = { ok: 0, warning: 1, critical: 2 };
  return (order[normalizeStatus(b)] || 0) > (order[normalizeStatus(a)] || 0)
    ? normalizeStatus(b)
    : normalizeStatus(a);
}

function pushIssue(target, level, issue) {
  if (!target || !issue) return;
  const row = {
    level,
    code: issue.code || 'SCALE_THRESHOLD',
    message: issue.message || '',
    metric: issue.metric || null,
    value: issue.value,
    threshold: issue.threshold,
    scope: issue.scope || null,
    recommendation: issue.recommendation || null,
  };

  if (level === 'critical') target.criticals.push(row);
  else if (level === 'warning') target.warnings.push(row);
}

/**
 * Return Phase 59 scale threshold config.
 */
export function getScaleThresholdConfig() {
  return {
    enabled: !!cfg().enabled,
    mode: cfg().mode || 'advisory',
    shallowScanMaxFiles: cfg().shallowScanMaxFiles || 250000,
    deepScanDefaultEnabled: !!cfg().deepScanDefaultEnabled,
    thresholds: thresholds(),
  };
}

/**
 * Evaluate a numeric value against warning/critical thresholds.
 *
 * @param {number} value
 * @param {number} warning
 * @param {number} critical
 * @returns {'ok'|'warning'|'critical'}
 */
export function evaluateThreshold(value, warning, critical) {
  const v = Number(value) || 0;
  const w = Number(warning) || 0;
  const c = Number(critical) || 0;

  if (c > 0 && v >= c) return 'critical';
  if (w > 0 && v >= w) return 'warning';
  return 'ok';
}

/**
 * Evaluate collection pressure.
 *
 * Expected collectionStats shape:
 * {
 *   [collectionName]: {
 *     fileCount,
 *     totalSizeKB,
 *     largestJsonKB,
 *     shards: {
 *       'YYYY-MM': { fileCount, totalSizeKB, largestJsonKB }
 *     }
 *   }
 * }
 */
export function evaluateCollectionPressure(collectionStats = {}, collectionThresholds = thresholds().collections || {}) {
  const result = {
    status: 'ok',
    warnings: [],
    criticals: [],
    evaluations: {},
  };

  for (const [collection, stats] of Object.entries(collectionStats || {})) {
    const th = collectionThresholds[collection];
    if (!th) continue;

    const row = {
      collection,
      status: 'ok',
      checks: [],
    };

    // Flat/global file count threshold.
    if (th.warningFiles || th.criticalFiles) {
      const status = evaluateThreshold(stats.fileCount || 0, th.warningFiles, th.criticalFiles);
      row.status = worseStatus(row.status, status);
      row.checks.push({
        metric: 'fileCount',
        value: stats.fileCount || 0,
        status,
      });

      if (status !== 'ok') {
        pushIssue(result, status, {
          code: 'COLLECTION_FILE_COUNT_PRESSURE',
          scope: collection,
          metric: 'fileCount',
          value: stats.fileCount || 0,
          threshold: status === 'critical' ? th.criticalFiles : th.warningFiles,
          message: `Collection ${collection} file count reached ${status} threshold.`,
          recommendation: `راجع ${collection}: archive/compact/verify قبل التفكير في Phase 60 externalization.`,
        });
      }
    }

    // Largest JSON threshold.
    if (th.warningLargestJsonKB || th.criticalLargestJsonKB) {
      const status = evaluateThreshold(
        stats.largestJsonKB || 0,
        th.warningLargestJsonKB,
        th.criticalLargestJsonKB
      );
      row.status = worseStatus(row.status, status);
      row.checks.push({
        metric: 'largestJsonKB',
        value: stats.largestJsonKB || 0,
        status,
      });

      if (status !== 'ok') {
        pushIssue(result, status, {
          code: 'COLLECTION_LARGEST_JSON_PRESSURE',
          scope: collection,
          metric: 'largestJsonKB',
          value: stats.largestJsonKB || 0,
          threshold: status === 'critical' ? th.criticalLargestJsonKB : th.warningLargestJsonKB,
          message: `Collection ${collection} has large JSON files.`,
          recommendation: `افحص أكبر ملفات ${collection} وشغّل verify-file-health قبل أي إجراء.`,
        });
      }
    }

    // Per-shard thresholds.
    if (th.warningFilesPerShard || th.criticalFilesPerShard) {
      const shards = stats.shards || {};
      for (const [shard, shardStats] of Object.entries(shards)) {
        const status = evaluateThreshold(
          shardStats.fileCount || 0,
          th.warningFilesPerShard,
          th.criticalFilesPerShard
        );

        row.status = worseStatus(row.status, status);
        row.checks.push({
          metric: 'filesPerShard',
          shard,
          value: shardStats.fileCount || 0,
          status,
        });

        if (status !== 'ok') {
          pushIssue(result, status, {
            code: 'COLLECTION_SHARD_FILE_COUNT_PRESSURE',
            scope: `${collection}/${shard}`,
            metric: 'filesPerShard',
            value: shardStats.fileCount || 0,
            threshold: status === 'critical' ? th.criticalFilesPerShard : th.warningFilesPerShard,
            message: `Collection ${collection} shard ${shard} reached ${status} file threshold.`,
            recommendation: `راجع shard ${collection}/${shard}: قد تحتاج archive أو Phase 60 planning لو تكرر الضغط.`,
          });
        }
      }
    }

    result.evaluations[collection] = row;
    result.status = worseStatus(result.status, row.status);
  }

  return result;
}

/**
 * Evaluate index pressure.
 *
 * Expected indexStats shape:
 * {
 *   setIndexes: [{ name, sizeKB }],
 *   auditTokenIndex: { fileCount, totalSizeKB, largestTokenFiles: [] },
 *   searchIndex: { sizeKB }
 * }
 */
export function evaluateIndexPressure(indexStats = {}, indexThresholds = thresholds().indexes || {}) {
  const result = {
    status: 'ok',
    warnings: [],
    criticals: [],
    evaluations: {},
  };

  const setIndexes = Array.isArray(indexStats.setIndexes) ? indexStats.setIndexes : [];
  const setRows = [];

  for (const idx of setIndexes) {
    const status = evaluateThreshold(
      idx.sizeKB || 0,
      indexThresholds.setIndexWarningKB,
      indexThresholds.setIndexCriticalKB
    );

    setRows.push({ ...idx, status });
    result.status = worseStatus(result.status, status);

    if (status !== 'ok') {
      pushIssue(result, status, {
        code: 'SET_INDEX_SIZE_PRESSURE',
        scope: idx.name,
        metric: 'sizeKB',
        value: idx.sizeKB || 0,
        threshold: status === 'critical'
          ? indexThresholds.setIndexCriticalKB
          : indexThresholds.setIndexWarningKB,
        message: `Set index ${idx.name} reached ${status} size threshold.`,
        recommendation: `شغّل repair-indexes أو راجع تقسيم index ${idx.name}.`,
      });
    }
  }

  result.evaluations.setIndexes = setRows;

  const auditToken = indexStats.auditTokenIndex || {};
  const auditTokenStatus = evaluateThreshold(
    auditToken.fileCount || 0,
    indexThresholds.auditTokenFilesWarning,
    indexThresholds.auditTokenFilesCritical
  );

  result.evaluations.auditTokenIndex = {
    ...auditToken,
    status: auditTokenStatus,
  };
  result.status = worseStatus(result.status, auditTokenStatus);

  if (auditTokenStatus !== 'ok') {
    pushIssue(result, auditTokenStatus, {
      code: 'AUDIT_TOKEN_INDEX_FILE_PRESSURE',
      scope: 'auditTokenIndex',
      metric: 'fileCount',
      value: auditToken.fileCount || 0,
      threshold: auditTokenStatus === 'critical'
        ? indexThresholds.auditTokenFilesCritical
        : indexThresholds.auditTokenFilesWarning,
      message: `Audit token index file count reached ${auditTokenStatus} threshold.`,
      recommendation: 'شغّل audit token compaction ثم verify-audit-index. لو الضغط مستمر، سجّل مراجعة external search Phase 60+.',
    });
  }

  const searchIndex = indexStats.searchIndex || {};
  const searchStatus = evaluateThreshold(
    searchIndex.sizeKB || 0,
    indexThresholds.searchIndexWarningKB,
    indexThresholds.searchIndexCriticalKB
  );

  result.evaluations.searchIndex = {
    ...searchIndex,
    status: searchStatus,
  };
  result.status = worseStatus(result.status, searchStatus);

  if (searchStatus !== 'ok') {
    pushIssue(result, searchStatus, {
      code: 'SEARCH_INDEX_SIZE_PRESSURE',
      scope: 'searchIndex',
      metric: 'sizeKB',
      value: searchIndex.sizeKB || 0,
      threshold: searchStatus === 'critical'
        ? indexThresholds.searchIndexCriticalKB
        : indexThresholds.searchIndexWarningKB,
      message: `Search index reached ${searchStatus} size threshold.`,
      recommendation: 'شغّل rebuild-search-relevance وراجع search analytics قبل التفكير في external search Phase 60+.',
    });
  }

  return result;
}

/**
 * Evaluate ops queue pressure.
 */
export function evaluateQueuePressure(queueStats = {}, queueThresholds = thresholds().queue || {}) {
  const result = {
    status: 'ok',
    warnings: [],
    criticals: [],
    evaluations: {},
  };

  const byStatus = queueStats.byStatus || queueStats.statusCounts || {};
  const summary = queueStats.summary || {};
  const summaryUnreliable = !!(
    summary.stale ||
    summary.mismatchSuspected ||
    summary.staleReason === 'status_total_exceeds_location_count'
  );

  const checks = [
    {
      key: 'pending',
      value: byStatus.pending || queueStats.pending || 0,
      warning: queueThresholds.pendingWarning,
      critical: queueThresholds.pendingCritical,
      code: 'QUEUE_PENDING_PRESSURE',
      message: 'Queue pending jobs pressure detected.',
      recommendation: 'راجع queue workers/schedulers وشغّل compact/verify queue. لا تشغّل multiple writers.',
    },
    {
      key: 'running',
      value: byStatus.running || queueStats.running || 0,
      warning: queueThresholds.runningWarning,
      critical: queueThresholds.runningCritical,
      code: 'QUEUE_RUNNING_PRESSURE',
      message: 'Queue running jobs pressure detected.',
      recommendation: 'افحص stale running jobs والـ leases قبل retry أو repair.',
    },
    {
      key: 'deadLetter',
      value: byStatus['dead-letter'] || queueStats.deadLetter || 0,
      warning: queueThresholds.deadLetterWarning,
      critical: queueThresholds.deadLetterCritical,
      code: 'QUEUE_DEAD_LETTER_PRESSURE',
      message: 'Queue dead-letter pressure detected.',
      recommendation: 'راجع DLQ runbook. استخدم queue-retry-dlq --dry-run ولا تعمل retry جماعي بدون فهم السبب.',
    },
  ];

  for (const check of checks) {
    const rawStatus = evaluateThreshold(check.value, check.warning, check.critical);

    // Phase 61.1:
    // If queue summary/location index is unreliable, do not turn inflated
    // pending/running/dead-letter numbers into hard scale pressure evidence.
    // Report the summary problem separately and ask for verify/repair first.
    const status = summaryUnreliable ? 'ok' : rawStatus;

    result.evaluations[check.key] = {
      ...check,
      status,
      rawStatus,
      ignoredDueToUnreliableSummary: summaryUnreliable,
    };

    result.status = worseStatus(result.status, status);

    if (status !== 'ok') {
      pushIssue(result, status, {
        code: check.code,
        scope: 'ops_queue',
        metric: check.key,
        value: check.value,
        threshold: status === 'critical' ? check.critical : check.warning,
        message: check.message,
        recommendation: check.recommendation,
      });
    }
  }

  if (summaryUnreliable) {
    result.status = worseStatus(result.status, 'warning');
    pushIssue(result, 'warning', {
      code: 'QUEUE_SUMMARY_UNRELIABLE',
      scope: 'ops_queue_summary',
      metric: 'summaryReliability',
      value: summary.staleReason || 'unreliable',
      threshold: 'verified_summary',
      message: 'Queue summary/location index is unreliable; active queue counts are ignored for scale pressure until repaired.',
      recommendation: 'شغّل verify-queue ثم repair-queue --dry-run. لا تعتبر inflated queue stats دليل external queue.',
    });
  }
  if (summary.lastUpdatedAt) {
    const ageMs = Date.now() - new Date(summary.lastUpdatedAt).getTime();
    const ageMinutes = Math.round(ageMs / 60000);
    const warningMinutes = queueThresholds.staleSummaryWarningMinutes || 30;
    const criticalMinutes = (queueThresholds.staleSummaryCriticalHours || 6) * 60;

    const status = evaluateThreshold(ageMinutes, warningMinutes, criticalMinutes);
    result.evaluations.summaryAgeMinutes = {
      value: ageMinutes,
      status,
    };
    result.status = worseStatus(result.status, status);

    if (status !== 'ok') {
      pushIssue(result, status, {
        code: 'QUEUE_SUMMARY_STALE',
        scope: 'ops_queue_summary',
        metric: 'summaryAgeMinutes',
        value: ageMinutes,
        threshold: status === 'critical' ? criticalMinutes : warningMinutes,
        message: 'Queue summary/location index is stale.',
        recommendation: 'شغّل verify-queue ثم repair-queue إذا ظهر mismatch.',
      });
    }
  } else if (summary.stale) {
    result.status = worseStatus(result.status, 'warning');
    pushIssue(result, 'warning', {
      code: 'QUEUE_SUMMARY_STALE',
      scope: 'ops_queue_summary',
      metric: 'stale',
      value: true,
      threshold: true,
      message: 'Queue summary is marked stale.',
      recommendation: 'شغّل verify-queue ثم repair-queue.',
    });
  }

  return result;
}

/**
 * Evaluate Workroom pressure.
 */
export function evaluateWorkroomPressure(workroomStats = {}, workroomThresholds = thresholds().workrooms || {}) {
  const result = {
    status: 'ok',
    warnings: [],
    criticals: [],
    evaluations: {},
  };

  const sidecarStatus = evaluateThreshold(
    workroomStats.largestSidecarKB || 0,
    workroomThresholds.sidecarWarningKB,
    workroomThresholds.sidecarCriticalKB
  );

  result.evaluations.largestSidecarKB = {
    value: workroomStats.largestSidecarKB || 0,
    status: sidecarStatus,
  };
  result.status = worseStatus(result.status, sidecarStatus);

  if (sidecarStatus !== 'ok') {
    pushIssue(result, sidecarStatus, {
      code: 'WORKROOM_SIDECAR_PRESSURE',
      scope: 'workrooms',
      metric: 'largestSidecarKB',
      value: workroomStats.largestSidecarKB || 0,
      threshold: sidecarStatus === 'critical'
        ? workroomThresholds.sidecarCriticalKB
        : workroomThresholds.sidecarWarningKB,
      message: 'Workroom sidecar size pressure detected.',
      recommendation: 'شغّل compact-workrooms و verify-workroom-indexes. راجع read receipts write amplification.',
    });
  }

  const searchStatus = evaluateThreshold(
    workroomStats.largestSearchIndexKB || 0,
    workroomThresholds.searchIndexWarningKB,
    workroomThresholds.searchIndexCriticalKB
  );

  result.evaluations.largestSearchIndexKB = {
    value: workroomStats.largestSearchIndexKB || 0,
    status: searchStatus,
  };
  result.status = worseStatus(result.status, searchStatus);

  if (searchStatus !== 'ok') {
    pushIssue(result, searchStatus, {
      code: 'WORKROOM_SEARCH_INDEX_PRESSURE',
      scope: 'workroom_search',
      metric: 'largestSearchIndexKB',
      value: workroomStats.largestSearchIndexKB || 0,
      threshold: searchStatus === 'critical'
        ? workroomThresholds.searchIndexCriticalKB
        : workroomThresholds.searchIndexWarningKB,
      message: 'Workroom search index size pressure detected.',
      recommendation: 'شغّل rebuild-workroom-search أو verify-workroom-indexes قبل أي external search discussion.',
    });
  }

  return result;
}

/**
 * Evaluate image/object store pressure.
 *
 * Expected imageStats shape:
 * {
 *   binaryFileCount,
 *   metaFileCount,
 *   totalSizeKB,
 *   largestFileKB
 * }
 */
export function evaluateImagePressure(imageStats = {}, imageThresholds = thresholds().images || {}) {
  const result = {
    status: 'ok',
    warnings: [],
    criticals: [],
    evaluations: {},
  };

  const totalSizeMB = Math.round(((imageStats.totalSizeKB || 0) / 1024) * 10) / 10;
  const largestFileMB = Math.round(((imageStats.largestFileKB || 0) / 1024) * 10) / 10;

  const totalSizeStatus = evaluateThreshold(
    totalSizeMB,
    imageThresholds.totalSizeWarningMB,
    imageThresholds.totalSizeCriticalMB
  );

  result.evaluations.totalSizeMB = {
    value: totalSizeMB,
    status: totalSizeStatus,
  };
  result.status = worseStatus(result.status, totalSizeStatus);

  if (totalSizeStatus !== 'ok') {
    pushIssue(result, totalSizeStatus, {
      code: 'IMAGE_STORE_SIZE_PRESSURE',
      scope: 'images',
      metric: 'totalSizeMB',
      value: totalSizeMB,
      threshold: totalSizeStatus === 'critical'
        ? imageThresholds.totalSizeCriticalMB
        : imageThresholds.totalSizeWarningMB,
      message: 'Image/object store size pressure detected.',
      recommendation: 'راجع cleanup-attachments و image object storage readiness. لا تنقل الصور خارجياً قبل Phase 60+ decision.',
    });
  }

  const largestFileStatus = evaluateThreshold(
    largestFileMB,
    imageThresholds.largestFileWarningMB,
    imageThresholds.largestFileCriticalMB
  );

  result.evaluations.largestFileMB = {
    value: largestFileMB,
    status: largestFileStatus,
  };
  result.status = worseStatus(result.status, largestFileStatus);

  if (largestFileStatus !== 'ok') {
    pushIssue(result, largestFileStatus, {
      code: 'IMAGE_LARGEST_FILE_PRESSURE',
      scope: 'images',
      metric: 'largestFileMB',
      value: largestFileMB,
      threshold: largestFileStatus === 'critical'
        ? imageThresholds.largestFileCriticalMB
        : imageThresholds.largestFileWarningMB,
      message: 'Large image/object file detected.',
      recommendation: 'افحص image size policy وverify-file-health. لا تعرض raw image data في التقارير.',
    });
  }

  const binaryCountStatus = evaluateThreshold(
    imageStats.binaryFileCount || 0,
    imageThresholds.binaryFilesWarning,
    imageThresholds.binaryFilesCritical
  );

  result.evaluations.binaryFileCount = {
    value: imageStats.binaryFileCount || 0,
    status: binaryCountStatus,
  };
  result.status = worseStatus(result.status, binaryCountStatus);

  if (binaryCountStatus !== 'ok') {
    pushIssue(result, binaryCountStatus, {
      code: 'IMAGE_BINARY_FILE_COUNT_PRESSURE',
      scope: 'images',
      metric: 'binaryFileCount',
      value: imageStats.binaryFileCount || 0,
      threshold: binaryCountStatus === 'critical'
        ? imageThresholds.binaryFilesCritical
        : imageThresholds.binaryFilesWarning,
      message: 'Image/object binary file count pressure detected.',
      recommendation: 'شغّل cleanup-attachments وراجع object storage candidate في EXTERNALIZATION_READINESS.md.',
    });
  }

  return result;
}

/**
 * Evaluate governance pressure.
 */
export function evaluateGovernancePressure(governanceStats = {}, collectionThresholds = thresholds().collections || {}) {
  const result = {
    status: 'ok',
    warnings: [],
    criticals: [],
    evaluations: {},
  };

  const map = {
    privacyRequests: {
      collection: 'privacy_requests',
      label: 'Privacy requests',
    },
    adminApprovals: {
      collection: 'admin_approvals',
      label: 'Admin approvals',
    },
    opsReviews: {
      collection: 'ops_reviews',
      label: 'Ops reviews',
    },
    postmortems: {
      collection: 'postmortems',
      label: 'Postmortems',
    },
  };

  for (const [key, def] of Object.entries(map)) {
    const stats = governanceStats[key] || {};
    const th = collectionThresholds[def.collection] || {};
    const status = evaluateThreshold(stats.total || 0, th.warningFiles, th.criticalFiles);

    result.evaluations[key] = {
      ...stats,
      status,
    };
    result.status = worseStatus(result.status, status);

    if (status !== 'ok') {
      pushIssue(result, status, {
        code: 'GOVERNANCE_RECORD_PRESSURE',
        scope: def.collection,
        metric: 'total',
        value: stats.total || 0,
        threshold: status === 'critical' ? th.criticalFiles : th.warningFiles,
        message: `${def.label} reached ${status} record threshold.`,
        recommendation: 'راجع retention/cadence وسجّل مراجعة تشغيل أسبوعية إذا كان النمو غير متوقع.',
      });
    }

    if ((stats.stale || 0) > 0 || (stats.overdue || 0) > 0 || (stats.failed || 0) > 0) {
      result.status = worseStatus(result.status, 'warning');
      pushIssue(result, 'warning', {
        code: 'GOVERNANCE_STALE_RECORDS',
        scope: def.collection,
        metric: 'staleOrOverdue',
        value: (stats.stale || 0) + (stats.overdue || 0) + (stats.failed || 0),
        threshold: 1,
        message: `${def.label} has stale, overdue, or failed records.`,
        recommendation: 'راجع Governance tab، عالج الطلبات/الموافقات/المراجعات المفتوحة ووثّق القرار.',
      });
    }
  }

  return result;
}

/**
 * Build action-first recommendations from evaluations.
 */
export function buildScaleRecommendations(evaluations = {}) {
  const allIssues = [];

  for (const group of Object.values(evaluations || {})) {
    if (!group || typeof group !== 'object') continue;
    if (Array.isArray(group.criticals)) allIssues.push(...group.criticals);
    if (Array.isArray(group.warnings)) allIssues.push(...group.warnings);
  }

  const seen = new Set();
  const recommendations = [];

  for (const issue of allIssues) {
    const key = `${issue.code}:${issue.scope || ''}:${issue.metric || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let severity = issue.level || 'warning';
    let command = null;
    let adminRoute = null;

    if (issue.code && issue.code.startsWith('QUEUE_')) {
      command = 'node scripts/verify-queue.js';
      adminRoute = '/api/admin/ops-queue/stats';
    } else if (issue.code && issue.code.includes('AUDIT')) {
      command = 'node scripts/verify-audit-index.js';
      adminRoute = '/api/admin/audit-index/status';
    } else if (issue.code && issue.code.includes('WORKROOM')) {
      command = 'node scripts/verify-workroom-indexes.js';
      adminRoute = '/api/admin/workroom-hygiene/overview';
    } else if (issue.code && issue.code.includes('IMAGE')) {
      command = 'node scripts/cleanup-attachments.js --dry-run';
      adminRoute = '/api/admin/storage-pressure';
    } else if (issue.code && issue.code.includes('COLLECTION')) {
      command = 'node scripts/measure-storage-pressure.js';
      adminRoute = '/api/admin/storage-pressure';
    } else if (issue.code && issue.code.includes('GOVERNANCE')) {
      command = 'node scripts/verify-privacy-governance.js';
      adminRoute = '/api/admin/rbac/matrix';
    } else {
      command = 'node scripts/verify-scale-thresholds.js';
      adminRoute = '/api/admin/scale-thresholds';
    }

    recommendations.push({
      id: key.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 120),
      severity,
      label: issue.message || 'راجع حدود التوسع',
      reason: issue.recommendation || 'راجع pressure details قبل أي قرار externalization.',
      command,
      adminRoute,
      source: issue.scope || null,
      metric: issue.metric || null,
      value: issue.value,
      threshold: issue.threshold,
    });
  }

  const order = { critical: 0, warning: 1, info: 2 };
  recommendations.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  const limit = config.STORAGE_PRESSURE?.recommendationLimit || 10;
  return recommendations.slice(0, limit);
}

/**
 * Verify all scale thresholds using a provided or freshly loaded storage pressure snapshot.
 *
 * @param {{ pressureSnapshot?: object, deep?: boolean, persist?: boolean }} options
 */
export async function verifyScaleThresholds(options = {}) {
  if (!cfg().enabled) {
    return {
      enabled: false,
      status: 'ok',
      warnings: [],
      criticals: [],
      recommendations: [],
      generatedAt: nowIso(),
    };
  }

  let snapshot = options.pressureSnapshot || null;

  if (!snapshot) {
    const storagePressure = await import('./storagePressure.js').catch(() => null);
    if (storagePressure) {
      if (options.latestOnly && storagePressure.getLatestStoragePressureSnapshot) {
        snapshot = await storagePressure.getLatestStoragePressureSnapshot().catch(() => null);
      } else if (storagePressure.getStoragePressure) {
        snapshot = await storagePressure.getStoragePressure({
          deep: !!options.deep,
          persist: options.persist !== false,
        }).catch(() => null);
      }
    }
  }

  if (!snapshot) {
    return {
      enabled: true,
      status: 'warning',
      warnings: [{
        level: 'warning',
        code: 'STORAGE_PRESSURE_UNAVAILABLE',
        message: 'Storage pressure snapshot is unavailable.',
        recommendation: 'شغّل node scripts/measure-storage-pressure.js أو راجع /api/admin/storage-pressure.',
      }],
      criticals: [],
      recommendations: [{
        id: 'storage_pressure_unavailable',
        severity: 'warning',
        label: 'قياس ضغط التخزين غير متاح',
        reason: 'شغّل قياس ضغط التخزين قبل اتخاذ قرارات توسع.',
        command: 'node scripts/measure-storage-pressure.js',
        adminRoute: '/api/admin/storage-pressure',
      }],
      generatedAt: nowIso(),
    };
  }

  const th = thresholds();

  const evaluations = {
    collections: evaluateCollectionPressure(snapshot.collections || {}, th.collections || {}),
    indexes: evaluateIndexPressure(snapshot.indexes || {}, th.indexes || {}),
    queue: evaluateQueuePressure(snapshot.queue || {}, th.queue || {}),
    workrooms: evaluateWorkroomPressure(snapshot.workrooms || {}, th.workrooms || {}),
    images: evaluateImagePressure(snapshot.images || {}, th.images || {}),
    governance: evaluateGovernancePressure(snapshot.governance || {}, th.collections || {}),
  };

  let status = 'ok';
  const warnings = [];
  const criticals = [];

  for (const group of Object.values(evaluations)) {
    status = worseStatus(status, group.status);
    if (Array.isArray(group.warnings)) warnings.push(...group.warnings);
    if (Array.isArray(group.criticals)) criticals.push(...group.criticals);
  }

  const recommendations = buildScaleRecommendations(evaluations);

  return {
    enabled: true,
    mode: cfg().mode || 'advisory',
    status,
    warnings,
    criticals,
    recommendations,
    evaluations,
    snapshotId: snapshot.id || null,
    snapshotTimestamp: snapshot.timestamp || null,
    generatedAt: nowIso(),
  };
}

export const _testHelpers = {
  worseStatus,
  pushIssue,
  normalizeStatus,
};
