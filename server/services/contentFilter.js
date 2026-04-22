// ═══════════════════════════════════════════════════════════════
// server/services/contentFilter.js — Keyword Content Filtering
// ═══════════════════════════════════════════════════════════════
// Arabic-normalized blocklist matching + phone number detection.
// Scoring: 0.0 (clean) → 1.0 (definitely unsafe).
// Conservative — false positives worse than false negatives.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { normalizeArabic } from './arabicNormalizer.js';
import { logger } from './logger.js';

// ── Phone number detection regex (Egyptian format) ───────────
// Matches: 01012345678, 01112345678, 01212345678, 01512345678
// Also matches with dashes/spaces: 010-1234-5678, 010 1234 5678
const PHONE_REGEX = /01[0125][\s\-]?\d{4}[\s\-]?\d{4}/;

// ── Blocklist (pre-normalized Arabic terms) ──────────────────
// Categories: harassment, fraud, contact_info bypass
// Each term: { normalized: string, weight: number, category: string }
const RAW_BLOCKLIST = [
  // Harassment / offensive (weight 0.3–0.5)
  { term: 'نصاب', weight: 0.4, category: 'fraud' },
  { term: 'محتال', weight: 0.4, category: 'fraud' },
  { term: 'نصب', weight: 0.35, category: 'fraud' },
  { term: 'احتيال', weight: 0.4, category: 'fraud' },
  { term: 'سرقه', weight: 0.35, category: 'fraud' },
  { term: 'حرامي', weight: 0.35, category: 'fraud' },
  { term: 'تحرش', weight: 0.5, category: 'harassment' },
  { term: 'شتيمه', weight: 0.4, category: 'harassment' },
  { term: 'سب', weight: 0.3, category: 'harassment' },
  { term: 'ضرب', weight: 0.3, category: 'harassment' },
  { term: 'تهديد', weight: 0.4, category: 'harassment' },
  // Contact info bypass indicators (weight 0.5)
  { term: 'واتساب', weight: 0.5, category: 'contact_info' },
  { term: 'واتس', weight: 0.5, category: 'contact_info' },
  { term: 'whatsapp', weight: 0.5, category: 'contact_info' },
  { term: 'تليجرام', weight: 0.5, category: 'contact_info' },
  { term: 'telegram', weight: 0.5, category: 'contact_info' },
  { term: 'كلمني على', weight: 0.4, category: 'contact_info' },
  { term: 'رقمي', weight: 0.3, category: 'contact_info' },
];

// Pre-normalize blocklist terms (once at module load)
const BLOCKLIST = RAW_BLOCKLIST.map(entry => ({
  normalized: normalizeArabic(entry.term.toLowerCase()),
  weight: entry.weight,
  category: entry.category,
  original: entry.term,
}));

/**
 * Check content for unsafe terms and phone numbers.
 *
 * @param {*} text — input text (any type, non-strings return safe)
 * @returns {{ safe: boolean, score: number, flaggedTerms: string[] }}
 *   safe: true if score < blockThreshold (or feature disabled)
 *   score: 0.0 (clean) → 1.0 (definitely unsafe)
 *   flaggedTerms: array of matched term labels
 */
export function checkContent(text) {
  // Feature flag
  if (!config.CONTENT_FILTER || !config.CONTENT_FILTER.enabled) {
    return { safe: true, score: 0, flaggedTerms: [] };
  }

  // Null/empty/non-string → safe
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { safe: true, score: 0, flaggedTerms: [] };
  }

  const blockThreshold = config.CONTENT_FILTER.blockThreshold;
  const warnThreshold = config.CONTENT_FILTER.warnThreshold;

  let score = 0;
  const flaggedTerms = [];

  // 1. Phone number detection (on raw text — numbers don't need normalization)
  if (PHONE_REGEX.test(text)) {
    score += 0.8;
    flaggedTerms.push('رقم تليفون');
  }

  // 2. Blocklist matching (on normalized text)
  const normalizedText = normalizeArabic(text.toLowerCase());

  for (const entry of BLOCKLIST) {
    if (normalizedText.includes(entry.normalized)) {
      score += entry.weight;
      flaggedTerms.push(entry.original);
    }
  }

  // Cap score at 1.0
  score = Math.min(score, 1.0);
  score = Math.round(score * 100) / 100;

  const safe = score < blockThreshold;

  // Log flagged content
  if (config.CONTENT_FILTER.logFlagged && score >= warnThreshold) {
    logger.warn('Content filter flagged', {
      score,
      safe,
      flaggedTerms,
      textPreview: text.substring(0, 100),
    });
  }

  return { safe, score, flaggedTerms };
}

/**
 * Convenience: check if content is safe (boolean).
 *
 * @param {*} text
 * @returns {boolean} true if safe
 */
export function isContentSafe(text) {
  return checkContent(text).safe;
}
