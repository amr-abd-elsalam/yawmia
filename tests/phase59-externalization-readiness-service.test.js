import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getExternalizationReadiness,
  rankExternalizationCandidates,
  buildExternalizationDecisionMatrix,
  getRepositoryBoundaryProposal,
  getPhase60Requirements,
} from '../server/services/externalizationReadiness.js';

test('externalization readiness is advisory-only in Phase 59', async () => {
  const result = await getExternalizationReadiness({
    loadPressure: false,
  });

  assert.equal(result.enabled, true);
  assert.equal(result.phase, 59);
  assert.equal(result.implementationAllowed, false);
  assert.equal(result.noExternalizationBeforePhase, 60);
  assert.ok(result.guardrails.some(g => g.includes('No PostgreSQL implementation')));
});

test('externalization candidates are ranked from pressure snapshot evidence', () => {
  const snapshot = {
    collections: {
      messages: {
        fileCount: 300000,
        shards: {
          '2026-05': { fileCount: 260000 },
        },
      },
      audit: {
        fileCount: 300000,
      },
    },
    indexes: {
      auditTokenIndex: {
        fileCount: 160000,
      },
    },
    queue: {
      byStatus: {
        pending: 6000,
        'dead-letter': 60,
      },
    },
    workrooms: {
      largestSidecarKB: 3000,
      largestSearchIndexKB: 5000,
    },
    analytics: {},
    governance: {},
  };

  const ranked = rankExternalizationCandidates(snapshot, {
    candidates: ['messages', 'audit', 'ops_queue', 'users'],
  });

  assert.equal(ranked[0].implementationAllowed, false);
  assert.ok(ranked[0].score >= ranked[ranked.length - 1].score);
  assert.ok(ranked.some(c => c.name === 'messages' && c.status === 'review_phase60'));
});

test('externalization decision matrix contains Phase 60 requirements and no implementation permission', () => {
  const matrix = buildExternalizationDecisionMatrix({
    collections: {},
    indexes: {},
    queue: {},
    workrooms: {},
    governance: {},
  });

  assert.ok(Array.isArray(matrix));
  assert.ok(matrix.length > 0);
  assert.equal(matrix[0].implementationAllowedNow, false);
  assert.ok(matrix.some(row => row.phase60Requirement));
});

test('repository boundary proposal is present and advisory-only', () => {
  const boundaries = getRepositoryBoundaryProposal();

  assert.ok(boundaries.some(b => b.name === 'UserRepository'));
  assert.ok(boundaries.some(b => b.name === 'QueueRepository'));
  assert.ok(boundaries.every(b => b.phase59Status === 'proposal_only'));
});

test('Phase 60 requirements include external DB, queue, event bridge, SSE fanout and rollback', () => {
  const reqs = getPhase60Requirements();
  const areas = reqs.map(r => r.area);

  assert.ok(areas.includes('external_database'));
  assert.ok(areas.includes('external_queue'));
  assert.ok(areas.includes('event_bridge'));
  assert.ok(areas.includes('sse_fanout'));
  assert.ok(areas.includes('rollback'));
});
