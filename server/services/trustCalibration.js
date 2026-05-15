// ═══════════════════════════════════════════════════════════════
// server/services/trustCalibration.js — Trust Score V2 Calibration (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Persists Trust Score V2 snapshots and compares them to future outcomes.
// No automatic weight changes in Phase 53.
// Storage:
//   data/metrics/trust-v2-snapshots/YYYY-MM/tsv2_x.json
//   data/metrics/trust-calibration/tcal_x.json
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getCollectionPath,
  getRecordPath,
  listJSON,
} from './database.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';
import { eventBus } from './eventBus.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

const SCORE_BUCKETS = [
  { id: '0_20', min: 0, max: 0.2, label: '0-20' },
  { id: '20_40', min: 0.2, max: 0.4, label: '20-40' },
  { id: '40_60', min: 0.4, max: 0.6, label: '40-60' },
  { id: '60_80', min: 0.6, max: 0.8, label: '60-80' },
  { id: '80_100', min: 0.8, max: 1.01, label: '80-100' },
];

const cache = new Map();

function isEnabled() {
  return !!(config.TRUST_CALIBRATION && config.TRUST_CALIBRATION.enabled);
}

function nowIso() {
  return new Date().toISOString();
}

function monthKey(iso = nowIso()) {
  return String(iso).slice(0, 7);
}

function dateKey(iso = nowIso()) {
  return String(iso).slice(0, 10);
}

function snapshotRoot() {
  return getCollectionPath('trust_snapshots');
}

function snapshotPath(snapshotId, iso = nowIso()) {
  return join(snapshotRoot(), monthKey(iso), `${snapshotId}.json`);
}

function reportPath(reportId) {
  return getRecordPath('trust_calibration', reportId);
}

function generateReportId() {
  return 'tcal_' + Date.now().toString(36) + '_' + crypto.randomBytes(5).toString('hex');
}

