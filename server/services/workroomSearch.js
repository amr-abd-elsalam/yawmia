// ═══════════════════════════════════════════════════════════════
// server/services/workroomSearch.js — Per-Job Workroom Message Search (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Arabic-normalized per-workroom search index.
// Index is acceleration only; fallback full scan is always available.
// Storage: data/workrooms/search-indexes/{jobId}.json
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getFromSetIndex,
  listJSON,
  getCollectionPath,
} from './database.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { rankWorkroomMessages } from './searchRelevance.js';

function isEnabled() {
  return !!(config.WORKROOM_V2 && config.WORKROOM_V2.enabled && config.WORKROOM_V2.searchEnabled);
}

function indexPath(jobId) {
  return getRecordPath('workroom_search_indexes', jobId);
}

function nowIso() {
  return new Date().toISOString();
}

function tokenize(text) {
  const normalized = normalizeArabic(String(text || '').toLowerCase());
  return Array.from(new Set(
    normalized
      .split(/[^\p{L}\p{N}_-]+/gu)
      .map(t => t.trim())
      .filter(t => t.length >= 2 && t.length <= 50)
  ));
}

function normalizeQuery(q) {
  return normalizeArabic(String(q || '').toLowerCase()).trim();
}

function previewText(text) {
  const raw = String(text || '');
  return raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
}

