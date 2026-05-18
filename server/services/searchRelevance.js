// ═══════════════════════════════════════════════════════════════
// server/services/searchRelevance.js — Weighted Search Relevance (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Pure-ish relevance scoring for jobs and workroom messages.
// No external search dependency.
// Designed as additive ranking layer on top of existing candidate filtering.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { normalizeArabic } from './arabicNormalizer.js';
import {
  tokenizeArabicSearch,
  buildSearchTokenSet,
} from './arabicSearchTokens.js';

function isEnabled() {
  return !!(
    config.SEARCH_RELEVANCE &&
    config.SEARCH_RELEVANCE.enabled &&
    config.SEARCH_RELEVANCE.useWeightedRanking
  );
}

function weights() {
  return (config.SEARCH_RELEVANCE && config.SEARCH_RELEVANCE.weights) || {};
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function roundScore(n) {
  return Math.round(clamp01(n) * 1000) / 1000;
}

function tokenOverlapScore(queryTokens, fieldTokens) {
  if (!queryTokens || queryTokens.size === 0 || !fieldTokens || fieldTokens.size === 0) return 0;

  let matched = 0;
  for (const token of queryTokens) {
    if (fieldTokens.has(token)) matched++;
  }

  return matched / queryTokens.size;
}

function normalizedText(text) {
  return normalizeArabic(String(text || '').toLowerCase()).trim();
}

function recencyBoost(createdAt) {
  if (!createdAt) return 0;

  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return 0;

  const ageHours = Math.max(0, (Date.now() - createdMs) / 3600000);
  const halfLife = Math.max(1, Number(config.SEARCH_RELEVANCE?.recencyHalfLifeHours) || 72);

  // Exponential half-life: 1 at now, 0.5 at halfLife, etc.
  return Math.pow(0.5, ageHours / halfLife);
}

function urgencyBoost(urgency) {
  if (urgency === 'immediate') return 1;
  if (urgency === 'urgent') return 0.65;
  return 0;
}

function wageFitScore(job, filters = {}) {
  const wage = Number(job && job.dailyWage);
  if (!Number.isFinite(wage) || wage <= 0) return 0;

  const minWage = filters.minWage !== undefined ? Number(filters.minWage) : null;
  const maxWage = filters.maxWage !== undefined ? Number(filters.maxWage) : null;

  if (Number.isFinite(minWage) && wage < minWage) return 0;
  if (Number.isFinite(maxWage) && wage > maxWage) return 0;

  if (Number.isFinite(minWage) || Number.isFinite(maxWage)) return 1;

  // No explicit wage filter: slight normalized preference for healthy wage range.
  const cfg = config.FINANCIALS || {};
  const min = Number(cfg.minDailyWage) || 150;
  const max = Number(cfg.maxDailyWage) || 1000;

  return clamp01((wage - min) / Math.max(1, max - min));
}

function makeReason(label, weight, score) {
  return {
    label,
    weight: Math.round((weight || 0) * 1000) / 1000,
    score: Math.round((score || 0) * 1000) / 1000,
  };
}

/**
 * Explain job search score in safe Arabic microcopy.
 *
 * @param {object} job
 * @param {string} query
 * @param {object} filters
 * @returns {string[]}
 */
export function explainJobSearchScore(job, query, filters = {}) {
  const scored = scoreJobSearchResult(job, query, filters, { includeDetails: true });
  return scored.reasons.map(r => r.label).slice(0, 5);
}

/**
 * Score a job search result.
 *
 * @param {object} job
 * @param {string} query
 * @param {object} filters
 * @param {{ includeDetails?: boolean }} options
 * @returns {{ score: number, reasons: object[] }}
 */
export function scoreJobSearchResult(job, query, filters = {}, options = {}) {
  if (!job || !query || typeof query !== 'string') {
    return { score: 0, reasons: [] };
  }

  const w = weights();

  const qNorm = normalizedText(query);
  const titleNorm = normalizedText(job.title);
  const descNorm = normalizedText(job.description);

  const queryTokens = buildSearchTokenSet(query);
  const titleTokens = buildSearchTokenSet(job.title || '');
  const descTokens = buildSearchTokenSet(job.description || '');

  let total = 0;
  const reasons = [];

  const exactTitle = qNorm && titleNorm && titleNorm.includes(qNorm) ? 1 : 0;
  if (exactTitle > 0) {
    const part = (w.exactTitleMatch || 0) * exactTitle;
    total += part;
    reasons.push(makeReason('العنوان مطابق للبحث', w.exactTitleMatch || 0, exactTitle));
  }

  const titleOverlap = tokenOverlapScore(queryTokens, titleTokens);
  if (titleOverlap > 0) {
    const part = (w.titleTokenMatch || 0) * titleOverlap;
    total += part;
    reasons.push(makeReason('كلمات البحث موجودة في العنوان', w.titleTokenMatch || 0, titleOverlap));
  }

  const descOverlap = tokenOverlapScore(queryTokens, descTokens);
  if (descOverlap > 0) {
    const part = (w.descriptionTokenMatch || 0) * descOverlap;
    total += part;
    reasons.push(makeReason('الوصف يحتوي على كلمات مناسبة', w.descriptionTokenMatch || 0, descOverlap));
  }

  if (filters.category && job.category === filters.category) {
    total += (w.categoryMatch || 0);
    reasons.push(makeReason('التخصص مطابق', w.categoryMatch || 0, 1));
  } else if (filters.categories) {
    const cats = String(filters.categories).split(',').map(s => s.trim()).filter(Boolean);
    if (cats.includes(job.category)) {
      total += (w.categoryMatch || 0);
      reasons.push(makeReason('التخصص ضمن اختياراتك', w.categoryMatch || 0, 1));
    }
  }

  if (filters.governorate && job.governorate === filters.governorate) {
    total += (w.governorateMatch || 0);
    reasons.push(makeReason('المحافظة مطابقة', w.governorateMatch || 0, 1));
  }

  const urg = urgencyBoost(job.urgency || 'normal');
  if (urg > 0) {
    total += (w.urgencyBoost || 0) * urg;
    reasons.push(makeReason(job.urgency === 'immediate' ? 'فرصة فورية' : 'فرصة عاجلة', w.urgencyBoost || 0, urg));
  }

  const rec = recencyBoost(job.createdAt);
  if (rec > 0) {
    total += (w.recencyBoost || 0) * rec;
    if (rec >= 0.5) {
      reasons.push(makeReason('فرصة حديثة', w.recencyBoost || 0, rec));
    }
  }

  const wage = wageFitScore(job, filters);
  if (wage > 0) {
    total += (w.wageFit || 0) * wage;
    if (filters.minWage !== undefined || filters.maxWage !== undefined) {
      reasons.push(makeReason('الأجر مناسب للفلاتر', w.wageFit || 0, wage));
    }
  }

  reasons.sort((a, b) => (b.weight * b.score) - (a.weight * a.score));

  return {
    score: roundScore(total),
    reasons: options.includeDetails ? reasons : reasons.slice(0, 5),
  };
}

/**
 * Rank job search results by weighted relevance.
 * If relevance is disabled or no query, preserves input order.
 *
 * @param {object[]} jobs
 * @param {string} query
 * @param {object} filters
 * @param {{ explain?: boolean }} options
 * @returns {object[]}
 */
export function rankJobSearchResults(jobs, query, filters = {}, options = {}) {
  if (!Array.isArray(jobs)) return [];
  if (!isEnabled() || !query) return jobs.slice();

  const ranked = jobs.map((job, idx) => {
    const scored = scoreJobSearchResult(job, query, filters, { includeDetails: true });
    return {
      job,
      idx,
      score: scored.score,
      reasons: scored.reasons,
    };
  });

  ranked.sort((a, b) =>
    b.score - a.score ||
    new Date(b.job.createdAt || 0) - new Date(a.job.createdAt || 0) ||
    a.idx - b.idx
  );

  const max = config.SEARCH_RELEVANCE?.maxResults || 200;

  return ranked.slice(0, max).map(row => {
    const out = { ...row.job, _relevanceScore: row.score };
    if (options.explain !== false) {
      out._relevanceReasons = row.reasons.map(r => r.label).slice(0, 5);
    }
    return out;
  });
}

/**
 * Score one workroom message for search relevance.
 *
 * @param {object} message
 * @param {string} query
 * @param {{ pinnedIds?: Set<string>|string[] }} options
 */
export function scoreWorkroomMessageSearchResult(message, query, options = {}) {
  if (!message || !query) return { score: 0, highlights: [] };

  const qNorm = normalizedText(query);
  const textNorm = normalizedText(message.text || '');

  const queryTokens = buildSearchTokenSet(query);
  const textTokens = buildSearchTokenSet(message.text || '');

  let score = 0;
  const highlights = [];

  if (qNorm && textNorm.includes(qNorm)) {
    score += 0.45;
    highlights.push('تطابق مباشر مع نص البحث');
  }

  const overlap = tokenOverlapScore(queryTokens, textTokens);
  if (overlap > 0) {
    score += 0.30 * overlap;
    highlights.push('كلمات البحث موجودة في الرسالة');
  }

  const rec = recencyBoost(message.createdAt);
  if (rec > 0) {
    score += 0.15 * rec;
    if (rec >= 0.5) highlights.push('رسالة حديثة');
  }

  let pinnedIds = options.pinnedIds || new Set();
  if (Array.isArray(pinnedIds)) pinnedIds = new Set(pinnedIds);
  if (pinnedIds instanceof Set && pinnedIds.has(message.id)) {
    score += 0.10;
    highlights.push('رسالة مثبتة');
  }

  return {
    score: roundScore(score),
    highlights: Array.from(new Set(highlights)).slice(0, 4),
  };
}

/**
 * Rank workroom messages by relevance.
 *
 * @param {object[]} messages
 * @param {string} query
 * @param {object} options
 * @returns {object[]}
 */
export function rankWorkroomMessages(messages, query, options = {}) {
  if (!Array.isArray(messages)) return [];
  if (!isEnabled() || !query) return messages.slice();

  const ranked = messages.map((msg, idx) => {
    const scored = scoreWorkroomMessageSearchResult(msg, query, options);
    return { msg, idx, score: scored.score, highlights: scored.highlights };
  });

  ranked.sort((a, b) =>
    b.score - a.score ||
    new Date(b.msg.createdAt || 0) - new Date(a.msg.createdAt || 0) ||
    a.idx - b.idx
  );

  return ranked.map(row => ({
    ...row.msg,
    _score: row.score,
    _highlights: row.highlights,
  }));
}

export const _testHelpers = {
  isEnabled,
  clamp01,
  tokenOverlapScore,
  recencyBoost,
  urgencyBoost,
  wageFitScore,
  normalizedText,
};
