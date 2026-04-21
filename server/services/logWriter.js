// ═══════════════════════════════════════════════════════════════
// server/services/logWriter.js — Append-Only Log File Writer
// ═══════════════════════════════════════════════════════════════
// Daily rotation by Egypt timezone (UTC+2).
// Fire-and-forget — NEVER throws, NEVER imports logger.js.
// Writes to: {filePath}/yawmia-YYYY-MM-DD.log
// ═══════════════════════════════════════════════════════════════

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import config from '../../config.js';

/** @type {boolean} */
let dirCreated = false;

/**
 * Get current date string in Egypt timezone (UTC+2) — YYYY-MM-DD
 * Egypt abolished DST in 2014 — always UTC+2
 * @returns {string}
 */
function getEgyptDateString() {
  const now = new Date();
  const egyptMs = now.getTime() + (2 * 60 * 60 * 1000);
  const egyptDate = new Date(egyptMs);
  const y = egyptDate.getUTCFullYear();
  const m = String(egyptDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(egyptDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get the log file path for today.
 * @returns {string}
 */
function getLogFilePath() {
  const logDir = (config.LOGGING && config.LOGGING.filePath) || './logs';
  const dateStr = getEgyptDateString();
  return join(logDir, `yawmia-${dateStr}.log`);
}

/**
 * Ensure log directory exists (once per process).
 */
async function ensureDir() {
  if (dirCreated) return;
  try {
    const logDir = (config.LOGGING && config.LOGGING.filePath) || './logs';
    await mkdir(logDir, { recursive: true });
    dirCreated = true;
  } catch (_) {
    // Directory creation failure — will retry next call
  }
}

/**
 * Append a message to today's log file.
 * Fire-and-forget — NEVER throws.
 * @param {string} message — pre-formatted log line (should include \n)
 */
export function append(message) {
  // Feature flag check
  if (!config.LOGGING || !config.LOGGING.fileEnabled) return;

  // Fire-and-forget async operation
  (async () => {
    try {
      await ensureDir();
      const filePath = getLogFilePath();
      await appendFile(filePath, message, 'utf-8');
    } catch (_) {
      // NEVER throw — log writer failure is non-fatal
      // Fallback: silent — console output still works via logger.js
    }
  })();
}
