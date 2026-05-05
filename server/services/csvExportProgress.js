// ═══════════════════════════════════════════════════════════════
// server/services/csvExportProgress.js — CSV Export Progress (Phase 49)
// ═══════════════════════════════════════════════════════════════
// In-memory export progress tracker.
// Emits csv_export:progress events for admin SSE delivery.
// Multiple concurrent exports isolated by exportId.
// ═══════════════════════════════════════════════════════════════

import { eventBus } from './eventBus.js';

/**
 * exportId → { rowsProcessed, totalEstimate, startedAt }
 * @type {Map<string, { rowsProcessed: number, totalEstimate: number, startedAt: string }>}
 */
const activeExports = new Map();

const CLEANUP_AFTER_MS = 30 * 60 * 1000;

/**
 * Start tracking an export.
 * @param {string} exportId
 * @param {number} totalEstimate
 */
export function startExport(exportId, totalEstimate = 0) {
  if (!exportId) return;

  activeExports.set(exportId, {
    rowsProcessed: 0,
    totalEstimate: Math.max(0, Number(totalEstimate) || 0),
    startedAt: new Date().toISOString(),
  });

  emitProgress(exportId, 0);
}

/**
 * Update export progress.
 * Emits every 1000 rows, plus explicit row 0.
 *
 * @param {string} exportId
 * @param {number} rowsProcessed
 */
export function updateProgress(exportId, rowsProcessed) {
  if (!exportId) return;

  const entry = activeExports.get(exportId);
  if (!entry) return;

  entry.rowsProcessed = Math.max(0, Number(rowsProcessed) || 0);

  if (entry.rowsProcessed === 0 || entry.rowsProcessed % 1000 === 0) {
    emitProgress(exportId, entry.rowsProcessed);
  }
}

/**
 * Complete export and emit final 100% progress.
 * @param {string} exportId
 */
export function completeExport(exportId) {
  if (!exportId) return;

  const entry = activeExports.get(exportId);
  if (!entry) return;

  const finalRows = entry.rowsProcessed;
  emitProgress(exportId, finalRows, true);
  activeExports.delete(exportId);
}

function emitProgress(exportId, rowsProcessed, completed = false) {
  const entry = activeExports.get(exportId);

  const totalEstimate = entry ? entry.totalEstimate : rowsProcessed;
  let percentage = 0;

  if (completed) {
    percentage = 100;
  } else if (totalEstimate > 0) {
    percentage = Math.min(99, Math.round((rowsProcessed / totalEstimate) * 100));
  }

  eventBus.emit('csv_export:progress', {
    exportId,
    rowsProcessed,
    totalEstimate,
    percentage,
    completed,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Cleanup stale active export records.
 */
export function cleanupStaleExports() {
  const now = Date.now();
  for (const [exportId, entry] of activeExports) {
    const startedMs = new Date(entry.startedAt).getTime();
    if (now - startedMs > CLEANUP_AFTER_MS) {
      activeExports.delete(exportId);
    }
  }
}

const cleanupTimer = setInterval(cleanupStaleExports, 10 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();

export function getStats() {
  return {
    active: activeExports.size,
    exports: Array.from(activeExports.entries()).map(([exportId, entry]) => ({
      exportId,
      ...entry,
    })),
  };
}

// Test helpers
export const _testHelpers = {
  activeExports,
  emitProgress,
  cleanupStaleExports,
  reset: () => {
    activeExports.clear();
  },
};
