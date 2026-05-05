// ═══════════════════════════════════════════════════════════════
// server/services/scheduledAbuseDetection.js — Scheduled Abuse Scanner (Phase 49)
// ═══════════════════════════════════════════════════════════════
// Runs every 15 minutes by default.
// Calls offerAbuseDetector.detectAbuse({ emitHighSeverityEvents: false })
// and emits direct_offer:abuse_threshold_crossed only for:
//   - new high-severity flags
//   - escalated flags (low/medium → high)
//
// Uses withLock('abuse-detection-global') to prevent race with manual scans.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { eventBus } from './eventBus.js';
import { withLock } from './resourceLock.js';
import { logger } from './logger.js';

/** @type {NodeJS.Timeout|null} */
let scanTimer = null;

/** @type {Map<string, string>} fingerprint → severity */
const lastDetectedFlags = new Map();

let lastScanAt = null;
let lastScanDurationMs = 0;
let lastScanFlagCount = 0;
let lastEmittedCount = 0;

/**
 * Run one scheduled detection scan.
 *
 * @returns {Promise<{ scanned: number, emitted: number }>}
 */
export async function runScheduledDetection() {
  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.scheduledDetectionEnabled) {
    return { scanned: 0, emitted: 0 };
  }

  const startTs = Date.now();

  return withLock('abuse-detection-global', async () => {
    let scanned = 0;
    let emitted = 0;

    try {
      const { detectAbuse } = await import('./offerAbuseDetector.js');

      // Phase 49: disable Phase 48 per-call high-severity emission.
      // The scheduled scanner owns dedup/escalation emission.
      const result = await detectAbuse({
        emitHighSeverityEvents: false,
        emitStateChangedEvents: false,
      });

      if (!result || !result.enabled || !Array.isArray(result.flags)) {
        lastScanAt = new Date().toISOString();
        lastScanDurationMs = Date.now() - startTs;
        lastScanFlagCount = 0;
        lastEmittedCount = 0;
        return { scanned: 0, emitted: 0 };
      }

      const currentFingerprints = new Set();

      for (const flag of result.flags) {
        if (!flag || !flag.fingerprint) continue;

        scanned++;
        currentFingerprints.add(flag.fingerprint);

        const previousSeverity = lastDetectedFlags.get(flag.fingerprint) || null;
        const currentSeverity = flag.severity || 'low';

        if (currentSeverity === 'high' && previousSeverity !== 'high') {
          eventBus.emit('direct_offer:abuse_threshold_crossed', {
            fingerprint: flag.fingerprint,
            flagType: flag.type || flag.flagType,
            employerId: flag.employerId || null,
            workerId: flag.workerId || null,
            severity: currentSeverity,
            escalatedFrom: previousSeverity,
            detectedAt: new Date().toISOString(),
          });
          emitted++;
        }

        lastDetectedFlags.set(flag.fingerprint, currentSeverity);
      }

      // Cleanup stale entries no longer present in current detection result.
      for (const fingerprint of Array.from(lastDetectedFlags.keys())) {
        if (!currentFingerprints.has(fingerprint)) {
          lastDetectedFlags.delete(fingerprint);
        }
      }

      lastScanAt = new Date().toISOString();
      lastScanDurationMs = Date.now() - startTs;
      lastScanFlagCount = scanned;
      lastEmittedCount = emitted;

      if (emitted > 0) {
        logger.warn('Scheduled abuse detection emitted threshold events', { emitted, scanned });
      }

      return { scanned, emitted };
    } catch (err) {
      lastScanAt = new Date().toISOString();
      lastScanDurationMs = Date.now() - startTs;
      logger.warn('Scheduled abuse detection failed', { error: err.message });
      return { scanned, emitted };
    }
  });
}

/**
 * Start scheduled scanner.
 */
export function start() {
  if (scanTimer) return;

  if (!config.TRUST_ANALYTICS || !config.TRUST_ANALYTICS.scheduledDetectionEnabled) {
    logger.info('Scheduled abuse detection: disabled via config');
    return;
  }

  const intervalMs = config.TRUST_ANALYTICS.scheduledDetectionIntervalMs || (15 * 60 * 1000);

  scanTimer = setInterval(() => {
    runScheduledDetection().catch(err => {
      logger.warn('Scheduled abuse detection timer error', { error: err.message });
    });
  }, intervalMs);

  if (scanTimer.unref) scanTimer.unref();

  logger.info('Scheduled abuse detection: started', { intervalMs });
}

/**
 * Stop scanner (tests / graceful control).
 */
export function stop() {
  if (scanTimer) {
    clearInterval(scanTimer);
    scanTimer = null;
  }
}

export function getStats() {
  return {
    running: !!scanTimer,
    trackedFlags: lastDetectedFlags.size,
    lastScanAt,
    lastScanDurationMs,
    lastScanFlagCount,
    lastEmittedCount,
  };
}

// Test helpers
export const _testHelpers = {
  lastDetectedFlags,
  reset: () => {
    lastDetectedFlags.clear();
    lastScanAt = null;
    lastScanDurationMs = 0;
    lastScanFlagCount = 0;
    lastEmittedCount = 0;
    stop();
  },
};