function emptyIndex(jobId) {
  return {
    version: 1,
    jobId,
    tokens: {},
    messageMeta: {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

async function listMessagesForJobRaw(jobId) {
  const ids = await getFromSetIndex(config.DATABASE.indexFiles.messageJobIndex, jobId);
  const results = [];

  if (ids && ids.length > 0) {
    for (const msgId of ids) {
      const msg = await readJSON(getRecordPath('messages', msgId));
      if (msg && msg.jobId === jobId) results.push(msg);
    }
    return results;
  }

  const dir = getCollectionPath('messages');
  const all = await listJSON(dir);
  return all.filter(m => m && m.id && m.id.startsWith('msg_') && m.jobId === jobId);
}

async function visibleMessages(jobId, userId, options = {}) {
  if (userId) {
    const { listByJob } = await import('./messages.js');
    const result = await listByJob(jobId, userId, {
      limit: options.limit || 10000,
      offset: options.offset || 0,
    });
    return result.items || [];
  }

  return await listMessagesForJobRaw(jobId);
}

export async function indexWorkroomMessage(message) {
  if (!isEnabled()) return { indexed: false };
  if (!message || !message.id || !message.jobId) return { indexed: false };
  if (message.source !== 'workroom') return { indexed: false };

  const jobId = message.jobId;
  const filePath = indexPath(jobId);

  try {
    const idx = (await readJSON(filePath)) || emptyIndex(jobId);
    if (!idx.tokens) idx.tokens = {};
    if (!idx.messageMeta) idx.messageMeta = {};

    // Remove stale references for this message before re-indexing.
    for (const token of Object.keys(idx.tokens)) {
      idx.tokens[token] = (idx.tokens[token] || []).filter(id => id !== message.id);
      if (idx.tokens[token].length === 0) delete idx.tokens[token];
    }

    const tokens = tokenize(message.text || '');
    for (const token of tokens) {
      if (!idx.tokens[token]) idx.tokens[token] = [];
      if (!idx.tokens[token].includes(message.id)) idx.tokens[token].push(message.id);
    }

    idx.messageMeta[message.id] = {
      senderId: message.senderId,
      senderRole: message.senderRole,
      createdAt: message.createdAt,
      preview: previewText(message.text),
    };

    idx.updatedAt = nowIso();
    if (!idx.createdAt) idx.createdAt = idx.updatedAt;

    await atomicWrite(filePath, idx);

    eventBus.emit('workroom:search_index_updated', {
      jobId,
      messageId: message.id,
      tokenCount: tokens.length,
      timestamp: idx.updatedAt,
    });

    return { indexed: true, tokenCount: tokens.length };
  } catch (err) {
    logger.warn('workroomSearch: indexWorkroomMessage failed', {
      jobId,
      messageId: message.id,
      error: err.message,
    });
    return { indexed: false, error: err.message };
  }
}

export async function removeWorkroomMessage(jobId, messageId) {
  if (!isEnabled()) return { removed: false };
  if (!jobId || !messageId) return { removed: false };

  const filePath = indexPath(jobId);
  const idx = await readJSON(filePath);
  if (!idx) return { removed: false };

  for (const token of Object.keys(idx.tokens || {})) {
    idx.tokens[token] = idx.tokens[token].filter(id => id !== messageId);
    if (idx.tokens[token].length === 0) delete idx.tokens[token];
  }

  if (idx.messageMeta) delete idx.messageMeta[messageId];
  idx.updatedAt = nowIso();

  await atomicWrite(filePath, idx);
  return { removed: true };
}

export async function rebuildWorkroomSearchIndex(jobId) {
  if (!isEnabled()) return { rebuilt: false, skipped: true };
  if (!jobId) return { rebuilt: false, error: 'jobId required' };

  const idx = emptyIndex(jobId);
  const messages = await listMessagesForJobRaw(jobId);
  const workroomMessages = messages.filter(m => m.source === 'workroom');

  for (let i = 0; i < workroomMessages.length; i++) {
    const msg = workroomMessages[i];
    const tokens = tokenize(msg.text || '');

    for (const token of tokens) {
      if (!idx.tokens[token]) idx.tokens[token] = [];
      if (!idx.tokens[token].includes(msg.id)) idx.tokens[token].push(msg.id);
    }

    idx.messageMeta[msg.id] = {
      senderId: msg.senderId,
      senderRole: msg.senderRole,
      createdAt: msg.createdAt,
      preview: previewText(msg.text),
    };

    if ((i + 1) % 100 === 0) {
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  idx.updatedAt = nowIso();
  await atomicWrite(indexPath(jobId), idx);

  return {
    rebuilt: true,
    jobId,
    messageCount: workroomMessages.length,
    tokenCount: Object.keys(idx.tokens).length,
  };
}

async function indexedSearch(jobId, query) {
  const idx = await readJSON(indexPath(jobId));
  if (!idx || !idx.tokens || !idx.messageMeta) {
    return { fallbackRequired: true, reason: 'missing_or_corrupt_index' };
  }

  const tokens = tokenize(query);
  if (tokens.length === 0) return { ids: [], indexed: true };

  let candidateSet = null;

  for (const token of tokens) {
    const ids = new Set(idx.tokens[token] || []);
    if (candidateSet === null) {
      candidateSet = ids;
    } else {
      candidateSet = new Set([...candidateSet].filter(id => ids.has(id)));
    }
  }

  return {
    ids: Array.from(candidateSet || []),
    indexed: true,
  };
}

async function fullScanSearch(jobId, query, options = {}) {
  const q = normalizeQuery(query);
  const messages = await visibleMessages(jobId, options.userId, { limit: 10000, offset: 0 });

  return messages.filter(msg => {
    const text = normalizeArabic(String(msg.text || '').toLowerCase());
    return text.includes(q);
  });
}

export async function searchWorkroomMessages(jobId, query, options = {}) {
  if (!isEnabled()) {
    return { results: [], total: 0, indexed: false, fallbackUsed: false };
  }

  const q = normalizeQuery(query);
  if (!q || q.length < 2) {
    return { results: [], total: 0, indexed: false, fallbackUsed: false };
  }

  const limit = Math.min(
    config.WORKROOM_V2?.messageSearchMaxResults || 100,
    Math.max(1, parseInt(options.limit) || 50)
  );

  let matchedMessages = [];
  let indexed = false;
  let fallbackUsed = false;

  try {
    const indexedResult = await indexedSearch(jobId, q);

    if (!indexedResult.fallbackRequired) {
      indexed = true;

      const visible = await visibleMessages(jobId, options.userId, { limit: 10000, offset: 0 });
      const visibleById = new Map(visible.map(m => [m.id, m]));
      matchedMessages = (indexedResult.ids || [])
        .map(id => visibleById.get(id))
        .filter(Boolean)
        .filter(msg => normalizeArabic(String(msg.text || '').toLowerCase()).includes(q));
    } else {
      fallbackUsed = true;
      matchedMessages = await fullScanSearch(jobId, q, options);
    }
  } catch (err) {
    logger.warn('workroomSearch: indexed search failed, using fallback', {
      jobId,
      error: err.message,
    });
    fallbackUsed = true;
    matchedMessages = await fullScanSearch(jobId, q, options);
  }

  // Phase 56: relevance ranking. Falls back to newest-first if disabled/fails.
  try {
    let pinnedIds = new Set();
    try {
      const { listPins } = await import('./workroomPins.js');
      const pinsResult = await listPins(jobId, options.userId || null).catch(() => null);
      const pins = (pinsResult && pinsResult.pins) || [];
      pinnedIds = new Set(pins.map(p => p.messageId).filter(Boolean));
    } catch (_) {
      pinnedIds = new Set();
    }

    matchedMessages = rankWorkroomMessages(matchedMessages, q, { pinnedIds });
  } catch (_) {
    matchedMessages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const total = matchedMessages.length;
  const results = matchedMessages.slice(0, limit).map(msg => ({
    id: msg.id,
    jobId: msg.jobId,
    senderId: msg.senderId,
    senderRole: msg.senderRole,
    text: msg.text,
    preview: previewText(msg.text),
    createdAt: msg.createdAt,
    source: msg.source || 'job_messages',
    templateKey: msg.templateKey || null,
    attachments: msg.attachments || [],
    _score: typeof msg._score === 'number' ? msg._score : undefined,
    _highlights: Array.isArray(msg._highlights) ? msg._highlights : undefined,
  }));

  // Phase 56: adoption/search usage event — aggregate only, no message text.
  try {
    eventBus.emit('workroom:search_used', {
      jobId,
      userId: options.userId || null,
      resultCount: total,
      indexed,
      fallbackUsed,
      timestamp: nowIso(),
    });
  } catch (_) { /* fire-and-forget */ }

  return {
    results,
    total,
    limit,
    indexed,
    fallbackUsed,
  };
}

export async function getWorkroomSearchStats(jobId) {
  if (!isEnabled()) return { enabled: false };

  const idx = await readJSON(indexPath(jobId));
  if (!idx) {
    return { enabled: true, status: 'missing', tokenCount: 0, messageCount: 0, updatedAt: null };
  }

  return {
    enabled: true,
    status: 'healthy',
    tokenCount: Object.keys(idx.tokens || {}).length,
    messageCount: Object.keys(idx.messageMeta || {}).length,
    updatedAt: idx.updatedAt || null,
  };
}

export const _testHelpers = {
  isEnabled,
  indexPath,
  tokenize,
  normalizeQuery,
  previewText,
  emptyIndex,
  listMessagesForJobRaw,
  indexedSearch,
  fullScanSearch,
};
