// ═══════════════════════════════════════════════════════════════
// server/services/logger.js — Structured Console Logger
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const configLevel = LEVELS[config.LOGGING.level] ?? LEVELS.info;

// Lazy logWriter singleton — avoids top-level await / circular deps
let _logWriter = null;
let _logWriterLoaded = false;
function writeToFile(formatted) {
  if (_logWriterLoaded) {
    if (_logWriter) _logWriter.append(formatted + '\n');
    return;
  }
  _logWriterLoaded = true;
  import('./logWriter.js').then(mod => {
    _logWriter = mod;
    _logWriter.append(formatted + '\n');
  }).catch(() => { _logWriter = null; });
}

function formatMessage(level, msg, data) {
  const timestamp = new Date().toISOString();
  // JSON output in production — parseable by log aggregation tools (ELK, CloudWatch, Datadog)
  if (config.ENV && config.ENV.isProduction) {
    const entry = { timestamp, level, msg };
    if (data && Object.keys(data).length > 0) Object.assign(entry, data);
    return JSON.stringify(entry);
  }
  // Development: human-readable format
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${msg} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${msg}`;
}

export const logger = {
  error(msg, data = {}) {
    if (configLevel >= LEVELS.error) {
      const formatted = formatMessage('error', msg, data);
      console.error(formatted);
      writeToFile(formatted);
    }
  },

  warn(msg, data = {}) {
    if (configLevel >= LEVELS.warn) {
      const formatted = formatMessage('warn', msg, data);
      console.warn(formatted);
      writeToFile(formatted);
    }
  },

  info(msg, data = {}) {
    if (configLevel >= LEVELS.info) {
      const formatted = formatMessage('info', msg, data);
      console.log(formatted);
      writeToFile(formatted);
    }
  },

  debug(msg, data = {}) {
    if (configLevel >= LEVELS.debug) {
      const formatted = formatMessage('debug', msg, data);
      console.log(formatted);
      writeToFile(formatted);
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
