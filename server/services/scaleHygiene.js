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
  ] = await Promise.all([
    import('./opsQueue.js').then(m => m.getQueueStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./queueCompaction.js').then(m => m.getQueueArchiveStats()).catch(err => ({ error: err.message })),
    import('./auditLogIndex.js').then(m => m.getAuditIndexHygieneStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./workroomHygiene.js').then(m => m.getWorkroomHygieneOverview({ limit: 200 })).catch(err => ({ enabled: false, error: err.message })),
    import('./trustSnapshotRollups.js').then(m => m.getTrustRetentionStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./predictiveArchiveIndex.js').then(m => m.getPredictiveArchiveIndexStats()).catch(err => ({ enabled: false, error: err.message })),
    import('./schedulerRunHistory.js').then(m => m.getSchedulerHistoryStats()).catch(err => ({ enabled: false, error: err.message })),
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

  warnings.sort((a, b) => severityRank(b.level) - severityRank(a.level));

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
    warnings: warnings.slice(0, 100),
    warningCount: warnings.length,
  };
}