function safeUserSnapshotId(userId, date = dateKey()) {
  const safeUser = String(userId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `tsv2_${safeUser}_${date}`;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function cacheSet(key, value) {
  const ttl = config.TRUST_CALIBRATION?.cacheTtlMs || (5 * 60 * 1000);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

export function clearTrustCalibrationCache() {
  cache.clear();
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function scoreBucket(score) {
  const s = clamp01(Number(score) || 0);
  return SCORE_BUCKETS.find(b => s >= b.min && s < b.max) || SCORE_BUCKETS[0];
}

function addDaysIso(iso, days) {
  const base = iso ? new Date(iso).getTime() : Date.now();
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}

function inRange(iso, from, to) {
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

function emptyOutcomes(role) {
  if (role === 'employer') {
    return {
      role,
      successfulCompletions: 0,
      cancellations: 0,
      disputes: 0,
      completedPayments: 0,
      totalPayments: 0,
      totalJobs: 0,
      totalRatings: 0,
      avgRating: 0,
      directOffers: {
        total: 0,
        accepted: 0,
        declined: 0,
        expired: 0,
        acceptRate: 0,
      },
      negativeEvents: 0,
      positiveEvents: 0,
      successRate: 0,
    };
  }

  return {
    role,
    successfulCompletions: 0,
    noShows: 0,
    attendedDays: 0,
    totalAttendanceRecords: 0,
    totalRatings: 0,
    avgRating: 0,
    directOffers: {
      total: 0,
      accepted: 0,
      declined: 0,
      expired: 0,
      acceptRate: 0,
    },
    negativeEvents: 0,
    positiveEvents: 0,
    successRate: 0,
  };
}

function finalizeOutcomeScore(outcomes) {
  const positive = outcomes.positiveEvents || 0;
  const negative = outcomes.negativeEvents || 0;
  const total = positive + negative;

  outcomes.successRate = total > 0
    ? Math.round((positive / total) * 100) / 100
    : null;

  return outcomes;
}

/**
 * Create a Trust Score V2 snapshot for one user.
 *
 * Idempotency:
 *   default snapshot id = tsv2_{userId}_{YYYY-MM-DD}
 *
 * @param {string} userId
 * @param {{ force?: boolean, reason?: string, date?: string }} options
 */
export async function createTrustSnapshot(userId, options = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, code: 'TRUST_CALIBRATION_DISABLED' };
  }

  if (!userId || typeof userId !== 'string') {
    return { ok: false, error: 'userId required', code: 'USER_ID_REQUIRED' };
  }

  const snapshotDate = options.date || dateKey();
  const snapshotId = safeUserSnapshotId(userId, snapshotDate);
  const createdAt = nowIso();

  return withLock(`trust-snapshot:${snapshotId}`, async () => {
    const path = snapshotPath(snapshotId, `${snapshotDate}T00:00:00.000Z`);

    if (!options.force) {
      const existing = await readJSON(path);
      if (existing) {
        return { ok: true, snapshot: existing, deduped: true };
      }
    }

    const { findById } = await import('./users.js');
    const user = await findById(userId);

    if (!user || user.status !== 'active') {
      return { ok: false, error: 'المستخدم غير موجود أو غير نشط', code: 'USER_NOT_ACTIVE' };
    }

    const { getTrustScoreV2 } = await import('./trustScoreV2.js');
    const trust = await getTrustScoreV2(userId, { admin: true, force: true });

    if (!trust) {
      return { ok: false, error: 'تعذّر حساب مؤشر الثقة', code: 'TRUST_SCORE_UNAVAILABLE' };
    }

    const snapshot = {
      id: snapshotId,
      userId,
      role: user.role,
      score: trust.score,
      score100: trust.score100,
      grade: trust.grade,
      components: trust.components || {},
      rawMetrics: trust.rawMetrics || {},
      explanations: trust.explanations || [],
      adminExplanations: trust.adminExplanations || [],
      reason: options.reason || 'manual_or_scheduled',
      snapshotDate,
      createdAt,
    };

    await atomicWrite(path, snapshot);

    eventBus.emit('trust_v2:snapshot_created', {
      snapshotId,
      userId,
      role: user.role,
      score: snapshot.score,
      reason: snapshot.reason,
      timestamp: createdAt,
    });

    clearTrustCalibrationCache();

    return { ok: true, snapshot, deduped: false };
  });
}

/**
 * Create snapshots for active users.
 *
 * @param {{ role?: string, limit?: number, force?: boolean, reason?: string }} options
 */
export async function createSnapshotsForActiveUsers(options = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, created: 0, skipped: 0 };
  }

  const started = Date.now();

  const { listAll } = await import('./users.js');
  let users = await listAll();
  users = users.filter(u => u && u.status === 'active' && u.id && u.id.startsWith('usr_'));

  if (options.role) {
    users = users.filter(u => u.role === options.role);
  }

  const limit = options.limit ? Math.max(1, parseInt(options.limit)) : users.length;
  users = users.slice(0, limit);

  let created = 0;
  let deduped = 0;
  let failed = 0;

  const failures = [];

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    try {
      const result = await createTrustSnapshot(user.id, {
        force: !!options.force,
        reason: options.reason || 'batch',
      });

      if (result.ok && result.deduped) deduped++;
      else if (result.ok) created++;
      else {
        failed++;
        failures.push({ userId: user.id, code: result.code });
      }
    } catch (err) {
      failed++;
      failures.push({ userId: user.id, error: err.message });
    }

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const result = {
    ok: true,
    scanned: users.length,
    created,
    deduped,
    failed,
    failures: failures.slice(0, 20),
    durationMs: Date.now() - started,
    generatedAt: nowIso(),
  };

  return result;
}

/**
 * List trust snapshots, newest first.
 *
 * @param {{ userId?: string, role?: string, from?: string, to?: string, limit?: number, offset?: number }} options
 */
export async function listTrustSnapshots(options = {}) {
  if (!isEnabled()) {
    return { snapshots: [], total: 0, limit: 20, offset: 0 };
  }

  const key = `snapshots:${JSON.stringify(options)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const root = snapshotRoot();
  let months = [];

  try {
    const entries = await readdir(root, { withFileTypes: true });
    months = entries
      .filter(e => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name))
      .map(e => e.name)
      .sort()
      .reverse();
  } catch (_) {
    months = [];
  }

  const rows = [];

  for (const month of months) {
    const dir = join(root, month);
    let files = [];
    try {
      files = await readdir(dir);
    } catch (_) {
      continue;
    }

    for (const file of files) {
      if (!file.startsWith('tsv2_') || !file.endsWith('.json') || file.endsWith('.tmp')) continue;

      const snapshot = await readJSON(join(dir, file)).catch(() => null);
      if (!snapshot) continue;

      if (options.userId && snapshot.userId !== options.userId) continue;
      if (options.role && snapshot.role !== options.role) continue;
      if (options.from && snapshot.createdAt < options.from) continue;
      if (options.to && snapshot.createdAt > options.to) continue;

      rows.push(snapshot);
    }
  }

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = rows.length;
  const limit = Math.min(500, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  const result = {
    snapshots: rows.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };

  cacheSet(key, result);
  return result;
}

/**
 * Compute actual user outcomes in a future window.
 *
 * @param {string} userId
 * @param {'worker'|'employer'} role
 * @param {string} from
 * @param {string} to
 */
export async function computeUserOutcomes(userId, role, from, to) {
  const outcomes = emptyOutcomes(role);

  if (!userId || !role) return finalizeOutcomeScore(outcomes);

  if (role === 'worker') {
    // Attendance outcomes.
    try {
      const { listByWorker } = await import('./attendance.js');
      const records = await listByWorker(userId);
      const period = records.filter(r => inRange(r.createdAt || r.checkInAt || r.noShowReportedAt, from, to));

      outcomes.totalAttendanceRecords = period.length;
      outcomes.attendedDays = period.filter(r =>
        r.status === 'checked_in' ||
        r.status === 'checked_out' ||
        r.status === 'confirmed' ||
        r.employerConfirmed
      ).length;
      outcomes.noShows = period.filter(r => r.status === 'no_show').length;

      outcomes.positiveEvents += outcomes.attendedDays;
      outcomes.negativeEvents += outcomes.noShows;
    } catch (_) {}

    // Completed accepted jobs.
    try {
      const { listByWorker } = await import('./applications.js');
      const { findById: findJob } = await import('./jobs.js');
      const apps = await listByWorker(userId);
      const accepted = apps.filter(a => a.status === 'accepted' || a.status === 'worker_confirmed');

      for (const app of accepted) {
        const job = await findJob(app.jobId);
        if (job && job.status === 'completed' && inRange(job.completedAt, from, to)) {
          outcomes.successfulCompletions++;
          outcomes.positiveEvents++;
        }
      }
    } catch (_) {}

    // Ratings received.
    try {
      const { listByUser } = await import('./ratings.js');
      const ratings = await listByUser(userId, { limit: 10000, offset: 0 });
      const period = (ratings.items || []).filter(r => inRange(r.createdAt, from, to));

      outcomes.totalRatings = period.length;
      if (period.length > 0) {
        outcomes.avgRating = Math.round((period.reduce((s, r) => s + (r.stars || 0), 0) / period.length) * 10) / 10;
        for (const r of period) {
          if ((r.stars || 0) >= 4) outcomes.positiveEvents++;
          if ((r.stars || 0) <= 2) outcomes.negativeEvents++;
        }
      }
    } catch (_) {}

    // Direct offer outcomes.
    try {
      const { getWorkerOfferStats } = await import('./directOffer.js');
      outcomes.directOffers = await getWorkerOfferStats(userId, { from, to });
    } catch (_) {}
  }

  if (role === 'employer') {
    // Job outcomes.
    try {
      const jobIds = await getFromSetIndex(config.DATABASE.indexFiles.employerJobsIndex, userId);
      outcomes.totalJobs = jobIds.length;

      for (const jobId of jobIds) {
        const job = await readJSON(getRecordPath('jobs', jobId));
        if (!job) continue;

        if (job.status === 'completed' && inRange(job.completedAt, from, to)) {
          outcomes.successfulCompletions++;
          outcomes.positiveEvents++;
        }

        if (job.status === 'cancelled' && inRange(job.cancelledAt || job.createdAt, from, to)) {
          outcomes.cancellations++;
          outcomes.negativeEvents++;
        }
      }
    } catch (_) {}

    // Payment outcomes.
    try {
      const { listAll } = await import('./payments.js');
      const payments = await listAll();
      const mine = payments.filter(p => p.employerId === userId && inRange(p.createdAt, from, to));

      outcomes.totalPayments = mine.length;
      outcomes.completedPayments = mine.filter(p => p.status === 'completed').length;
      outcomes.disputes = mine.filter(p => p.status === 'disputed').length;

      outcomes.positiveEvents += outcomes.completedPayments;
      outcomes.negativeEvents += outcomes.disputes;
    } catch (_) {}

    // Ratings received.
    try {
      const { listByUser } = await import('./ratings.js');
      const ratings = await listByUser(userId, { limit: 10000, offset: 0 });
      const period = (ratings.items || []).filter(r => inRange(r.createdAt, from, to));

      outcomes.totalRatings = period.length;
      if (period.length > 0) {
        outcomes.avgRating = Math.round((period.reduce((s, r) => s + (r.stars || 0), 0) / period.length) * 10) / 10;
        for (const r of period) {
          if ((r.stars || 0) >= 4) outcomes.positiveEvents++;
          if ((r.stars || 0) <= 2) outcomes.negativeEvents++;
        }
      }
    } catch (_) {}

    // Direct offer outcomes.
    try {
      const { getEmployerOfferStats } = await import('./directOffer.js');
      outcomes.directOffers = await getEmployerOfferStats(userId, { from, to });
    } catch (_) {}
  }

  return finalizeOutcomeScore(outcomes);
}

function summarizeBuckets(rows) {
  const buckets = {};

  for (const b of SCORE_BUCKETS) {
    buckets[b.id] = {
      bucket: b.id,
      label: b.label,
      min: b.min,
      max: b.max >= 1.01 ? 1 : b.max,
      samples: 0,
      avgScore: 0,
      avgSuccessRate: 0,
      totalPositive: 0,
      totalNegative: 0,
    };
  }

  for (const row of rows) {
    const b = scoreBucket(row.score);
    const bucket = buckets[b.id];

    bucket.samples++;
    bucket.avgScore += row.score || 0;

    if (row.outcomes && row.outcomes.successRate !== null) {
      bucket.avgSuccessRate += row.outcomes.successRate;
    }

    bucket.totalPositive += row.outcomes?.positiveEvents || 0;
    bucket.totalNegative += row.outcomes?.negativeEvents || 0;
  }

  for (const bucket of Object.values(buckets)) {
    if (bucket.samples > 0) {
      bucket.avgScore = Math.round((bucket.avgScore / bucket.samples) * 100) / 100;
      bucket.avgSuccessRate = Math.round((bucket.avgSuccessRate / bucket.samples) * 100) / 100;
    }
  }

  return Object.values(buckets);
}

export function detectTrustDriftFromBuckets(buckets, threshold) {
  const driftThreshold = typeof threshold === 'number'
    ? threshold
    : (config.TRUST_CALIBRATION?.driftWarningThreshold || 0.15);

  const warnings = [];

  for (const bucket of buckets || []) {
    if (!bucket || bucket.samples <= 0) continue;
    if (bucket.avgSuccessRate === 0 && bucket.totalPositive + bucket.totalNegative === 0) continue;

    const delta = Math.abs((bucket.avgScore || 0) - (bucket.avgSuccessRate || 0));
    if (delta >= driftThreshold) {
      warnings.push({
        bucket: bucket.bucket,
        label: bucket.label,
        samples: bucket.samples,
        avgScore: bucket.avgScore,
        avgSuccessRate: bucket.avgSuccessRate,
        delta: Math.round(delta * 100) / 100,
        severity: delta >= driftThreshold * 2 ? 'high' : 'medium',
      });
    }
  }

  return warnings;
}

/**
 * Generate calibration report from snapshots + outcomes.
 *
 * @param {{ from?: string, to?: string, outcomeWindowDays?: number, role?: string, persist?: boolean }} options
 */
export async function generateCalibrationReport(options = {}) {
  if (!isEnabled()) {
    return { ok: false, disabled: true, code: 'TRUST_CALIBRATION_DISABLED' };
  }

  const started = Date.now();
  const from = options.from || addDaysIso(nowIso(), -30);
  const to = options.to || nowIso();
  const outcomeWindowDays = options.outcomeWindowDays || config.TRUST_CALIBRATION?.outcomeWindowDays || 30;

  const snapshotsResult = await listTrustSnapshots({
    from,
    to,
    role: options.role || undefined,
    limit: 10000,
    offset: 0,
  });

  const snapshots = snapshotsResult.snapshots || [];
  const rows = [];

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const outcomeFrom = snap.createdAt;
    const outcomeTo = addDaysIso(snap.createdAt, outcomeWindowDays);

    const outcomes = await computeUserOutcomes(snap.userId, snap.role, outcomeFrom, outcomeTo);

    rows.push({
      snapshotId: snap.id,
      userId: snap.userId,
      role: snap.role,
      score: snap.score,
      score100: snap.score100,
      grade: snap.grade,
      snapshotAt: snap.createdAt,
      outcomeWindow: { from: outcomeFrom, to: outcomeTo },
      outcomes,
      bucket: scoreBucket(snap.score).id,
    });

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  const buckets = summarizeBuckets(rows);
  const driftWarnings = detectTrustDriftFromBuckets(buckets, config.TRUST_CALIBRATION?.driftWarningThreshold || 0.15);

  const report = {
    id: generateReportId(),
    type: 'trust_calibration_report',
    period: { from, to },
    outcomeWindowDays,
    generatedAt: nowIso(),
    durationMs: Date.now() - started,
    sampleCount: rows.length,
    minSamplesForCalibration: config.TRUST_CALIBRATION?.minSamplesForCalibration || 20,
    buckets,
    driftWarnings,
    rows: rows.slice(0, 1000),
    noAutomaticWeightChanges: true,
  };

  if (options.persist !== false) {
    await atomicWrite(reportPath(report.id), report);

    eventBus.emit('trust_calibration:report_created', {
      reportId: report.id,
      sampleCount: report.sampleCount,
      driftWarningCount: driftWarnings.length,
      timestamp: report.generatedAt,
    });

    if (driftWarnings.length > 0) {
      eventBus.emit('trust_calibration:drift_detected', {
        reportId: report.id,
        warnings: driftWarnings,
        timestamp: report.generatedAt,
      });
    }
  }

  clearTrustCalibrationCache();

  return { ok: true, report };
}

/**
 * List reports.
 */
export async function listCalibrationReports(options = {}) {
  if (!isEnabled()) return { reports: [], total: 0, limit: 20, offset: 0 };

  const dir = getCollectionPath('trust_calibration');
  let reports = await listJSON(dir);
  reports = reports.filter(r => r && r.id && r.id.startsWith('tcal_'));

  reports.sort((a, b) => new Date(b.generatedAt || 0) - new Date(a.generatedAt || 0));

  const total = reports.length;
  const limit = Math.min(100, Math.max(1, parseInt(options.limit) || 20));
  const offset = Math.max(0, parseInt(options.offset) || 0);

  return {
    reports: reports.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

/**
 * Detect trust drift from latest generated report or fresh transient report.
 */
export async function detectTrustDrift(options = {}) {
  if (!isEnabled()) return { enabled: false, warnings: [] };

  if (options.reportId) {
    const report = await readJSON(reportPath(options.reportId));
    if (!report) return { enabled: true, warnings: [], error: 'REPORT_NOT_FOUND' };
    return {
      enabled: true,
      reportId: report.id,
      warnings: report.driftWarnings || [],
      generatedAt: report.generatedAt,
    };
  }

  const reportResult = await generateCalibrationReport({
    ...options,
    persist: false,
  });

  return {
    enabled: true,
    reportId: null,
    warnings: reportResult.report?.driftWarnings || [],
    generatedAt: reportResult.report?.generatedAt || nowIso(),
  };
}

/**
 * Dashboard summary.
 */
export async function getCalibrationDashboard(options = {}) {
  if (!isEnabled()) {
    return { enabled: false, metrics: {}, latestReport: null };
  }

  const key = `dashboard:${JSON.stringify(options)}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  const reports = await listCalibrationReports({ limit: 1 });
  const latest = reports.reports[0] || null;

  let snapshotCount = 0;
  let latestSnapshots = [];

  try {
    const snaps = await listTrustSnapshots({
      limit: 20,
      role: options.role || undefined,
    });
    snapshotCount = snaps.total || 0;
    latestSnapshots = snaps.snapshots || [];
  } catch (_) {}

  const result = {
    enabled: true,
    generatedAt: nowIso(),
    metrics: {
      snapshotCount,
      reportCount: reports.total || 0,
      latestSampleCount: latest?.sampleCount || 0,
      driftWarningCount: latest?.driftWarnings?.length || 0,
      noAutomaticWeightChanges: true,
    },
    latestReport: latest ? {
      id: latest.id,
      generatedAt: latest.generatedAt,
      sampleCount: latest.sampleCount,
      buckets: latest.buckets || [],
      driftWarnings: latest.driftWarnings || [],
      durationMs: latest.durationMs || 0,
    } : null,
    latestSnapshots: latestSnapshots.map(s => ({
      id: s.id,
      userId: s.userId,
      role: s.role,
      score: s.score,
      score100: s.score100,
      grade: s.grade,
      createdAt: s.createdAt,
    })),
  };

  cacheSet(key, result);
  return result;
}

// Cache invalidation hooks.
const INVALIDATION_EVENTS = [
  'trust_v2:snapshot_created',
  'trust_calibration:report_created',
  'trust_calibration:drift_detected',
  'rating:submitted',
  'attendance:noshow',
  'attendance:confirmed',
  'payment:disputed',
  'payment:completed',
  'job:completed',
  'job:cancelled',
];

for (const evt of INVALIDATION_EVENTS) {
  eventBus.on(evt, () => {
    clearTrustCalibrationCache();
  });
}

export const _testHelpers = {
  SCORE_BUCKETS,
  snapshotPath,
  reportPath,
  safeUserSnapshotId,
  monthKey,
  dateKey,
  clamp01,
  scoreBucket,
  addDaysIso,
  inRange,
  emptyOutcomes,
  finalizeOutcomeScore,
  summarizeBuckets,
  detectTrustDriftFromBuckets,
  clearTrustCalibrationCache,
  cache,
};
