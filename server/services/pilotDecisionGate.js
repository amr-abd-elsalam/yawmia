// ═══════════════════════════════════════════════════════════════
// server/services/pilotDecisionGate.js — Phase 61 Pilot Decision Gate
// ═══════════════════════════════════════════════════════════════
// Advisory only. Blocks implementation by default.
// No external implementation.
// No connection strings.
// No runtime repository switch.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';

function isEnabled() {
  return !!(config.PHASE61_PILOT_GATE && config.PHASE61_PILOT_GATE.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'pgate_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function gatePath(id) {
  return getRecordPath('pilot_decisions', id);
}

function parseMs(iso) {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function blocker(code, message, recommendation = null) {
  const out = { code, message };
  if (recommendation) out.recommendation = recommendation;
  return out;
}

function requirement(id, label, passed, details = {}) {
  return { id, label, passed: !!passed, details };
}

function candidateStatusFromDecision(decision, candidate) {
  const rows = Array.isArray(decision?.candidates) ? decision.candidates : [];
  const row = rows.find(c => c.candidate === candidate);
  return row ? row.status : null;
}

function candidateReasonsFromDecision(decision, candidate) {
  const rows = Array.isArray(decision?.candidates) ? decision.candidates : [];
  const row = rows.find(c => c.candidate === candidate);
  return row && Array.isArray(row.reasons) ? row.reasons : [];
}

function chooseCandidate(decision, requestedCandidate) {
  if (requestedCandidate) return requestedCandidate;

  const rows = Array.isArray(decision?.candidates) ? decision.candidates : [];
  const priority = rows.filter(c => ['pilot_candidate', 'rehearsal_required'].includes(c.status));

  if (priority.length === 1) return priority[0].candidate;
  return null;
}

async function getLatestExternalizationDecision() {
  try {
    const { getExternalizationDecisionReport } = await import('./externalizationDecision.js');
    return await getExternalizationDecisionReport({ allowPilotCandidate: false });
  } catch (err) {
    return {
      enabled: false,
      status: 'unknown',
      error: err.message,
      candidates: [],
    };
  }
}

async function getLatestMigrationRehearsal() {
  try {
    const rows = await listJSON(getCollectionPath('migration_rehearsals'));
    const rehearsals = rows.filter(r => r && (r.id || r.generatedAt || r.createdAt));
    rehearsals.sort((a, b) => parseMs(b.generatedAt || b.createdAt) - parseMs(a.generatedAt || a.createdAt));
    return rehearsals[0] || null;
  } catch (_) {
    return null;
  }
}

async function getLatestRollbackRehearsal() {
  try {
    const { getLatestRollbackRehearsal } = await import('./rollbackRehearsal.js');
    return await getLatestRollbackRehearsal();
  } catch (_) {
    return null;
  }
}

async function getRestoreDrillFreshness() {
  try {
    const { getLatestRestoreDrillFreshness } = await import('./backupRestoreDrill.js');
    return await getLatestRestoreDrillFreshness({
      thresholdDays: config.PHASE61_PILOT_GATE?.restoreDrillMaxAgeDays || 7,
    });
  } catch (err) {
    return {
      enabled: true,
      latest: null,
      fresh: false,
      passed: false,
      status: 'unknown',
      error: err.message,
    };
  }
}

async function getAdminApproval(candidate, approvalId) {
  try {
    const { getApproval, listApprovals } = await import('./adminApprovals.js');

    if (approvalId) return await getApproval(approvalId);

    const result = await listApprovals({
      status: 'approved',
      action: config.PHASE61_PILOT_GATE?.approvalAction || 'externalization_pilot',
      targetId: candidate || undefined,
      limit: 50,
      offset: 0,
    });

    const approvals = result.approvals || [];
    return approvals[0] || null;
  } catch (_) {
    return null;
  }
}

async function getPrivacyReview(candidate) {
  try {
    const { listReviewRecords } = await import('./opsReviewRecords.js');

    const result = await listReviewRecords({
      type: config.PHASE61_PILOT_GATE?.privacyReviewType || 'privacy_review',
      status: 'completed',
      limit: 100,
      offset: 0,
    });

    const reviews = result.reviews || [];

    if (!candidate) return reviews[0] || null;

    return reviews.find(r => {
      const refs = r.refs || {};
      const haystack = JSON.stringify({
        title: r.title || '',
        summary: r.summary || '',
        refs,
      });
      return refs.candidate === candidate || haystack.includes(candidate);
    }) || null;
  } catch (_) {
    return null;
  }
}

async function hasCriticalOpenIncidents() {
  try {
    const { listIncidents } = await import('./incidentTimeline.js');
    const result = await listIncidents({ status: 'open', limit: 100, offset: 0 });
    const incidents = result.incidents || [];
    return incidents.some(i => i.severity === 'critical' || i.severity === 'high');
  } catch (_) {
    // Fail closed for pilot gate.
    return true;
  }
}

async function hasOverdueCriticalPostmortemActions() {
  try {
    const { listPostmortems } = await import('./postmortemRecords.js');
    const result = await listPostmortems({ limit: 100, offset: 0 });
    const rows = result.postmortems || [];
    const now = Date.now();

    for (const pm of rows) {
      if (pm.severity !== 'critical' && pm.severity !== 'high') continue;
      const items = Array.isArray(pm.actionItems) ? pm.actionItems : [];
      for (const item of items) {
        if (item.status === 'done' || item.status === 'cancelled') continue;
        if (item.dueDate && new Date(item.dueDate).getTime() < now) {
          return true;
        }
      }
    }

    return false;
  } catch (_) {
    // Fail closed for pilot gate.
    return true;
  }
}

/**
 * Pure-ish evaluator. Does not read disk.
 */
export function evaluatePilotBlockers(inputs = {}, options = {}) {
  const cfg = config.PHASE61_PILOT_GATE || {};
  const blockers = [];
  const requirements = [];

  const candidate = inputs.candidate || null;
  const decision = inputs.externalizationDecision || null;
  const migrationRehearsal = inputs.migrationRehearsal || null;
  const rollbackRehearsal = inputs.rollbackRehearsal || null;
  const restoreDrill = inputs.restoreDrill || null;
  const approval = inputs.approval || null;
  const privacyReview = inputs.privacyReview || null;

  const candidateCount = Array.isArray(inputs.selectedCandidates)
    ? inputs.selectedCandidates.length
    : (candidate ? 1 : 0);

  requirements.push(requirement(
    'bounded_candidate_selected',
    'تم تحديد candidate واحد محدود',
    !!candidate,
    { candidate }
  ));

  if (!candidate) {
    blockers.push(blocker(
      'CANDIDATE_REQUIRED',
      'لا يوجد candidate محدود ومحدد للـ Pilot.',
      'حدد candidate واحد فقط مثل ops_queue أو audit/search.'
    ));
  }

  const oneCandidateMax = candidateCount <= (cfg.maxPilotCandidatesAtOnce || 1);
  requirements.push(requirement(
    'one_candidate_max',
    'Candidate واحد فقط',
    oneCandidateMax,
    { candidateCount, max: cfg.maxPilotCandidatesAtOnce || 1 }
  ));

  if (!oneCandidateMax) {
    blockers.push(blocker(
      'TOO_MANY_CANDIDATES',
      'لا يمكن تشغيل أكثر من Pilot candidate واحد في نفس الوقت.'
    ));
  }

  const cStatus = candidate ? candidateStatusFromDecision(decision, candidate) : null;
  const cReasons = candidate ? candidateReasonsFromDecision(decision, candidate) : [];

  const repeatedEvidenceOk = !!(
    candidate &&
    decision &&
    ['rehearsal_required', 'pilot_candidate'].includes(cStatus) &&
    cReasons.some(r => /repeated|critical|benchmark/i.test(String(r)))
  );

  requirements.push(requirement(
    'repeated_evidence',
    'دليل متكرر وليس warning واحد',
    !cfg.requireRepeatedEvidence || repeatedEvidenceOk,
    { decisionStatus: decision?.status || null, candidateStatus: cStatus, reasons: cReasons }
  ));

  if (cfg.requireRepeatedEvidence && !repeatedEvidenceOk) {
    blockers.push(blocker(
      'REPEATED_EVIDENCE_REQUIRED',
      'Pilot يحتاج evidence متكرر. تحذير واحد لا يكفي.',
      'node scripts/capture-phase61-evidence.js --persist'
    ));
  }

  const migrationOk = !!(
    migrationRehearsal &&
    (migrationRehearsal.status === 'passed' || migrationRehearsal.ok === true) &&
    migrationRehearsal.sourceDataMutated === false &&
    migrationRehearsal.externalDbConnected === false
  );

  requirements.push(requirement(
    'migration_rehearsal_passed',
    'Migration rehearsal passed وآمن',
    !cfg.requireMigrationRehearsalPassed || migrationOk,
    {
      status: migrationRehearsal?.status || null,
      sourceDataMutated: migrationRehearsal?.sourceDataMutated,
      externalDbConnected: migrationRehearsal?.externalDbConnected,
    }
  ));

  if (cfg.requireMigrationRehearsalPassed && !migrationOk) {
    blockers.push(blocker(
      'MIGRATION_REHEARSAL_REQUIRED',
      'Migration rehearsal لازم ينجح قبل أي Pilot.',
      'node scripts/run-migration-rehearsal.js --snapshot=./migration-snapshots/test --dry-run --json'
    ));
  }

  const rollbackOk = !!(
    rollbackRehearsal &&
    (rollbackRehearsal.status === 'passed' || rollbackRehearsal.ok === true) &&
    rollbackRehearsal.sourceDataMutated === false &&
    rollbackRehearsal.externalDbConnected === false
  );

  requirements.push(requirement(
    'rollback_rehearsal_passed',
    'Rollback rehearsal passed',
    !cfg.requireRollbackRehearsalPassed || rollbackOk,
    {
      status: rollbackRehearsal?.status || null,
      sourceDataMutated: rollbackRehearsal?.sourceDataMutated,
      externalDbConnected: rollbackRehearsal?.externalDbConnected,
    }
  ));

  if (cfg.requireRollbackRehearsalPassed && !rollbackOk) {
    blockers.push(blocker(
      'ROLLBACK_REHEARSAL_REQUIRED',
      'تدريب الرجوع لازم ينجح قبل أي Pilot.',
      'node scripts/run-rollback-rehearsal.js --dry-run --json'
    ));
  }

  const restoreOk = !!(restoreDrill && restoreDrill.fresh && restoreDrill.passed);

  requirements.push(requirement(
    'fresh_restore_drill',
    'Restore drill fresh وناجح',
    !cfg.requireFreshRestoreDrill || restoreOk,
    restoreDrill || {}
  ));

  if (cfg.requireFreshRestoreDrill && !restoreOk) {
    blockers.push(blocker(
      'RESTORE_DRILL_REQUIRED',
      'Restore drill حديث وناجح مطلوب قبل Pilot.',
      'node scripts/run-backup-restore-drill.js'
    ));
  }

  const approvalOk = !!(approval && approval.status === 'approved');

  requirements.push(requirement(
    'admin_approval',
    'Admin approval معتمد',
    !cfg.requireAdminApproval || approvalOk,
    { approvalId: approval?.id || null, status: approval?.status || null }
  ));

  if (cfg.requireAdminApproval && !approvalOk) {
    blockers.push(blocker(
      'ADMIN_APPROVAL_REQUIRED',
      'Admin approval مطلوب قبل Pilot.',
      'POST /api/admin/approvals'
    ));
  }

  const privacyOk = !!(privacyReview && privacyReview.status === 'completed');

  requirements.push(requirement(
    'privacy_review',
    'Privacy review مكتمل',
    !cfg.requirePrivacyReview || privacyOk,
    { reviewId: privacyReview?.id || null, status: privacyReview?.status || null }
  ));

  if (cfg.requirePrivacyReview && !privacyOk) {
    blockers.push(blocker(
      'PRIVACY_REVIEW_REQUIRED',
      'Privacy review مكتمل مطلوب قبل Pilot.',
      'node scripts/ops-weekly-review.js --persist'
    ));
  }

  requirements.push(requirement(
    'no_critical_open_incidents',
    'لا توجد critical/high open incidents',
    !cfg.requireNoCriticalOpenIncidents || inputs.hasCriticalOpenIncidents === false,
    { hasCriticalOpenIncidents: !!inputs.hasCriticalOpenIncidents }
  ));

  if (cfg.requireNoCriticalOpenIncidents && inputs.hasCriticalOpenIncidents) {
    blockers.push(blocker(
      'CRITICAL_OPEN_INCIDENTS',
      'يوجد critical/high incident مفتوح. Pilot ممنوع حتى الحل.'
    ));
  }

  requirements.push(requirement(
    'no_overdue_critical_postmortem_actions',
    'لا توجد action items حرجة متأخرة',
    !cfg.requireNoOverdueCriticalPostmortemActions || inputs.hasOverdueCriticalPostmortemActions === false,
    { hasOverdueCriticalPostmortemActions: !!inputs.hasOverdueCriticalPostmortemActions }
  ));

  if (cfg.requireNoOverdueCriticalPostmortemActions && inputs.hasOverdueCriticalPostmortemActions) {
    blockers.push(blocker(
      'OVERDUE_CRITICAL_POSTMORTEM_ACTIONS',
      'يوجد postmortem action items حرجة متأخرة.'
    ));
  }

  const pilotAllowed = blockers.length === 0;

  return {
    pilotAllowed,
    implementationAllowed: false,
    blockers,
    requirements,
  };
}

export function buildPilotGateRecommendations(gate) {
  const recommendations = [];

  for (const b of gate.blockers || []) {
    recommendations.push({
      id: b.code,
      label: labelForBlocker(b.code),
      severity: 'critical',
      command: b.recommendation || null,
      adminRoute: '/api/admin/phase61/pilot-gate',
      reason: b.message,
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'pilot_gate_monitor',
      label: 'Pilot gate لا يزال advisory',
      severity: 'info',
      command: null,
      adminRoute: '/api/admin/phase61/pilot-gate',
      reason: 'حتى عند إزالة blockers، implementationAllowed يبقى false بدون طلب صريح.',
    });
  }

  return recommendations;
}

function labelForBlocker(code) {
  const map = {
    CANDIDATE_REQUIRED: 'حدد Pilot candidate واحد',
    TOO_MANY_CANDIDATES: 'قلل pilot candidates إلى واحد',
    REPEATED_EVIDENCE_REQUIRED: 'اجمع evidence متكرر',
    MIGRATION_REHEARSAL_REQUIRED: 'شغّل Migration Rehearsal',
    ROLLBACK_REHEARSAL_REQUIRED: 'شغّل Rollback Rehearsal',
    RESTORE_DRILL_REQUIRED: 'شغّل Restore Drill',
    ADMIN_APPROVAL_REQUIRED: 'أنشئ/اعتمد Admin Approval',
    PRIVACY_REVIEW_REQUIRED: 'أكمل Privacy Review',
    CRITICAL_OPEN_INCIDENTS: 'حل الحوادث الحرجة المفتوحة',
    OVERDUE_CRITICAL_POSTMORTEM_ACTIONS: 'أغلق action items المتأخرة',
  };
  return map[code] || 'راجع blocker';
}

export async function getPilotDecisionGate(options = {}) {
  if (!isEnabled()) {
    return {
      enabled: false,
      phase: 61,
      implementationAllowed: false,
      pilotAllowed: false,
      candidate: null,
      blockers: [],
      requirements: [],
      evidence: {},
      recommendations: [],
    };
  }

  const decision = await getLatestExternalizationDecision();
  const candidate = chooseCandidate(decision, options.candidate || null);
  const selectedCandidates = candidate ? [candidate] : [];

  const [
    migrationRehearsal,
    rollbackRehearsal,
    restoreDrill,
    approval,
    privacyReview,
    criticalOpen,
    overduePostmortem,
  ] = await Promise.all([
    getLatestMigrationRehearsal(),
    getLatestRollbackRehearsal(),
    getRestoreDrillFreshness(),
    getAdminApproval(candidate, options.approvalId || null),
    getPrivacyReview(candidate),
    hasCriticalOpenIncidents(),
    hasOverdueCriticalPostmortemActions(),
  ]);

  const inputs = {
    candidate,
    selectedCandidates,
    externalizationDecision: decision,
    migrationRehearsal,
    rollbackRehearsal,
    restoreDrill,
    approval,
    privacyReview,
    hasCriticalOpenIncidents: criticalOpen,
    hasOverdueCriticalPostmortemActions: overduePostmortem,
  };

  const evaluation = evaluatePilotBlockers(inputs, options);

  const gate = {
    enabled: true,
    phase: 61,
    advisoryOnly: true,
    implementationAllowed: false,
    pilotAllowed: evaluation.pilotAllowed,
    status: evaluation.pilotAllowed ? 'approval_required' : 'blocked',
    candidate,
    generatedAt: nowIso(),
    blockers: evaluation.blockers,
    requirements: evaluation.requirements,
    evidence: {
      externalizationDecision: decision ? {
        status: decision.status || null,
        generatedAt: decision.generatedAt || null,
      } : null,
      migrationRehearsal: migrationRehearsal ? {
        id: migrationRehearsal.id || null,
        status: migrationRehearsal.status || null,
        generatedAt: migrationRehearsal.generatedAt || migrationRehearsal.createdAt || null,
      } : null,
      rollbackRehearsal: rollbackRehearsal ? {
        id: rollbackRehearsal.id,
        status: rollbackRehearsal.status,
        generatedAt: rollbackRehearsal.generatedAt || rollbackRehearsal.createdAt,
      } : null,
      restoreDrill,
      approval: approval ? {
        id: approval.id,
        status: approval.status,
        action: approval.action,
        targetId: approval.targetId,
        expiresAt: approval.expiresAt,
      } : null,
      privacyReview: privacyReview ? {
        id: privacyReview.id,
        status: privacyReview.status,
        type: privacyReview.type,
        completedAt: privacyReview.completedAt || null,
      } : null,
    },
    recommendations: [],
    whyNotPilotYet: evaluation.blockers.map(b => b.message),
  };

  gate.recommendations = buildPilotGateRecommendations(gate);
  return gate;
}

export async function capturePilotDecisionSnapshot(options = {}) {
  const gate = await getPilotDecisionGate(options);

  if (!isEnabled()) return { ok: false, disabled: true, gate };

  const id = options.id || generateId();
  const record = {
    id,
    kind: 'pilot_decision_gate',
    version: '0.57.0',
    ...gate,
    createdAt: nowIso(),
  };

  await atomicWrite(gatePath(id), record);
  return { ok: true, gate: record };
}

export async function listPilotDecisionSnapshots(options = {}) {
  if (!isEnabled()) return { gates: [], total: 0, limit: 20, offset: 0 };

  const rows = await listJSON(getCollectionPath('pilot_decisions')).catch(() => []);
  let gates = rows.filter(r => r && r.id && r.id.startsWith('pgate_'));

  gates.sort((a, b) => parseMs(b.createdAt || b.generatedAt) - parseMs(a.createdAt || a.generatedAt));

  const total = gates.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    gates: gates.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export const _testHelpers = {
  generateId,
  gatePath,
  chooseCandidate,
  candidateStatusFromDecision,
  candidateReasonsFromDecision,
};
