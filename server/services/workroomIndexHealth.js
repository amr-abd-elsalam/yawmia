// ═══════════════════════════════════════════════════════════════
// server/services/workroomIndexHealth.js — Workroom Search Verify (Phase 55)
// ═══════════════════════════════════════════════════════════════
// Verifies per-job workroom search indexes.
// Index remains acceleration only; rebuild is safe and source-of-truth is messages.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import {
  rebuildWorkroomSearchIndex,
  searchWorkroomMessages,
} from './workroomSearch.js';

function isEnabled() {
  return !!(
    config.WORKROOM_V2 &&
    config.WORKROOM_V2.enabled &&
    config.WORKROOM_V2.searchEnabled
  );
}

function nowIso() {
  return new Date().toISOString();
}

function tokenize(text) {
  return Array.from(new Set(
    normalizeArabic(String(text || '').toLowerCase())
      .split(/[^\p{L}\p{N}_-]+/gu)
      .map(t => t.trim())
      .filter(t => t.length >= 2 && t.length <= 50)
  ));
}

async function listMessagesForJob(jobId) {
  const dir = getCollectionPath('messages');
  const all = await listJSON(dir);
  return all.filter(m =>
    m &&
    m.id &&
    m.id.startsWith('msg_') &&
    m.jobId === jobId &&
    m.source === 'workroom'
  );
}

async function listAllWorkroomJobIds() {
  const ids = new Set();

  try {
    const messages = await listJSON(getCollectionPath('messages'));
    for (const m of messages) {
      if (m && m.jobId && m.source === 'workroom') ids.add(m.jobId);
    }
  } catch (_) {}

  try {
    const workrooms = await listJSON(getCollectionPath('workrooms'));
    for (const w of workrooms) {
      if (w && w.jobId) ids.add(w.jobId);
      else if (w && w.id && w.id.startsWith('job_')) ids.add(w.id);
    }
  } catch (_) {}

  return Array.from(ids);
}

/**
 * Verify one workroom search index.
 *
 * @param {string} jobId
 * @param {{ sampleSize?: number }} options
 */
export async function verifyWorkroomSearchIndex(jobId, options = {}) {
  if (!isEnabled()) {
    return { enabled: false, jobId, ok: true, warnings: [] };
  }

  const warnings = [];
  const errors = [];

  if (!jobId || typeof jobId !== 'string') {
    return { enabled: true, jobId: null, ok: false, errors: ['jobId required'], warnings: [] };
  }

  const idx = await readJSON(getRecordPath('workroom_search_indexes', jobId));
  const messages = await listMessagesForJob(jobId);
  const messageIds = new Set(messages.map(m => m.id));

  if (!idx) {
    if (messages.length > 0) {
      warnings.push('missing search index for workroom messages');
    }
    return {
      enabled: true,
      jobId,
      ok: true,
      status: warnings.length > 0 ? 'warnings' : 'healthy',
      messageCount: messages.length,
      tokenCount: 0,
      warnings,
      errors,
      missing: true,
      checkedAt: nowIso(),
    };
  }

  const tokens = idx.tokens || {};
  const meta = idx.messageMeta || {};

  // 1. Token references must point to existing messages.
  let staleTokenRefs = 0;
  for (const [token, ids] of Object.entries(tokens)) {
    if (!Array.isArray(ids)) {
      errors.push(`token ${token} ids is not an array`);
      continue;
    }

    for (const id of ids) {
      if (!messageIds.has(id)) staleTokenRefs++;
    }
  }

  if (staleTokenRefs > 0) {
    warnings.push(`stale token refs: ${staleTokenRefs}`);
  }

  // 2. Meta references must point to existing messages.
  let staleMetaRefs = 0;
  for (const id of Object.keys(meta)) {
    if (!messageIds.has(id)) staleMetaRefs++;
  }

  if (staleMetaRefs > 0) {
    warnings.push(`stale messageMeta refs: ${staleMetaRefs}`);
  }

  // 3. Sample messages should be represented in token index.
  const sampleSize = Math.min(
    Math.max(1, parseInt(options.sampleSize) || config.WORKROOM_HYGIENE?.searchVerifySampleSize || 50),
    messages.length
  );

  const sample = messages.slice(0, sampleSize);
  let missingIndexedMessages = 0;
  let failedSearchSamples = 0;

  for (const msg of sample) {
    const msgTokens = tokenize(msg.text || '');
    if (msgTokens.length === 0) continue;

    const represented = msgTokens.some(t => Array.isArray(tokens[t]) && tokens[t].includes(msg.id));
    if (!represented) {
      missingIndexedMessages++;
      continue;
    }

    // Query first token and ensure message can be found using raw visibility mode.
    const query = msgTokens[0];
    try {
      const result = await searchWorkroomMessages(jobId, query, { limit: 100 });
      const found = (result.results || []).some(r => r.id === msg.id);
      if (!found) failedSearchSamples++;
    } catch (_) {
      failedSearchSamples++;
    }
  }

  if (missingIndexedMessages > 0) {
    warnings.push(`sample messages missing from index: ${missingIndexedMessages}`);
  }

  if (failedSearchSamples > 0) {
    warnings.push(`sample searches failed: ${failedSearchSamples}`);
  }

  const result = {
    enabled: true,
    jobId,
    ok: errors.length === 0,
    status: errors.length > 0 ? 'failed' : (warnings.length > 0 ? 'warnings' : 'healthy'),
    messageCount: messages.length,
    tokenCount: Object.keys(tokens).length,
    indexedMessageCount: Object.keys(meta).length,
    staleTokenRefs,
    staleMetaRefs,
    missingIndexedMessages,
    failedSearchSamples,
    warnings,
    errors,
    checkedAt: nowIso(),
  };

  eventBus.emit('workroom_search:verified', {
    jobId,
    status: result.status,
    warningCount: warnings.length,
    errorCount: errors.length,
    timestamp: result.checkedAt,
  });

  return result;
}

