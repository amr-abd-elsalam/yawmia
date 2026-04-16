// ═══════════════════════════════════════════════════════════════
// server/services/logger.js — Structured Console Logger
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const configLevel = LEVELS[config.LOGGING.level] ?? LEVELS.info;

function formatMessage(level, msg, data) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${msg} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${msg}`;
}

export const logger = {
  error(msg, data = {}) {
    if (configLevel >= LEVELS.error) {
      console.error(formatMessage('error', msg, data));
    }
  },

  warn(msg, data = {}) {
    if (configLevel >= LEVELS.warn) {
      console.warn(formatMessage('warn', msg, data));
    }
  },

  info(msg, data = {}) {
    if (configLevel >= LEVELS.info) {
      console.log(formatMessage('info', msg, data));
    }
  },

  debug(msg, data = {}) {
    if (configLevel >= LEVELS.debug) {
      console.log(formatMessage('debug', msg, data));
    }
  },

  /** Log HTTP request */
  request(req, statusCode, durationMs) {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    this[level](`${req.method} ${req.pathname} ${statusCode}`, {
      requestId: req.id,
      duration: `${durationMs}ms`,
    });
  },
};
