// ═══════════════════════════════════════════════════════════════
// server/services/backupScheduler.js — Automated Backup Scheduler
// ═══════════════════════════════════════════════════════════════
// Config-driven daily backup at configured hour (Egypt timezone).
// Integrity verification, retention policy, fire-and-forget.
// Follows activitySummary.js timer pattern.
// ═══════════════════════════════════════════════════════════════

import { cp, readdir, readFile, rm, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';
import { logger } from './logger.js';

/** @type {string|null} last backup date string (Egypt timezone YYYY-MM-DD) */
let lastBackupDate = null;

/** @type {{ lastDate: string|null, lastResult: object|null }} */
let lastBackupInfo = { lastDate: null, lastResult: null };

const DATA_DIR = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

/**
 * Get current date string + hour in Egypt timezone (UTC+2)
 * @returns {{ dateStr: string, hour: number }}
 */
function getEgyptDateAndHour() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptDate.getUTCDate()).padStart(2, '0');
  return {
    dateStr: `${y}-${m}-${d}`,
    hour: egyptDate.getUTCHours(),
  };
}

/**
 * Verify integrity of backup by parsing each JSON file
 * @param {string} backupDir
 * @returns {Promise<{ valid: boolean, total: number, errors: number }>}
 */
async function verifyBackupIntegrity(backupDir) {
  let total = 0;
  let errors = 0;

  async function scanDir(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
          total++;
          try {
            const raw = await readFile(fullPath, 'utf-8');
            JSON.parse(raw);
          } catch (_) {
            errors++;
            logger.warn('Backup integrity: corrupted file', { file: fullPath });
          }
        }
      }
    } catch (_) {
      // Directory read error — non-fatal
    }
  }

  await scanDir(backupDir);
  return { valid: errors === 0, total, errors };
}

/**
 * Enforce retention policy — keep only the last N backups, delete the rest.
 * @param {string} targetDir
 * @param {number} retentionCount
 * @returns {Promise<number>} count of deleted backups
 */
async function enforceRetention(targetDir, retentionCount) {
  let deleted = 0;
  try {
    const entries = await readdir(targetDir);
    const backupDirs = entries
      .filter(e => e.startsWith('yawmia-backup-'))
      .sort(); // ascending by timestamp

    if (backupDirs.length <= retentionCount) return 0;

    const toDelete = backupDirs.slice(0, backupDirs.length - retentionCount);
    for (const dir of toDelete) {
      try {
        await rm(join(targetDir, dir), { recursive: true, force: true });
        deleted++;
      } catch (_) {
        // Individual deletion failure — non-fatal
      }
    }
  } catch (_) {
    // Non-fatal
  }
  return deleted;
}

/**
 * Check if backup should run, and run it if so.
 * Called by hourly timer — acts only at configured hour.
 * Prevents re-run on same date.
 * Fire-and-forget safe — NEVER throws.
 *
 * @returns {Promise<{ backed: boolean, verified?: boolean, cleaned?: number }>}
 */
export async function checkAndRunBackup() {
  try {
    // 1. Feature flag
    if (!config.BACKUP || !config.BACKUP.enabled) {
      return { backed: false };
    }

    // 2. Check hour
    const { dateStr, hour } = getEgyptDateAndHour();
    if (hour !== config.BACKUP.hourEgypt) {
      return { backed: false };
    }

    // 3. Prevent re-run same day
    if (lastBackupDate === dateStr) {
      return { backed: false };
    }

    // 4. Mark as ran
    lastBackupDate = dateStr;

    logger.info('Backup: starting daily backup');

    // 5. Create backup directory
    const targetDir = config.BACKUP.targetDir || './backups';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = join(targetDir, `yawmia-backup-${timestamp}`);

    await mkdir(backupDir, { recursive: true });

    // 6. Check source exists
    try {
      await stat(DATA_DIR);
    } catch (_) {
      logger.warn('Backup: data directory not found', { path: DATA_DIR });
      return { backed: false };
    }

    // 7. Copy data
    await cp(DATA_DIR, backupDir, { recursive: true });

    // 8. Optional integrity check
    let verified = undefined;
    if (config.BACKUP.verifyIntegrity) {
      const integrity = await verifyBackupIntegrity(backupDir);
      verified = integrity.valid;
      logger.info('Backup: integrity check', {
        total: integrity.total,
        errors: integrity.errors,
        valid: integrity.valid,
      });
    }

    // 9. Retention enforcement
    const cleaned = await enforceRetention(targetDir, config.BACKUP.retentionCount || 7);

    const result = { backed: true, verified, cleaned };
    lastBackupInfo = { lastDate: dateStr, lastResult: result };

    logger.info('Backup: completed', result);

    return result;
  } catch (err) {
    // NEVER throw — fire-and-forget safe
    logger.error('Backup: failed', { error: err.message });
    return { backed: false };
  }
}

/**
 * Get last backup info (for health/admin dashboard).
 * @returns {{ lastDate: string|null, lastResult: object|null }}
 */
export function getLastBackupInfo() {
  return { ...lastBackupInfo };
}
