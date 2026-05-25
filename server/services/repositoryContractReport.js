// ═══════════════════════════════════════════════════════════════
// server/services/repositoryContractReport.js — Phase 61 Repository Contracts
// ═══════════════════════════════════════════════════════════════
// Static/read-only contract readiness.
// Docs/tests only.
// No runtime switch.
// No external adapter.
// ═══════════════════════════════════════════════════════════════

import { access, constants } from 'node:fs/promises';
import config from '../../config.js';

function isEnabled() {
  return !!(config.REPOSITORY_CONTRACTS && config.REPOSITORY_CONTRACTS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

export function getRepositoryContractMatrix() {
  const runtimeSwitchEnabled = !!(config.REPOSITORY_CONTRACTS && config.REPOSITORY_CONTRACTS.runtimeSwitchEnabled);

  return {
    enabled: isEnabled(),
    phase: 61,
    docsOnly: config.REPOSITORY_CONTRACTS?.docsOnly !== false,
    runtimeSwitchEnabled,
    fileBackedSourceOfTruth: true,
    externalAdapterImplemented: false,
    candidates: [
      {
        name: 'UserRepository',
        collections: ['users', 'sessions'],
        requiredOperations: ['findById', 'findByPhone', 'create', 'update', 'softDelete', 'anonymize', 'exportUserData'],
        guarantees: ['phone index consistency', 'no raw session token export', 'anonymization idempotent'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'JobRepository',
        collections: ['jobs'],
        requiredOperations: ['create', 'findById', 'list', 'updateStatus', 'renew', 'duplicate'],
        guarantees: ['monthly shard read compatibility', 'query index repairability', 'lifecycle status preservation'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'ApplicationRepository',
        collections: ['applications'],
        requiredOperations: ['apply', 'accept', 'reject', 'withdraw', 'listByJob', 'listByWorker'],
        guarantees: ['worker/job set indexes', 'accepted-equivalent semantics', 'no over-acceptance'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'PaymentRepository',
        collections: ['payments'],
        requiredOperations: ['createPayment', 'confirmPayment', 'completePayment', 'disputePayment', 'listByJob'],
        guarantees: ['financial audit preservation', 'no blind deletion', 'dispute history retention'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'WorkroomRepository',
        collections: ['messages', 'workrooms', 'workroom_receipts', 'workroom_pins', 'workroom_checklists'],
        requiredOperations: ['listWorkrooms', 'sendMessage', 'markRead', 'search', 'pin', 'checklist'],
        guarantees: ['attachments by imageRef only', 'receipt compaction possible', 'search sidecars rebuildable'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'QueueRepository',
        collections: ['ops_queue'],
        requiredOperations: ['enqueue', 'claim', 'complete', 'fail', 'retry', 'cancel', 'deadLetter'],
        guarantees: ['idempotency keys', 'lease semantics', 'retry/backoff/DLQ', 'segmented storage compatibility'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'AuditRepository',
        collections: ['audit', 'audit_indexes'],
        requiredOperations: ['logAction', 'search', 'export', 'retention', 'index', 'compactTokens'],
        guarantees: ['append-only records', 'indexed search fallback correctness', 'retention emits deletion events'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'ImageObjectStore',
        collections: ['images'],
        requiredOperations: ['storeImage', 'getImage', 'deleteImage', 'imageExists'],
        guarantees: ['content addressed', 'metadata sidecar', 'delete by imageRef', 'no raw base64 in messages'],
        pilotDefaultAllowed: false,
      },
      {
        name: 'SearchRepository',
        collections: ['search indexes', 'audit token indexes', 'workroom search indexes'],
        requiredOperations: ['index', 'search', 'rebuild', 'verify', 'fallback'],
        guarantees: ['Arabic normalization preserved', 'explainability preserved', 'fallback path exists'],
        pilotDefaultAllowed: false,
      },
    ],
  };
}

export function buildRepositoryContractRecommendations(report) {
  const recommendations = [];

  if (!report.docs.phase61RepositoryContracts) {
    recommendations.push({
      id: 'repository_contract_doc_missing',
      label: 'أضف وثيقة عقود Repository',
      severity: 'warning',
      command: null,
      adminRoute: '/api/admin/repository-contracts',
      reason: 'PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md is missing.',
    });
  }

  if (report.runtimeSwitchEnabled) {
    recommendations.push({
      id: 'repository_runtime_switch_disable',
      label: 'أوقف runtime repository switch',
      severity: 'critical',
      command: null,
      adminRoute: '/api/admin/repository-contracts',
      reason: 'Runtime repository switch must remain disabled in Phase 61.',
    });
  }

  if (report.externalAdapterImplemented) {
    recommendations.push({
      id: 'repository_external_adapter_not_allowed',
      label: 'راجع external adapter غير مسموح',
      severity: 'critical',
      command: null,
      adminRoute: '/api/admin/repository-contracts',
      reason: 'No external adapter should be implemented by default in Phase 61.',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'repository_contracts_ok',
      label: 'عقود Repository جاهزة كتوثيق',
      severity: 'info',
      command: 'node scripts/verify-repository-contracts.js --json',
      adminRoute: '/api/admin/repository-contracts',
      reason: 'Contracts are documented and runtime switch is disabled.',
    });
  }

  return recommendations;
}

export async function getRepositoryContractReadiness(options = {}) {
  const matrix = getRepositoryContractMatrix();

  const docs = {
    phase60RepositoryBoundaries: await fileExists('./PHASE60_REPOSITORY_BOUNDARIES.md'),
    phase61RepositoryContracts: await fileExists('./PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md'),
    phase61EventBridgePlan: await fileExists('./PHASE61_EVENT_BRIDGE_PILOT_PLAN.md'),
    phase61SseFanoutPlan: await fileExists('./PHASE61_SSE_FANOUT_PILOT_PLAN.md'),
  };

  const report = {
    enabled: isEnabled(),
    phase: 61,
    generatedAt: nowIso(),
    docsOnly: matrix.docsOnly,
    runtimeSwitchEnabled: matrix.runtimeSwitchEnabled,
    fileBackedSourceOfTruth: true,
    externalAdapterImplemented: false,
    docs,
    matrix: matrix.candidates,
    status: 'ok',
    warnings: [],
    blockers: [],
    recommendations: [],
  };

  if (matrix.runtimeSwitchEnabled) {
    report.blockers.push({
      code: 'RUNTIME_SWITCH_ENABLED',
      message: 'Runtime repository switch is not allowed in Phase 61.',
    });
  }

  if (!docs.phase61RepositoryContracts) {
    report.warnings.push({
      code: 'PHASE61_REPOSITORY_CONTRACTS_DOC_MISSING',
      message: 'PHASE61_REPOSITORY_ADAPTER_CONTRACTS.md is missing.',
    });
  }

  if (report.blockers.length > 0) report.status = 'critical';
  else if (report.warnings.length > 0) report.status = 'warning';

  report.recommendations = buildRepositoryContractRecommendations(report);
  return report;
}

export const _testHelpers = {
  isEnabled,
};
