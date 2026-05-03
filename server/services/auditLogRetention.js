// ═══════════════════════════════════════════════════════════════
// server/services/auditLogRetention.js — Scheduled Audit Cleanup (Phase 48)
// ═══════════════════════════════════════════════════════════════
// Runs daily at configured Egypt hour (default 2AM).
// Deletes audit entries older than retentionDays.
// Idempotent via lastRunDate check.
// Batch processing with event loop yield via setImmediate.
// Per-file try/catch isolation — single failure doesn't block scan.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import { readdir, unlink } from 'node:fs/promises';
import config from '../../config.js';
import { getCollectionPath, readJSON } from './database.js';
import { logger } from './logger.js';

let cleanupTimer = null;
let lastCleanupAt = null;
let lastCleanupCount = 0;
let lastRunDate = null;

/**
 * Get current hour and date string in Egypt timezone (UTC+2).
 * @returns {{ hour: number, dateStr: string }}
 */
function getEgyptDateAndHour() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  return {
    hour: egyptDate.getUTCHours(),
    dateStr: egyptDate.toISOString().slice(0, 10),
  };
}

/**
 * Run retention cleanup.
 * Deletes audit entries older than retentionDays.
 *
 * @returns {Promise<{ cleaned: number, retentionDays?: number, cutoffIso?: string, skipped?: boolean, error?: string }>}
 */
export async function runRetentionCleanup() {
  const cfg = config.AUDIT_RETENTION;
  if (!cfg || !cfg.enabled) return { cleaned: 0, skipped: true };

  const retentionDays = cfg.retentionDays || 365;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();
  const batchSize = cfg.cleanupBatchSize || 100;

  const auditDir = getCollectionPath('audit');
  let files;
  try {
    files = await readdir(auditDir);
  } catch (err) {
    return { cleaned: 0, error: err.message };
  }

  const auditFiles = files.filter(f =>
    f.startsWith('aud_') && f.endsWith('.json') && !f.endsWith('.tmp')
  );

  let cleaned = 0;

  for (let i = 0; i < auditFiles.length; i++) {
    const filePath = join(auditDir, auditFiles[i]);
    try {
      const data = await readJSON(filePath);
      if (data && data.createdAt && data.createdAt < cutoffIso) {
        await unlink(filePath);
        cleaned++;
      }
    } catch (_) { /* skip individual errors */ }

    // Yield to event loop every batchSize files
    if ((i + 1) % batchSize === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  lastCleanupAt = new Date().toISOString();
  lastCleanupCount = cleaned;

  if (cleaned > 0) {
    logger.info('Audit retention: cleaned old entries', { cleaned, retentionDays });
  }

  return { cleaned, retentionDays, cutoffIso };
}

/**
 * Internal scheduler check — runs cleanup if hour matches and not already run today.
 */
async function checkAndRun() {
  try {
    const cfg = config.AUDIT_RETENTION;
    if (!cfg || !cfg.enabled) return;

    const { hour, dateStr } = getEgyptDateAndHour();
    if (hour !== (cfg.cleanupHourEgypt || 2)) return;
    if (lastRunDate === dateStr) return;

    lastRunDate = dateStr;
    await runRetentionCleanup();
  } catch (err) {
    logger.warn('Audit retention scheduled run failed', { error: err.message });
  }
}

/**
 * Start the scheduled cleanup scanner.
 */
export function start() {
  if (cleanupTimer) return;
  const cfg = config.AUDIT_RETENTION;
  if (!cfg || !cfg.enabled) {
    logger.info('Audit retention: disabled via config');
    return;
  }

  const intervalMs = cfg.cleanupCheckIntervalMs || (60 * 60 * 1000);

  cleanupTimer = setInterval(checkAndRun, intervalMs);
  if (cleanupTimer.unref) cleanupTimer.unref();
  logger.info('Audit retention: scheduler started');
}

/**
 * Stop the scheduled cleanup scanner (test cleanup).
 */
export function stop() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Get retention stats for /api/health and monitoring.
 * @returns {{ lastCleanupAt: string|null, lastCleanupCount: number }}
 */
export function getStats() {
  return { lastCleanupAt, lastCleanupCount };
}

// Test helpers
export const _testHelpers = {
  runRetentionCleanup,
  getEgyptDateAndHour,
  checkAndRun,
  setLastRunDate: (date) => { lastRunDate = date; },
  resetState: () => {
    lastCleanupAt = null;
    lastCleanupCount = 0;
    lastRunDate = null;
  },
};
