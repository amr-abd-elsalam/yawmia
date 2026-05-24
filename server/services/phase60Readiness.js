// ═══════════════════════════════════════════════════════════════
// server/services/phase60Readiness.js — Lightweight Phase 60 Checks
// ═══════════════════════════════════════════════════════════════

import { stat } from 'node:fs/promises';
import config from '../../config.js';

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (_) {
    return false;
  }
}

function check(id, status, message) {
  return { id, status, message };
}

export async function getPhase60ReadinessChecks() {
  const checks = [];

  const requiredDocs = [
    'PHASE60_EXTERNALIZATION_DECISION.md',
    'PHASE60_MIGRATION_REHEARSAL.md',
    'PHASE60_ROLLBACK_PLAN.md',
    'PHASE60_REPOSITORY_BOUNDARIES.md',
    'PHASE60_EVENT_BRIDGE_DESIGN.md',
    'PHASE60_SSE_FANOUT_DESIGN.md',
    'PHASE60_OBJECT_STORAGE_DECISION.md',
    'PHASE60_EXTERNAL_QUEUE_DECISION.md',
    'PHASE60_EXTERNAL_SEARCH_DECISION.md',
  ];

  for (const doc of requiredDocs) {
    checks.push(check(
      `phase60_doc_${doc}`,
      await exists(doc) ? 'pass' : 'warn',
      await exists(doc) ? `${doc} exists` : `${doc} is missing`
    ));
  }

  const scripts = [
    'scripts/validate-migration-snapshot.js',
    'scripts/run-migration-rehearsal.js',
    'scripts/capture-externalization-decision.js',
    'scripts/list-benchmark-history.js',
  ];

  for (const script of scripts) {
    checks.push(check(
      `phase60_script_${script}`,
      await exists(script) ? 'pass' : 'warn',
      await exists(script) ? `${script} exists` : `${script} is missing`
    ));
  }

  checks.push(check(
    'phase60_advisory_only',
    config.EXTERNALIZATION_DECISION?.advisoryOnly !== false ? 'pass' : 'fail',
    config.EXTERNALIZATION_DECISION?.advisoryOnly !== false
      ? 'Phase 60 externalization decision is advisory-only.'
      : 'Phase 60 advisoryOnly is disabled.'
  ));

  checks.push(check(
    'phase60_no_implementation_before_approval',
    config.EXTERNALIZATION_DECISION?.noImplementationBeforeApproval !== false ? 'pass' : 'fail',
    config.EXTERNALIZATION_DECISION?.noImplementationBeforeApproval !== false
      ? 'External implementation requires approval.'
      : 'External implementation approval guard is disabled.'
  ));

  let latestDecision = null;
  try {
    const { listExternalizationDecisionSnapshots } = await import('./externalizationDecision.js');
    const result = await listExternalizationDecisionSnapshots({ limit: 1, offset: 0 });
    latestDecision = result.decisions && result.decisions[0] ? result.decisions[0] : null;
  } catch (_) {}

  checks.push(check(
    'phase60_latest_decision_snapshot',
    latestDecision ? 'pass' : 'warn',
    latestDecision
      ? `Latest Phase 60 decision snapshot: ${latestDecision.status}`
      : 'No Phase 60 externalization decision snapshot captured yet.'
  ));

  let latestBenchmark = null;
  try {
    const { getLatestBenchmarkResult } = await import('./benchmarkHistory.js');
    latestBenchmark = await getLatestBenchmarkResult();
  } catch (_) {}

  checks.push(check(
    'phase60_latest_benchmark_artifact',
    latestBenchmark ? 'pass' : 'warn',
    latestBenchmark
      ? `Latest benchmark artifact: ${latestBenchmark.status}`
      : 'No benchmark history artifact captured yet.'
  ));

  return checks;
}

export async function getPhase60EvidenceSummary() {
  let decision = null;
  let benchmark = null;

  try {
    const { getExternalizationDecisionReport } = await import('./externalizationDecision.js');
    decision = await getExternalizationDecisionReport();
  } catch (_) {}

  try {
    const { getLatestBenchmarkResult } = await import('./benchmarkHistory.js');
    benchmark = await getLatestBenchmarkResult();
  } catch (_) {}

  return {
    enabled: true,
    decisionStatus: decision ? decision.status : 'unknown',
    implementationAllowed: false,
    latestBenchmarkStatus: benchmark ? benchmark.status : 'missing',
    recommendations: decision ? decision.recommendations || [] : [],
  };
}
