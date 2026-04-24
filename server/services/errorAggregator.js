// ═══════════════════════════════════════════════════════════════
// server/services/errorAggregator.js — Per-Endpoint Error Counting
// ═══════════════════════════════════════════════════════════════
// In-memory Map: endpoint+hour → { count, lastError, lastTimestamp }.
// 24-hour retention. Hourly cleanup. No file persistence.
// ═══════════════════════════════════════════════════════════════

/**
 * @type {Map<string, { count: number, lastError: string, lastTimestamp: string }>}
 * Key format: `${endpoint}::${hourKey}` where hourKey = YYYY-MM-DDTHH
 */
const counters = new Map();

/**
 * Get current hour key (UTC-based for simplicity)
 * @returns {string} e.g. '2026-04-24T09'
 */
function getHourKey() {
  return new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

/**
 * Record an error for an endpoint.
 * @param {string} endpoint — e.g. '/api/jobs'
 * @param {number} statusCode — HTTP status code
 * @param {string} errorMessage — error message
 */
export function recordError(endpoint, statusCode, errorMessage) {
  const hourKey = getHourKey();
  const key = `${endpoint}::${hourKey}`;

  const entry = counters.get(key);
  if (entry) {
    entry.count++;
    entry.lastError = errorMessage || 'Unknown error';
    entry.lastTimestamp = new Date().toISOString();
    entry.statusCode = statusCode;
  } else {
    counters.set(key, {
      count: 1,
      endpoint,
      hourKey,
      statusCode,
      lastError: errorMessage || 'Unknown error',
      lastTimestamp: new Date().toISOString(),
    });
  }
}

/**
 * Get error summary for the last 24 hours.
 * Aggregated by endpoint (summing across hours).
 * Sorted by total count descending.
 *
 * @returns {{ totalErrors: number, endpoints: Array<{ endpoint: string, count: number, lastError: string, lastTimestamp: string }> }}
 */
export function getErrorSummary() {
  // Aggregate by endpoint across all hour slots
  /** @type {Map<string, { count: number, lastError: string, lastTimestamp: string }>} */
  const aggregated = new Map();
  let totalErrors = 0;

  for (const [, entry] of counters) {
    totalErrors += entry.count;
    const existing = aggregated.get(entry.endpoint);
    if (existing) {
      existing.count += entry.count;
      // Keep the most recent error
      if (entry.lastTimestamp > existing.lastTimestamp) {
        existing.lastError = entry.lastError;
        existing.lastTimestamp = entry.lastTimestamp;
      }
    } else {
      aggregated.set(entry.endpoint, {
        endpoint: entry.endpoint,
        count: entry.count,
        lastError: entry.lastError,
        lastTimestamp: entry.lastTimestamp,
      });
    }
  }

  // Sort by count descending
  const endpoints = Array.from(aggregated.values())
    .sort((a, b) => b.count - a.count);

  return { totalErrors, endpoints };
}

/**
 * Remove entries older than 24 hours.
 */
export function cleanup() {
  const now = new Date();
  const cutoffHour = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 13);

  for (const [key, entry] of counters) {
    if (entry.hourKey < cutoffHour) {
      counters.delete(key);
    }
  }
}

/**
 * Clear all counters (for testing).
 */
export function clear() {
  counters.clear();
}

// ── Cleanup Timer (hourly, unref'd) ─────────────────────────
const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
if (cleanupTimer.unref) cleanupTimer.unref();
