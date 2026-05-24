// ═══════════════════════════════════════════════════════════════
// server/handlers/externalizationDecisionHandler.js — Phase 60 Admin APIs
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

export async function handleGetExternalizationDecision(req, res) {
  try {
    const { getExternalizationDecisionReport } = await import('../services/externalizationDecision.js');
    const report = await getExternalizationDecisionReport({
      allowPilotCandidate: false,
    });

    return sendJSON(res, 200, {
      ok: true,
      decision: report,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب قرار Phase 60',
      code: 'EXTERNALIZATION_DECISION_ERROR',
    });
  }
}

export async function handleCaptureExternalizationDecision(req, res) {
  try {
    const { captureExternalizationDecisionSnapshot } = await import('../services/externalizationDecision.js');

    const result = await captureExternalizationDecisionSnapshot({
      allowPilotCandidate: false,
    });

    if (!result.ok) {
      return sendJSON(res, 503, {
        error: 'خدمة قرار النقل غير مفعلة',
        code: 'EXTERNALIZATION_DECISION_DISABLED',
      });
    }

    audit(req, 'externalization_decision_captured', 'externalization_decision', result.decision.id, {
      status: result.decision.status,
      implementationAllowed: result.decision.implementationAllowed,
      candidateCount: Array.isArray(result.decision.candidates) ? result.decision.candidates.length : 0,
    });

    return sendJSON(res, 201, {
      ok: true,
      decision: result.decision,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في حفظ قرار Phase 60',
      code: 'EXTERNALIZATION_DECISION_CAPTURE_ERROR',
    });
  }
}

export async function handleListExternalizationDecisionSnapshots(req, res) {
  try {
    const { listExternalizationDecisionSnapshots } = await import('../services/externalizationDecision.js');

    const result = await listExternalizationDecisionSnapshots({
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, {
      ok: true,
      ...result,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل قرارات Phase 60',
      code: 'EXTERNALIZATION_DECISION_LIST_ERROR',
    });
  }
}

export async function handleValidateMigrationSnapshot(req, res) {
  try {
    const { validateMigrationSnapshot } = await import('../services/migrationSnapshotValidation.js');

    const body = req.body || {};
    const snapshotPath = body.snapshotPath || body.snapshot || req.query.snapshot;

    if (!snapshotPath || typeof snapshotPath !== 'string') {
      return sendJSON(res, 400, {
        error: 'snapshotPath مطلوب',
        code: 'SNAPSHOT_PATH_REQUIRED',
      });
    }

    const report = await validateMigrationSnapshot(snapshotPath, {
      strict: req.query.strict === '1' || req.query.strict === 'true' || body.strict === true,
    });

    audit(req, 'migration_snapshot_validated', 'migration_snapshot', snapshotPath, {
      status: report.status,
      errorCount: report.errors.length,
      warningCount: report.warnings.length,
    });

    return sendJSON(res, report.ok ? 200 : 400, {
      ok: report.ok,
      validation: report,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحقق migration snapshot',
      code: 'MIGRATION_SNAPSHOT_VALIDATE_ERROR',
    });
  }
}

export async function handleRunMigrationRehearsal(req, res) {
  try {
    const body = req.body || {};
    const snapshotPath = body.snapshotPath || body.snapshot || req.query.snapshot;

    if (!snapshotPath) {
      return sendJSON(res, 400, {
        error: 'Phase 60 rehearsal يحتاج snapshotPath في هذه الدفعة. استخدم export-migration-snapshot أولاً.',
        code: 'SNAPSHOT_PATH_REQUIRED',
      });
    }

    const { validateMigrationSnapshot } = await import('../services/migrationSnapshotValidation.js');
    const validation = await validateMigrationSnapshot(snapshotPath, {
      strict: body.strict === true || req.query.strict === '1' || req.query.strict === 'true',
    });

    const report = {
      ok: validation.ok,
      status: validation.ok ? (validation.warnings.length > 0 ? 'warning' : 'passed') : 'failed',
      phase: 60,
      rehearsalType: 'validation_only',
      sourceDataMutated: false,
      externalDbConnected: false,
      snapshotPath,
      validation,
      generatedAt: new Date().toISOString(),
      notes: [
        'هذه الدفعة تنفذ rehearsal آمن قائم على validation فقط.',
        'لا يوجد اتصال بأي DB خارجي.',
        'لا يتم تعديل source data.',
      ],
    };

    audit(req, 'migration_rehearsal_run', 'migration_rehearsal', snapshotPath, {
      status: report.status,
      validationStatus: validation.status,
    });

    return sendJSON(res, validation.ok ? 200 : 400, {
      ok: validation.ok,
      rehearsal: report,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تشغيل تدريب الهجرة',
      code: 'MIGRATION_REHEARSAL_ERROR',
    });
  }
}

export async function handleBenchmarkHistory(req, res) {
  try {
    const { listBenchmarkResults, getLatestBenchmarkResult } = await import('../services/benchmarkHistory.js');

    const [list, latest] = await Promise.all([
      listBenchmarkResults({
        status: req.query.status || undefined,
        limit: parseInt(req.query.limit) || 20,
        offset: parseInt(req.query.offset) || 0,
      }),
      getLatestBenchmarkResult(),
    ]);

    return sendJSON(res, 200, {
      ok: true,
      latest,
      ...list,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب سجل Benchmarks',
      code: 'BENCHMARK_HISTORY_ERROR',
    });
  }
}
