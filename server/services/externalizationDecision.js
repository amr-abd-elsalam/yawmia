// ═══════════════════════════════════════════════════════════════
// server/services/externalizationDecision.js — Evidence-Based Decision (Phase 60)
// ═══════════════════════════════════════════════════════════════
// Aggregates persisted evidence into advisory externalization decisions.
// No external DB/search/queue implementation.
// No connection strings.
// No heavy scans by default.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';

function isEnabled() {
  return !!(config.EXTERNALIZATION_DECISION && config.EXTERNALIZATION_DECISION.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'edc_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function decisionPath(id) {
  return getRecordPath('externalization_decisions', id);
}

function candidateNames() {
  return config.EXTERNALIZATION_READINESS?.candidates || [
    'users',
    'jobs',
    'applications',
    'payments',
    'messages',
    'ops_queue',
    'audit',
    'search',
    'images',
  ];
}

function normalizeStatus(status) {
  const allowed = config.EXTERNALIZATION_DECISION?.decisionStatuses || [];
  return allowed.includes(status) ? status : 'monitor';
}

export function evaluateRepeatedPressureEvidence(snapshots, options = {}) {
  const cfg = config.EXTERNALIZATION_DECISION || {};
  const warningMin = Number(options.repeatedWarningMinSnapshots || cfg.repeatedWarningMinSnapshots || 3);
  const criticalMin = Number(options.repeatedCriticalMinSnapshots || cfg.repeatedCriticalMinSnapshots || 2);
  const windowDays = Number(options.evidenceWindowDays || cfg.evidenceWindowDays || 30);
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  const rows = Array.isArray(snapshots) ? snapshots : [];
  const recent = rows.filter(s => {
    const ts = new Date(s.timestamp || s.createdAt || 0).getTime();
    return Number.isFinite(ts) && ts >= cutoffMs;
  });

  const byCandidate = {};
  for (const name of candidateNames()) {
    byCandidate[name] = {
      candidate: name,
      warningSnapshots: 0,
      criticalSnapshots: 0,
      latestStatus: 'ok',
      evidence: [],
    };
  }

  function addCandidateEvidence(candidate, level, label, details) {
    if (!byCandidate[candidate]) return;
    if (level === 'critical') byCandidate[candidate].criticalSnapshots++;
    else if (level === 'warning') byCandidate[candidate].warningSnapshots++;
    byCandidate[candidate].latestStatus = level;
    byCandidate[candidate].evidence.push({ level, label, details: details || null });
  }

  for (const snap of recent) {
    const status = snap.status || 'ok';
    const warnings = Array.isArray(snap.warnings) ? snap.warnings : [];
    const criticals = Array.isArray(snap.criticals) ? snap.criticals : [];

    for (const c of criticals) {
      const code = String(c.code || c.type || c.metric || '').toLowerCase();
      if (code.includes('queue')) addCandidateEvidence('ops_queue', 'critical', c.code || 'queue_critical', c.message);
      if (code.includes('audit')) addCandidateEvidence('audit', 'critical', c.code || 'audit_critical', c.message);
      if (code.includes('search')) addCandidateEvidence('search', 'critical', c.code || 'search_critical', c.message);
      if (code.includes('image')) addCandidateEvidence('images', 'critical', c.code || 'images_critical', c.message);
      if (code.includes('workroom') || code.includes('message')) addCandidateEvidence('messages', 'critical', c.code || 'messages_critical', c.message);
      if (code.includes('job')) addCandidateEvidence('jobs', 'critical', c.code || 'jobs_critical', c.message);
      if (code.includes('application')) addCandidateEvidence('applications', 'critical', c.code || 'applications_critical', c.message);
      if (code.includes('user')) addCandidateEvidence('users', 'critical', c.code || 'users_critical', c.message);
      if (code.includes('payment')) addCandidateEvidence('payments', 'critical', c.code || 'payments_critical', c.message);
    }

    for (const w of warnings) {
      const code = String(w.code || w.type || w.metric || '').toLowerCase();
      if (code.includes('queue')) addCandidateEvidence('ops_queue', 'warning', w.code || 'queue_warning', w.message);
      if (code.includes('audit')) addCandidateEvidence('audit', 'warning', w.code || 'audit_warning', w.message);
      if (code.includes('search')) addCandidateEvidence('search', 'warning', w.code || 'search_warning', w.message);
      if (code.includes('image')) addCandidateEvidence('images', 'warning', w.code || 'images_warning', w.message);
      if (code.includes('workroom') || code.includes('message')) addCandidateEvidence('messages', 'warning', w.code || 'messages_warning', w.message);
      if (code.includes('job')) addCandidateEvidence('jobs', 'warning', w.code || 'jobs_warning', w.message);
      if (code.includes('application')) addCandidateEvidence('applications', 'warning', w.code || 'applications_warning', w.message);
      if (code.includes('user')) addCandidateEvidence('users', 'warning', w.code || 'users_warning', w.message);
      if (code.includes('payment')) addCandidateEvidence('payments', 'warning', w.code || 'payments_warning', w.message);
    }

    if (status === 'critical') {
      // General pressure without specific code should not force any candidate.
    }
  }

  const candidates = Object.values(byCandidate).map(row => {
    let repeated = 'none';
    if (row.criticalSnapshots >= criticalMin) repeated = 'critical';
    else if (row.warningSnapshots >= warningMin) repeated = 'warning';

    return {
      ...row,
      repeated,
      repeatedWarningMinSnapshots: warningMin,
      repeatedCriticalMinSnapshots: criticalMin,
    };
  });

  return {
    windowDays,
    snapshotCount: recent.length,
    candidates,
  };
}

export function evaluateBenchmarkEvidence(benchmarks, options = {}) {
  const rows = Array.isArray(benchmarks) ? benchmarks : [];
  const byCandidate = {};

  for (const name of candidateNames()) {
    byCandidate[name] = {
      candidate: name,
      warningBenchmarks: 0,
      criticalBenchmarks: 0,
      evidence: [],
    };
  }

  function mapPathToCandidate(path) {
    const p = String(path || '').toLowerCase();
    if (p.includes('queue')) return 'ops_queue';
    if (p.includes('audit')) return 'audit';
    if (p.includes('search')) return 'search';
    if (p.includes('image')) return 'images';
    if (p.includes('message') || p.includes('workroom')) return 'messages';
    if (p.includes('job')) return 'jobs';
    if (p.includes('application')) return 'applications';
    if (p.includes('user')) return 'users';
    if (p.includes('payment')) return 'payments';
    return null;
  }

  for (const b of rows) {
    const warnings = Array.isArray(b.warnings) ? b.warnings : [];
    const criticals = Array.isArray(b.criticals) ? b.criticals : [];

    for (const c of criticals) {
      const candidate = mapPathToCandidate(c.path);
      if (!candidate || !byCandidate[candidate]) continue;
      byCandidate[candidate].criticalBenchmarks++;
      byCandidate[candidate].evidence.push({ level: 'critical', path: c.path, p95Ms: c.p95Ms });
    }

    for (const w of warnings) {
      const candidate = mapPathToCandidate(w.path);
      if (!candidate || !byCandidate[candidate]) continue;
      byCandidate[candidate].warningBenchmarks++;
      byCandidate[candidate].evidence.push({ level: 'warning', path: w.path, p95Ms: w.p95Ms });
    }
  }

  return {
    benchmarkCount: rows.length,
    candidates: Object.values(byCandidate),
  };
}

export function buildCandidateDecisionRows(evidence, readiness, options = {}) {
  const pressure = evidence?.pressure?.candidates || [];
  const benchmark = evidence?.benchmarks?.candidates || [];
  const readinessCandidates = readiness?.candidates || [];

  const byName = {};

  for (const name of candidateNames()) {
    byName[name] = {
      candidate: name,
      status: 'no_action',
      score: 0,
      reasons: [],
      recommendedAction: 'استمر بالمراقبة ولا تنفذ نقل خارجي.',
      implementationAllowed: false,
    };
  }

  for (const p of pressure) {
    const row = byName[p.candidate];
    if (!row) continue;

    if (p.repeated === 'critical') {
      row.score += 0.6;
      row.reasons.push('Repeated critical storage pressure');
      row.status = 'rehearsal_required';
    } else if (p.repeated === 'warning') {
      row.score += 0.35;
      row.reasons.push('Repeated warning storage pressure');
      row.status = 'mitigate_file_based';
    } else if (p.warningSnapshots > 0 || p.criticalSnapshots > 0) {
      row.score += 0.1;
      row.reasons.push('Single pressure signal only');
      row.status = 'monitor';
    }
  }

  for (const b of benchmark) {
    const row = byName[b.candidate];
    if (!row) continue;

    if (b.criticalBenchmarks > 0) {
      row.score += 0.3;
      row.reasons.push('Critical benchmark evidence');
      if (row.status === 'mitigate_file_based') row.status = 'rehearsal_required';
    } else if (b.warningBenchmarks > 0) {
      row.score += 0.15;
      row.reasons.push('Warning benchmark evidence');
      if (row.status === 'no_action') row.status = 'monitor';
    }
  }

  for (const rc of readinessCandidates) {
    const row = byName[rc.name];
    if (!row) continue;
    row.score += Math.min(0.25, Number(rc.score || 0) * 0.25);
    if (rc.evidence && rc.evidence.length > 0) {
      row.reasons.push('Externalization readiness advisory evidence');
    }
  }

  for (const row of Object.values(byName)) {
    row.score = Math.round(Math.min(1, row.score) * 100) / 100;

    if (row.status === 'no_action') {
      row.recommendedAction = 'لا يوجد إجراء خارجي. استمر بالمراقبة.';
    } else if (row.status === 'monitor') {
      row.recommendedAction = 'اجمع evidence إضافي قبل أي قرار.';
    } else if (row.status === 'mitigate_file_based') {
      row.recommendedAction = 'نفذ compact/repair/verify ثم أعد القياس.';
    } else if (row.status === 'rehearsal_required') {
      row.recommendedAction = 'شغّل migration snapshot validation + rehearsal قبل التفكير في pilot.';
    }

    // Phase 60 guardrail: never pilot unless explicitly passed by options and evidence is strong.
    if (options.allowPilotCandidate === true && row.status === 'rehearsal_required' && row.score >= 0.9) {
      row.status = 'pilot_candidate';
      row.recommendedAction = 'مرشح Pilot محدود — يتطلب Approval وخطة Rollback.';
    }

    row.status = normalizeStatus(row.status);
    row.implementationAllowed = false;
  }

  return Object.values(byName).sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate));
}

