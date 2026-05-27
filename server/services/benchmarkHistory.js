// ═══════════════════════════════════════════════════════════════
// server/services/benchmarkHistory.js — Benchmark Artifact History (Phase 60)
// ═══════════════════════════════════════════════════════════════
// Stores read-only benchmark artifacts for evidence-based externalization decisions.
// No PII, no secrets, no benchmark execution here.
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
  return !!(config.BENCHMARK_HISTORY && config.BENCHMARK_HISTORY.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function generateId() {
  return 'bmk_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}

function benchmarkPath(id) {
  return getRecordPath('benchmark_history', id);
}

function sanitizeValue(value) {
  if (value === undefined) return undefined;

  if (typeof value === 'string') {
    // Do not redact generic error strings like "Unexpected token".
    // Key-based redaction below handles actual secret fields.
    return value.slice(0, 2000);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 1000).map(sanitizeValue);
  }

  if (typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (/token|secret|password|apikey|api_key|authorization|vapid/i.test(key)) {
        out[key] = '[redacted]';
      } else {
        const clean = sanitizeValue(val);
        if (clean !== undefined) out[key] = clean;
      }
    }
    return out;
  }

  return String(value).slice(0, 1000);
}

export function evaluateBenchmarkThresholds(result, options = {}) {
  const warningMs = Number(options.p95WarningMs || config.BENCHMARK_HISTORY?.p95WarningMs || 1000);
  const criticalMs = Number(options.p95CriticalMs || config.BENCHMARK_HISTORY?.p95CriticalMs || 3000);

  const rows = Array.isArray(result?.results) ? result.results : [];
  const warnings = [];
  const criticals = [];

  for (const row of rows) {
    const p95 = Number(row.p95Ms || row.p95 || row.durationP95Ms || 0);
    if (!Number.isFinite(p95) || p95 <= 0) continue;

    const item = {
      path: row.path || row.name || row.operation || row.label || 'unknown',
      p95Ms: p95,
      thresholdWarningMs: warningMs,
      thresholdCriticalMs: criticalMs,
    };

    if (p95 >= criticalMs) {
      criticals.push({ ...item, level: 'critical' });
    } else if (p95 >= warningMs) {
      warnings.push({ ...item, level: 'warning' });
    }
  }

  const errorRows = rows.filter(r => !!r.error);

  return {
    status: errorRows.length > 0 || criticals.length > 0
      ? 'critical'
      : (warnings.length > 0 ? 'warning' : 'ok'),
    warningCount: warnings.length,
    criticalCount: criticals.length,
    errorCount: errorRows.length,
    errorRows: errorRows.map(r => ({
      path: r.path || r.name || r.operation || r.label || 'unknown',
      error: String(r.error || '').slice(0, 1000),
    })),
    warnings,
    criticals,
  };
}

export async function persistBenchmarkResult(result, options = {}) {
  if (!isEnabled()) return { ok: false, disabled: true };

  const id = options.id || result?.id || generateId();
  const timestamp = result?.timestamp || nowIso();
  const evaluation = evaluateBenchmarkThresholds(result, options);

  const record = {
    id,
    kind: 'benchmark_history',
    version: '0.57.0',
    timestamp,
    source: options.source || result?.source || 'benchmark-file-paths',
    status: evaluation.status,
    summary: {
      ...(sanitizeValue(result?.summary || {})),
      warningCount: evaluation.warningCount,
      criticalCount: evaluation.criticalCount,
      errorCount: evaluation.errorCount,
      errorRows: sanitizeValue(evaluation.errorRows || []),
    },
    results: sanitizeValue(result?.results || []),
    warnings: evaluation.warnings,
    criticals: evaluation.criticals,
    createdAt: nowIso(),
  };

  await atomicWrite(benchmarkPath(id), record);
  return { ok: true, benchmark: record };
}

export async function listBenchmarkResults(options = {}) {
  if (!isEnabled()) return { benchmarks: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('benchmark_history');
  let rows = await listJSON(dir);
  rows = rows.filter(r => r && r.id && r.id.startsWith('bmk_'));

  if (options.status) rows = rows.filter(r => r.status === options.status);
  if (options.source) rows = rows.filter(r => r.source === options.source);

  rows.sort((a, b) => new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt));

  const total = rows.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    benchmarks: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function getLatestBenchmarkResult(options = {}) {
  const result = await listBenchmarkResults({ ...options, limit: 1, offset: 0 });
  return result.benchmarks && result.benchmarks[0] ? result.benchmarks[0] : null;
}

export async function cleanupOldBenchmarkResults() {
  if (!isEnabled()) return 0;

  const retentionDays = config.BENCHMARK_HISTORY?.retentionDays || 90;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const result = await listBenchmarkResults({ limit: 100000, offset: 0 });
  let cleaned = 0;

  for (const row of result.benchmarks || []) {
    const ts = new Date(row.timestamp || row.createdAt || 0).getTime();
    if (Number.isFinite(ts) && ts > 0 && ts < cutoffMs) {
      await deleteJSON(benchmarkPath(row.id)).catch(() => {});
      cleaned++;
    }
  }

  return cleaned;
}

export const _testHelpers = {
  benchmarkPath,
  sanitizeValue,
  generateId,
};
