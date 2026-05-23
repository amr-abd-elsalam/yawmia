// ═══════════════════════════════════════════════════════════════
// server/services/externalizationReadiness.js — Advisory Readiness (Phase 59)
// ═══════════════════════════════════════════════════════════════
// Advisory-only service for future Phase 60+ externalization planning.
//
// Important:
// - Does NOT implement PostgreSQL.
// - Does NOT implement external search.
// - Does NOT implement external queue.
// - Does NOT create connection strings.
// - Does NOT add dependencies.
// - Uses storage pressure as evidence input.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

function isEnabled() {
  return !!(config.EXTERNALIZATION_READINESS && config.EXTERNALIZATION_READINESS.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function clampScore(n) {
  const x = Number(n) || 0;
  return Math.max(0, Math.min(1, x));
}

function pressureWeight(status) {
  if (status === 'critical') return 1;
  if (status === 'warning') return 0.55;
  return 0;
}

function evidenceFromPressure(snapshot, candidate) {
  const evidence = [];
  let score = 0;

  const collections = snapshot?.collections || {};
  const indexes = snapshot?.indexes || {};
  const queue = snapshot?.queue || {};
  const workrooms = snapshot?.workrooms || {};
  const governance = snapshot?.governance || {};

  function add(label, weight, details) {
    evidence.push({
      label,
      details: details || null,
      weight: Math.round(weight * 100) / 100,
    });
    score += weight;
  }

  if (candidate === 'users') {
    const s = collections.users;
    if (s) {
      if ((s.fileCount || 0) > 0) add('Users are core identity data', 0.1, `${s.fileCount} files`);
      if ((s.largestJsonKB || 0) >= 512) add('Large user JSON records detected', 0.25, `${s.largestJsonKB}KB largest`);
    }
  }

  if (candidate === 'jobs') {
    const s = collections.jobs;
    if (s) {
      const maxShard = Math.max(0, ...Object.values(s.shards || {}).map(x => x.fileCount || 0));
      if (maxShard > 0) add('Jobs are sharded and high-read marketplace data', 0.2, `${maxShard} files in largest shard`);
      if (maxShard >= 20000) add('Jobs shard warning pressure', 0.35, `${maxShard} files`);
      if (maxShard >= 50000) add('Jobs shard critical pressure', 0.6, `${maxShard} files`);
    }
  }

  if (candidate === 'applications') {
    const s = collections.applications;
    if (s) {
      const maxShard = Math.max(0, ...Object.values(s.shards || {}).map(x => x.fileCount || 0));
      if (maxShard > 0) add('Applications are high-growth relation data', 0.2, `${maxShard} files in largest shard`);
      if (maxShard >= 50000) add('Applications shard warning pressure', 0.35, `${maxShard} files`);
      if (maxShard >= 100000) add('Applications shard critical pressure', 0.6, `${maxShard} files`);
    }
  }

  if (candidate === 'payments') {
    const s = collections.payments;
    if (s) {
      const maxShard = Math.max(0, ...Object.values(s.shards || {}).map(x => x.fileCount || 0));
      if (maxShard > 0) add('Payments are financial system-of-record candidates', 0.25, `${maxShard} files in largest shard`);
    }
  }

  if (candidate === 'messages') {
    const msg = collections.messages;
    const wr = workrooms || {};
    if (msg) {
      const maxShard = Math.max(0, ...Object.values(msg.shards || {}).map(x => x.fileCount || 0));
      if (maxShard > 0) add('Messages are high-volume Workroom data', 0.25, `${maxShard} files in largest shard`);
      if (maxShard >= 100000) add('Messages shard warning pressure', 0.4, `${maxShard} files`);
      if (maxShard >= 250000) add('Messages shard critical pressure', 0.7, `${maxShard} files`);
    }
    if ((wr.largestSidecarKB || 0) >= 512) {
      add('Workroom sidecar pressure affects message experience', 0.35, `${wr.largestSidecarKB}KB largest sidecar`);
    }
    if ((wr.largestSearchIndexKB || 0) >= 1024) {
      add('Workroom search index pressure', 0.25, `${wr.largestSearchIndexKB}KB largest search index`);
    }
  }

  if (candidate === 'ops_queue') {
    const byStatus = queue.byStatus || {};
    const pending = byStatus.pending || queue.pending || 0;
    const dlq = byStatus['dead-letter'] || queue.deadLetter || 0;

    if (pending > 0) add('Queue pending backlog exists', 0.15, `${pending} pending`);
    if (pending >= 1000) add('Queue pending warning pressure', 0.35, `${pending} pending`);
    if (pending >= 5000) add('Queue pending critical pressure', 0.75, `${pending} pending`);
    if (dlq >= 10) add('Queue DLQ warning pressure', 0.35, `${dlq} DLQ`);
    if (dlq >= 50) add('Queue DLQ critical pressure', 0.75, `${dlq} DLQ`);
  }

  if (candidate === 'audit') {
    const audit = collections.audit;
    const token = indexes.auditTokenIndex || {};
    if (audit) {
      if ((audit.fileCount || 0) > 0) add('Audit is append-only and admin-critical', 0.2, `${audit.fileCount} records`);
      if ((audit.fileCount || 0) >= 100000) add('Audit raw record warning pressure', 0.35, `${audit.fileCount} records`);
      if ((audit.fileCount || 0) >= 250000) add('Audit raw record critical pressure', 0.65, `${audit.fileCount} records`);
    }
    if ((token.fileCount || 0) >= 50000) {
      add('Audit token index warning pressure', 0.4, `${token.fileCount} token files`);
    }
    if ((token.fileCount || 0) >= 150000) {
      add('Audit token index critical pressure', 0.75, `${token.fileCount} token files`);
    }
  }

  if (candidate === 'search') {
    const search = indexes.searchIndex || {};
    const token = indexes.auditTokenIndex || {};
    const searchAnalytics = snapshot?.analytics?.searchAnalytics || {};
    if ((search.size || 0) > 0) add('Search index exists and is rebuildable', 0.1, `${search.size} entries`);
    if ((searchAnalytics.fileCount || 0) >= 5000) {
      add('Search analytics warning pressure', 0.25, `${searchAnalytics.fileCount} files`);
    }
    if ((token.fileCount || 0) >= 50000) {
      add('Audit/search token fanout pressure', 0.3, `${token.fileCount} token files`);
    }
  }

  if (candidate === 'images') {
    const images = snapshot?.images || collections.images;
    if (images) {
      if ((images.fileCount || 0) > 0) {
        add('Images include sensitive binary/object growth', 0.2, `${images.fileCount} files`);
      }
      if ((images.binaryFileCount || 0) > 0) {
        add('Image store has binary files that may need object-storage planning', 0.2, `${images.binaryFileCount} binary files`);
      }
      if ((images.totalSizeKB || 0) >= 1024 * 1024) {
        add('Image store size pressure', 0.45, `${images.totalSizeKB}KB`);
      }
      if ((images.largestFileKB || 0) >= 2048) {
        add('Large image/object files detected', 0.25, `${images.largestFileKB}KB largest`);
      }
    }
  }

  // Governance pressure can raise advisory priority for audit/users.
  if ((governance.privacyRequests?.open || 0) > 0 && candidate === 'users') {
    add('Open privacy requests increase identity data governance pressure', 0.15, `${governance.privacyRequests.open} open`);
  }

  return {
    score: clampScore(score),
    evidence,
  };
}

/**
 * Rank future externalization candidates using pressure snapshot evidence.
 *
 * @param {object} pressureSnapshot
 * @param {object} options
 */
export function rankExternalizationCandidates(pressureSnapshot, options = {}) {
  const configured = config.EXTERNALIZATION_READINESS?.candidates || [];
  const candidates = Array.isArray(options.candidates) && options.candidates.length > 0
    ? options.candidates
    : configured;

  const rows = candidates.map(name => {
    const evidence = evidenceFromPressure(pressureSnapshot || {}, name);

    let status = 'watch';
    if (evidence.score >= 0.75) status = 'review_phase60';
    else if (evidence.score >= 0.4) status = 'watch';

    return {
      name,
      score: Math.round(evidence.score * 100) / 100,
      status,
      implementationAllowed: false,
      phase: 59,
      evidence: evidence.evidence,
      recommendation: status === 'review_phase60'
        ? 'مرشح لمراجعة Phase 60+ إذا استمر الضغط بعد compaction/repair والbenchmark.'
        : 'راقب الضغط ولا تبدأ externalization بدون evidence إضافي.',
    };
  });

  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return rows;
}

/**
 * Build decision matrix from pressure snapshot.
 */
export function buildExternalizationDecisionMatrix(pressureSnapshot) {
  const candidates = rankExternalizationCandidates(pressureSnapshot);

  return candidates.map(c => ({
    candidate: c.name,
    readinessScore: c.score,
    status: c.status,
    phase59Action: c.score >= 0.75
      ? 'Run benchmarks, compact/repair, document weekly review, then open Phase 60 readiness review.'
      : c.score >= 0.4
        ? 'Monitor, compact where possible, collect benchmark evidence.'
        : 'No externalization action. Continue normal file-based operation.',
    phase60Requirement: phase60RequirementForCandidate(c.name),
    implementationAllowedNow: false,
  }));
}

function phase60RequirementForCandidate(candidate) {
  const map = {
    users: 'External DB with strict privacy/anonymization support and session-token exclusion.',
    jobs: 'External DB with indexed search/filter paths and migration validation.',
    applications: 'External DB with referential integrity to users/jobs.',
    payments: 'External DB with financial audit preservation and no blind deletion.',
    messages: 'External message/workroom store with search, receipts, and privacy controls.',
    ops_queue: 'External queue with atomic claim, visibility timeout, DLQ, idempotency.',
    audit: 'External append-only audit store plus search/index strategy.',
    search: 'External search engine with Arabic normalization and explainable ranking.',
    images: 'External object storage with private access control and image reference migration.',
  };
  return map[candidate] || 'Phase 60+ design required before implementation.';
}

/**
 * Repository boundary proposal.
 */
export function getRepositoryBoundaryProposal() {
  return [
    {
      name: 'UserRepository',
      collections: ['users', 'sessions'],
      responsibilities: ['identity lookup', 'phone index', 'profile updates', 'privacy anonymization support'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'JobRepository',
      collections: ['jobs', 'applications', 'attendance'],
      responsibilities: ['job lifecycle', 'applications relation', 'attendance relation', 'query indexes'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'PaymentRepository',
      collections: ['payments'],
      responsibilities: ['payment lifecycle', 'disputes', 'financial preservation'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'MessageRepository',
      collections: ['messages', 'workrooms', 'workroom_receipts', 'workroom_pins', 'workroom_checklists'],
      responsibilities: ['workroom messages', 'receipts', 'pins', 'checklists', 'search sidecars'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'NotificationRepository',
      collections: ['notifications', 'push_subscriptions'],
      responsibilities: ['in-app notifications', 'unread indexes', 'push subscriptions'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'AuditRepository',
      collections: ['audit', 'audit_indexes'],
      responsibilities: ['append-only admin audit', 'indexed search', 'retention'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'QueueRepository',
      collections: ['ops_queue', 'queue_pending', 'queue_running', 'queue_completed', 'queue_failed', 'queue_cancelled', 'ops_queue_dead_letter'],
      responsibilities: ['durable jobs', 'idempotency', 'claiming', 'retry', 'DLQ'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'MetricsRepository',
      collections: ['metrics', 'search_analytics', 'product_intelligence', 'payment_dispute_analytics'],
      responsibilities: ['rollups', 'analytics snapshots', 'retention'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'GovernanceRepository',
      collections: ['privacy_requests', 'admin_approvals', 'ops_reviews', 'postmortems', 'incidents'],
      responsibilities: ['privacy workflows', 'approval workflows', 'ops reviews', 'postmortems'],
      phase59Status: 'proposal_only',
    },
    {
      name: 'ImageObjectStore',
      collections: ['images'],
      responsibilities: ['content-addressed images', 'private image serving', 'future object storage boundary'],
      phase59Status: 'proposal_only',
    },
  ];
}

/**
 * Phase 60+ requirements.
 */
export function getPhase60Requirements() {
  return [
    {
      area: 'external_database',
      required: true,
      description: 'A transactional external database is required before multi-writer production.',
    },
    {
      area: 'external_queue',
      required: true,
      description: 'External queue must support atomic claim, visibility timeout, DLQ, retries, idempotency.',
    },
    {
      area: 'event_bridge',
      required: true,
      description: 'In-memory EventBus must be replaced or bridged for cross-instance events.',
    },
    {
      area: 'sse_fanout',
      required: true,
      description: 'User/Admin SSE needs cross-instance fanout or sticky routing.',
    },
    {
      area: 'migration_snapshots',
      required: true,
      description: 'NDJSON snapshots with manifest/checksums must exist before migration.',
    },
    {
      area: 'dual_read_write',
      required: true,
      description: 'Dual-read/write and mismatch logging strategy must be implemented before cutover.',
    },
    {
      area: 'rollback',
      required: true,
      description: 'Rollback plan must be tested with backup and migration snapshot.',
    },
    {
      area: 'privacy_controls',
      required: true,
      description: 'Privacy export/anonymization behavior must be preserved in externalized stores.',
    },
    {
      area: 'observability',
      required: true,
      description: 'Benchmarks, pressure snapshots, queue metrics and SLOs must be available during migration.',
    },
  ];
}

/**
 * Main advisory endpoint/service.
 */
export async function getExternalizationReadiness(options = {}) {
  if (!isEnabled()) {
    return {
      enabled: false,
      phase: 59,
      implementationAllowed: false,
      generatedAt: nowIso(),
    };
  }

  let pressureSnapshot = options.pressureSnapshot || null;

  if (!pressureSnapshot && options.loadPressure !== false) {
    try {
      const { getLatestStoragePressureSnapshot, getStoragePressure } = await import('./storagePressure.js');
      pressureSnapshot = await getLatestStoragePressureSnapshot();
      if (!pressureSnapshot && options.captureIfMissing) {
        pressureSnapshot = await getStoragePressure({ persist: true, force: true });
      }
    } catch (_) {
      pressureSnapshot = null;
    }
  }

  const candidates = rankExternalizationCandidates(pressureSnapshot || {}, options);
  const decisionMatrix = buildExternalizationDecisionMatrix(pressureSnapshot || {});

  return {
    enabled: true,
    phase: 59,
    implementationAllowed: false,
    noExternalizationBeforePhase: config.EXTERNALIZATION_READINESS?.noExternalizationBeforePhase || 60,
    generatedAt: nowIso(),
    pressureSnapshot: pressureSnapshot ? {
      id: pressureSnapshot.id || null,
      timestamp: pressureSnapshot.timestamp || null,
      status: pressureSnapshot.status || 'unknown',
      warningCount: Array.isArray(pressureSnapshot.warnings) ? pressureSnapshot.warnings.length : 0,
      criticalCount: Array.isArray(pressureSnapshot.criticals) ? pressureSnapshot.criticals.length : 0,
    } : null,
    candidates,
    decisionMatrix,
    repositoryBoundaries: getRepositoryBoundaryProposal(),
    phase60Requirements: getPhase60Requirements(),
    guardrails: [
      'No PostgreSQL implementation in Phase 59.',
      'No external queue implementation in Phase 59.',
      'No external search implementation in Phase 59.',
      'Do not run multiple writers.',
      'Do not treat file locks as distributed consensus.',
      'Use benchmarks and repeated pressure evidence before Phase 60 decisions.',
    ],
  };
}

export const _testHelpers = {
  clampScore,
  pressureWeight,
  evidenceFromPressure,
  phase60RequirementForCandidate,
};