export function buildPhase60RecommendedActions(report) {
  const actions = [];

  if (!report) return actions;

  if (!report.evidence?.pressure || report.evidence.pressure.snapshotCount === 0) {
    actions.push({
      id: 'capture_storage_pressure',
      label: 'قياس ضغط التخزين',
      severity: 'warning',
      command: 'node scripts/measure-storage-pressure.js --json',
      adminRoute: '/api/admin/storage-pressure/capture',
      reason: 'لا توجد pressure snapshots كافية لاتخاذ قرار Phase 60.',
    });
  }

  if (!report.evidence?.benchmarks || report.evidence.benchmarks.benchmarkCount === 0) {
    actions.push({
      id: 'run_benchmark_file_paths',
      label: 'تشغيل Benchmarks للمسارات الملفية',
      severity: 'warning',
      command: 'node scripts/benchmark-file-paths.js --json --persist',
      adminRoute: '/api/admin/benchmarks/history',
      reason: 'لا يوجد benchmark history لتقييم p95 قبل أي externalization.',
    });
  }

  const benchmarkEvidence = report.evidence?.benchmarks || {};
  if ((benchmarkEvidence.latestErrorCount || 0) > 0) {
    actions.push({
      id: 'diagnose_benchmark_errors',
      label: 'تشخيص أخطاء Benchmark',
      severity: 'critical',
      command: 'node scripts/verify-data-json.js --strict && node scripts/find-null-json-files.js --json',
      adminRoute: '/api/admin/production/readiness',
      reason: 'آخر Benchmark احتوى على أخطاء قراءة/JSON. أصلح سلامة الملفات قبل أي قرار externalization.',
    });
  }

  if ((benchmarkEvidence.latestCriticalCount || 0) > 0) {
    actions.push({
      id: 'review_critical_benchmark_paths',
      label: 'مراجعة مسارات Benchmark الحرجة',
      severity: 'warning',
      command: 'node scripts/benchmark-file-paths.js --json --persist',
      adminRoute: '/api/admin/benchmarks/history',
      reason: 'آخر Benchmark يحتوي p95 critical. هذا يطلب قياسًا متكررًا وتحليل السبب قبل أي rehearsal.',
    });
  }

  const needsRehearsal = (report.candidates || []).some(c => c.status === 'rehearsal_required');
  if (needsRehearsal) {
    actions.push({
      id: 'run_migration_rehearsal',
      label: 'تشغيل تدريب الهجرة',
      severity: 'warning',
      command: 'node scripts/run-migration-rehearsal.js --dry-run --json',
      adminRoute: '/api/admin/migration-rehearsal/run',
      reason: 'يوجد candidate يحتاج rehearsal قبل أي pilot.',
    });
  }

  actions.push({
    id: 'weekly_ops_review',
    label: 'تحديث مراجعة التشغيل الأسبوعية',
    severity: 'info',
    command: 'node scripts/ops-weekly-review.js --persist',
    adminRoute: '/api/admin/ops/reviews',
    reason: 'قرارات Phase 60 يجب أن تُوثق داخل governance workflow.',
  });

  return actions;
}

