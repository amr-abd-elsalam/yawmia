// ═══════════════════════════════════════════════════════════════
// server/handlers/phase61Handler.js — Phase 61 Admin APIs
// ═══════════════════════════════════════════════════════════════
// Evidence cadence, pilot gate, rollback rehearsal,
// and repository contract readiness.
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

function parseBool(value) {
  return value === true || value === '1' || value === 'true';
}

export async function handleGetPhase61Evidence(req, res) {
  try {
    const { getEvidenceCadenceStatus } = await import('../services/phase61EvidenceCadence.js');
    const evidence = await getEvidenceCadenceStatus();
    return sendJSON(res, 200, { ok: true, evidence });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب إيقاع الأدلة Phase 61',
      code: 'PHASE61_EVIDENCE_ERROR',
    });
  }
}

export async function handleCapturePhase61Evidence(req, res) {
  try {
    const { captureEvidenceCadenceSnapshot } = await import('../services/phase61EvidenceCadence.js');
    const result = await captureEvidenceCadenceSnapshot();

    if (!result.ok) {
      return sendJSON(res, 503, {
        error: 'Phase 61 Evidence Cadence غير مفعّل',
        code: 'PHASE61_EVIDENCE_DISABLED',
      });
    }

    audit(req, 'phase61_evidence_captured', 'phase61_evidence', result.evidence.id, {
      status: result.evidence.status,
      warningCount: result.evidence.warnings?.length || 0,
      blockerCount: result.evidence.blockers?.length || 0,
    });

    return sendJSON(res, 201, { ok: true, evidence: result.evidence });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حفظ لقطة Evidence Cadence',
      code: 'PHASE61_EVIDENCE_CAPTURE_ERROR',
    });
  }
}

export async function handleListPhase61EvidenceSnapshots(req, res) {
  try {
    const { listEvidenceCadenceSnapshots } = await import('../services/phase61EvidenceCadence.js');
    const result = await listEvidenceCadenceSnapshots({
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });
    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل Evidence Cadence',
      code: 'PHASE61_EVIDENCE_LIST_ERROR',
    });
  }
}

export async function handleGetPilotDecisionGate(req, res) {
  try {
    const { getPilotDecisionGate } = await import('../services/pilotDecisionGate.js');
    const gate = await getPilotDecisionGate({
      candidate: req.query.candidate || undefined,
      approvalId: req.query.approvalId || undefined,
    });
    return sendJSON(res, 200, { ok: true, gate });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب بوابة Pilot',
      code: 'PILOT_GATE_ERROR',
    });
  }
}

export async function handleCapturePilotDecisionGate(req, res) {
  try {
    const { capturePilotDecisionSnapshot } = await import('../services/pilotDecisionGate.js');
    const body = req.body || {};

    const result = await capturePilotDecisionSnapshot({
      candidate: body.candidate || req.query.candidate || undefined,
      approvalId: body.approvalId || req.query.approvalId || undefined,
    });

    if (!result.ok) {
      return sendJSON(res, 503, {
        error: 'Pilot Gate غير مفعّل',
        code: 'PILOT_GATE_DISABLED',
      });
    }

    audit(req, 'phase61_pilot_gate_captured', 'pilot_gate', result.gate.id, {
      candidate: result.gate.candidate,
      pilotAllowed: result.gate.pilotAllowed,
      blockerCount: result.gate.blockers?.length || 0,
    });

    return sendJSON(res, 201, { ok: true, gate: result.gate });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حفظ بوابة Pilot',
      code: 'PILOT_GATE_CAPTURE_ERROR',
    });
  }
}

export async function handleRunRollbackRehearsal(req, res) {
  try {
    const { runRollbackRehearsal } = await import('../services/rollbackRehearsal.js');
    const body = req.body || {};

    const result = await runRollbackRehearsal({
      backupReference: body.backupReference || undefined,
      snapshotReference: body.snapshotReference || undefined,
      dryRun: parseBool(body.dryRun) || parseBool(req.query.dryRun),
      persist: body.persist === false ? false : true,
      confirm: parseBool(body.confirm) || parseBool(req.query.confirm),
    });

    if (!result.rehearsal) {
      return sendJSON(res, 503, {
        error: 'Rollback rehearsal غير مفعّل',
        code: 'ROLLBACK_REHEARSAL_DISABLED',
      });
    }

    audit(req, 'rollback_rehearsal_run', 'rollback_rehearsal', result.rehearsal.id, {
      status: result.rehearsal.status,
      blockerCount: result.rehearsal.blockers?.length || 0,
      sourceDataMutated: result.rehearsal.sourceDataMutated,
      externalDbConnected: result.rehearsal.externalDbConnected,
    });

    return sendJSON(res, result.ok ? 200 : 400, {
      ok: result.ok,
      rehearsal: result.rehearsal,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل تدريب الرجوع',
      code: 'ROLLBACK_REHEARSAL_ERROR',
    });
  }
}

export async function handleListRollbackRehearsals(req, res) {
  try {
    const { listRollbackRehearsals, getLatestRollbackRehearsal } = await import('../services/rollbackRehearsal.js');
    const [list, latest] = await Promise.all([
      listRollbackRehearsals({
        status: req.query.status || undefined,
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0,
      }),
      getLatestRollbackRehearsal(),
    ]);

    return sendJSON(res, 200, { ok: true, latest, ...list });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل تدريبات الرجوع',
      code: 'ROLLBACK_REHEARSAL_LIST_ERROR',
    });
  }
}

export async function handleGetRollbackRehearsal(req, res) {
  try {
    const { getRollbackRehearsal } = await import('../services/rollbackRehearsal.js');
    const rehearsal = await getRollbackRehearsal(req.params.id);

    if (!rehearsal) {
      return sendJSON(res, 404, {
        error: 'تدريب الرجوع غير موجود',
        code: 'ROLLBACK_REHEARSAL_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, rehearsal });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب تدريب الرجوع',
      code: 'ROLLBACK_REHEARSAL_GET_ERROR',
    });
  }
}

export async function handleRepositoryContracts(req, res) {
  try {
    const { getRepositoryContractReadiness } = await import('../services/repositoryContractReport.js');
    const report = await getRepositoryContractReadiness();
    return sendJSON(res, 200, { ok: true, repositoryContracts: report });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب عقود Repository',
      code: 'REPOSITORY_CONTRACTS_ERROR',
    });
  }
}
