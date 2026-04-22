// ═══════════════════════════════════════════════════════════════
// server/services/indexHealth.js — Index Integrity Monitor
// ═══════════════════════════════════════════════════════════════
// Sample-based health check: picks random records and verifies
// their presence in the corresponding secondary index.
// Warning-only — no auto-repair. Use repair-indexes.js for fixes.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { logger } from './logger.js';

const SAMPLE_SIZE = 10;

/** Cached health status */
let cachedStatus = {
  lastCheck: null,
  status: 'unknown',
  warnings: 0,
  details: [],
};

/**
 * Pick random elements from an array (Fisher-Yates partial shuffle).
 * @param {Array} arr
 * @param {number} count
 * @returns {Array}
 */
function pickRandom(arr, count) {
  if (!arr || arr.length === 0) return [];
  const n = Math.min(count, arr.length);
  const copy = arr.slice();
  for (let i = copy.length - 1; i > copy.length - 1 - n && i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(copy.length - n);
}

/**
 * Run sample-based index integrity check.
 * Checks:
 *   1. phone-index — sample users → verify phone→userId mapping
 *   2. job-apps-index — sample applications → verify jobId→appId presence
 *
 * @returns {Promise<{ status: string, warnings: string[], checkedAt: string }>}
 */
export async function checkIndexHealth() {
  const warnings = [];
  const checkedAt = new Date().toISOString();

  try {
    const { readJSON, getRecordPath, getCollectionPath, listJSON, readSetIndex } = await import('./database.js');
    const { join } = await import('node:path');
    const basePath = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

    // ── Check 1: phone-index ──────────────────────────────────
    try {
      const usersDir = getCollectionPath('users');
      const allUsers = await listJSON(usersDir);
      const users = allUsers.filter(u => u.id && u.id.startsWith('usr_') && u.phone);

      if (users.length > 0) {
        const sample = pickRandom(users, SAMPLE_SIZE);
        const phoneIndexPath = join(basePath, config.DATABASE.indexFiles.phoneIndex);
        const phoneIndex = await readJSON(phoneIndexPath) || {};

        for (const user of sample) {
          const indexedId = phoneIndex[user.phone];
          if (indexedId !== user.id) {
            warnings.push(`phone-index: phone ${user.phone} maps to ${indexedId || 'MISSING'}, expected ${user.id}`);
          }
        }
      }
    } catch (err) {
      warnings.push(`phone-index check failed: ${err.message}`);
    }

    // ── Check 2: job-apps-index ───────────────────────────────
    try {
      const appsDir = getCollectionPath('applications');
      const allApps = await listJSON(appsDir);
      const apps = allApps.filter(a => a.id && a.id.startsWith('app_') && a.jobId);

      if (apps.length > 0) {
        const sample = pickRandom(apps, SAMPLE_SIZE);
        const jobAppsIndex = await readSetIndex(config.DATABASE.indexFiles.jobAppsIndex);

        for (const app of sample) {
          const indexed = jobAppsIndex[app.jobId] || [];
          if (!indexed.includes(app.id)) {
            warnings.push(`job-apps-index: app ${app.id} not found under job ${app.jobId}`);
          }
        }
      }
    } catch (err) {
      warnings.push(`job-apps-index check failed: ${err.message}`);
    }

  } catch (err) {
    warnings.push(`Index health check error: ${err.message}`);
  }

  const status = warnings.length === 0 ? 'healthy' : 'warnings';

  // Update cached status
  cachedStatus = {
    lastCheck: checkedAt,
    status,
    warnings: warnings.length,
    details: warnings,
  };

  // Log warnings
  if (warnings.length > 0) {
    logger.warn('Index health check: warnings detected', {
      count: warnings.length,
      warnings: warnings.slice(0, 5), // Log first 5 only
    });
  }

  return { status, warnings, checkedAt };
}

/**
 * Get cached index health status (sync — for health endpoint).
 * @returns {{ lastCheck: string|null, status: string, warnings: number }}
 */
export function getHealthStatus() {
  return {
    lastCheck: cachedStatus.lastCheck,
    status: cachedStatus.status,
    warnings: cachedStatus.warnings,
  };
}