async function loadPressureSnapshots(limit = 30) {
  try {
    const dir = getCollectionPath('storage_pressure');
    const rows = await listJSON(dir);
    return rows
      .filter(r => r && (r.id || r.timestamp))
      .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
      .slice(0, limit);
  } catch (_) {
    return [];
  }
}

async function loadBenchmarkSnapshots(limit = 30) {
  try {
    const { listBenchmarkResults } = await import('./benchmarkHistory.js');
    const result = await listBenchmarkResults({ limit, offset: 0 });
    return result.benchmarks || [];
  } catch (_) {
    return [];
  }
}

export async function getExternalizationDecisionReport(options = {}) {
  if (!isEnabled()) {
    return {
      enabled: false,
      phase: 60,
      implementationAllowed: false,
      status: 'deferred',
    };
  }

  const pressureSnapshots = options.pressureSnapshots || await loadPressureSnapshots(options.limit || 30);
  const benchmarkSnapshots = options.benchmarks || await loadBenchmarkSnapshots(options.limit || 30);

  let readiness = null;
  try {
    const { getExternalizationReadiness } = await import('./externalizationReadiness.js');
    readiness = await getExternalizationReadiness({ loadPressure: true });
  } catch (_) {
    readiness = { enabled: false, candidates: [] };
  }

  const pressureEvidence = evaluateRepeatedPressureEvidence(pressureSnapshots, options);
  const benchmarkEvidence = evaluateBenchmarkEvidence(benchmarkSnapshots, options);
  const latestBenchmark = benchmarkSnapshots && benchmarkSnapshots[0] ? benchmarkSnapshots[0] : null;
  const latestBenchmarkStatus = latestBenchmark ? latestBenchmark.status : 'missing';
  const latestBenchmarkErrorCount = latestBenchmark?.summary?.errorCount || 0;
  const latestBenchmarkCriticalCount = latestBenchmark?.summary?.criticalCount || 0;

  const evidence = {
    pressure: pressureEvidence,
    benchmarks: {
      ...benchmarkEvidence,
      latestStatus: latestBenchmarkStatus,
      latestErrorCount: latestBenchmarkErrorCount,
      latestCriticalCount: latestBenchmarkCriticalCount,
      latestId: latestBenchmark ? latestBenchmark.id : null,
    },
    readiness: readiness ? {
      enabled: !!readiness.enabled,
      pressureSnapshot: readiness.pressureSnapshot || null,
    } : null,
  };

  const candidates = buildCandidateDecisionRows(evidence, readiness, options);

  let status = 'no_action';
  if (candidates.some(c => c.status === 'pilot_candidate')) status = 'pilot_candidate';
  else if (candidates.some(c => c.status === 'rehearsal_required')) status = 'rehearsal_required';
  else if (candidates.some(c => c.status === 'mitigate_file_based')) status = 'mitigate_file_based';
  else if (candidates.some(c => c.status === 'monitor')) status = 'monitor';

  // Phase 60 guardrail:
  // benchmark errors/criticals should ask for diagnosis or mitigation, not migration.
  if (status === 'no_action' && (latestBenchmarkErrorCount > 0 || latestBenchmarkCriticalCount > 0)) {
    status = 'monitor';
  }

  const report = {
    enabled: true,
    phase: 60,
    advisoryOnly: true,
    implementationAllowed: false,
    status: normalizeStatus(status),
    generatedAt: nowIso(),
    evidence,
    candidates,
    recommendations: [],
    requiredApprovals: status === 'pilot_candidate'
      ? ['admin approval', 'rollback rehearsal', 'privacy review', 'production readiness review']
      : [],
    guardrails: [
      'لا يوجد نقل تلقائي في Phase 60.',
      'تحذير واحد لا يبرر PostgreSQL أو external queue أو external search.',
      'Repeated critical evidence يمكن أن يوصي بتدريب الهجرة، وليس migration مباشر.',
      'file-backed source of truth يبقى محفوظًا حتى وجود موافقة صريحة.',
    ],
  };

  report.recommendations = buildPhase60RecommendedActions(report);
  return report;
}