/**
 * Verify all known workroom search indexes.
 */
export async function verifyAllWorkroomSearchIndexes(options = {}) {
  if (!isEnabled()) return { enabled: false, ok: true, results: [] };

  const jobIds = (options.jobIds || await listAllWorkroomJobIds()).slice(0, options.limit || 1000);

  let healthy = 0;
  let warnings = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < jobIds.length; i++) {
    try {
      const r = await verifyWorkroomSearchIndex(jobIds[i], options);
      results.push(r);

      if (r.status === 'healthy') healthy++;
      else if (r.status === 'warnings') warnings++;
      else failed++;
    } catch (err) {
      failed++;
      results.push({
        jobId: jobIds[i],
        status: 'failed',
        ok: false,
        errors: [err.message],
      });
    }

    if ((i + 1) % 50 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  return {
    enabled: true,
    ok: failed === 0,
    total: jobIds.length,
    healthy,
    warnings,
    failed,
    results: results.slice(0, options.includeResults === false ? 0 : 200),
    checkedAt: nowIso(),
  };
}

/**
 * Repair/rebuild one workroom search index.
 */
export async function repairWorkroomSearchIndex(jobId) {
  if (!isEnabled()) return { enabled: false, rebuilt: false, skipped: true };
  if (!jobId) return { ok: false, error: 'jobId required' };

  const before = await verifyWorkroomSearchIndex(jobId).catch(err => ({
    ok: false,
    status: 'failed',
    errors: [err.message],
  }));

  const rebuild = await rebuildWorkroomSearchIndex(jobId);

  const after = await verifyWorkroomSearchIndex(jobId).catch(err => ({
    ok: false,
    status: 'failed',
    errors: [err.message],
  }));

  const result = {
    ok: after.ok,
    jobId,
    before,
    rebuild,
    after,
    repairedAt: nowIso(),
  };

  eventBus.emit('workroom_search:repair_completed', {
    jobId,
    beforeStatus: before.status,
    afterStatus: after.status,
    timestamp: result.repairedAt,
  });

  return result;
}

export const _testHelpers = {
  isEnabled,
  tokenize,
  listMessagesForJob,
  listAllWorkroomJobIds,
};