export async function captureExternalizationDecisionSnapshot(options = {}) {
  const report = await getExternalizationDecisionReport(options);

  if (!isEnabled()) return { ok: false, disabled: true, report };

  const id = options.id || generateId();
  const record = {
    id,
    kind: 'externalization_decision',
    version: '0.56.0',
    ...report,
    createdAt: nowIso(),
  };

  await atomicWrite(decisionPath(id), record);
  return { ok: true, decision: record };
}

export async function listExternalizationDecisionSnapshots(options = {}) {
  if (!isEnabled()) return { decisions: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('externalization_decisions');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('edc_'));
  rows.sort((a, b) => new Date(b.createdAt || b.generatedAt) - new Date(a.createdAt || a.generatedAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    decisions: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function cleanupOldExternalizationDecisionSnapshots() {
  const retentionDays = config.EXTERNALIZATION_DECISION?.evidenceWindowDays || 30;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = await listExternalizationDecisionSnapshots({ limit: 100000, offset: 0 });

  let cleaned = 0;
  for (const row of result.decisions || []) {
    const ts = new Date(row.createdAt || row.generatedAt || 0).getTime();
    if (Number.isFinite(ts) && ts > 0 && ts < cutoffMs) {
      await deleteJSON(decisionPath(row.id)).catch(() => {});
      cleaned++;
    }
  }
  return cleaned;
}

export const _testHelpers = {
  generateId,
  decisionPath,
  normalizeStatus,
};
