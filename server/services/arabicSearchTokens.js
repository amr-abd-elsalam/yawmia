// ═══════════════════════════════════════════════════════════════
// server/services/arabicSearchTokens.js — Arabic Search Tokenization V2 (Phase 56)
// ═══════════════════════════════════════════════════════════════
// Deterministic Arabic-first tokenization for marketplace search.
// Builds on arabicNormalizer.js and adds:
//   - Arabic/English/number token extraction
//   - small local stopword list
//   - conservative Arabic light stemming
//   - safe token-set builder
//
// No external dependencies.
// No I/O.
// Never throws on non-string input.
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';
import { normalizeArabic } from './arabicNormalizer.js';

const DEFAULT_STOPWORDS = new Set([
  // Arabic MSA/common
  'في', 'من', 'على', 'عن', 'الى', 'إلى', 'الي', 'او', 'أو', 'و', 'ف', 'ثم',
  'هذا', 'هذه', 'ذلك', 'تلك', 'هناك', 'هنا', 'مع', 'بدون', 'بعد', 'قبل',
  'كل', 'اي', 'أي', 'انا', 'انت', 'هو', 'هي', 'هم', 'احنا', 'نحن',
  // Egyptian/common marketplace phrasing
  'عايز', 'عاوز', 'محتاج', 'مطلوب', 'شغل', 'فرصه', 'فرصة', 'عمل',
  'اليوم', 'بكره', 'بكرة', 'دلوقتي', 'حاليا', 'حالياً',
  // English common
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'with', 'on',
]);

function cfg() {
  return config.ARABIC_SEARCH || {};
}

function minTokenLength() {
  return Math.max(1, Number(cfg().minTokenLength) || 2);
}

function maxTokensPerQuery() {
  return Math.max(1, Number(cfg().maxTokensPerQuery) || 12);
}

function isNumberToken(token) {
  return /^[0-9]+(?:[._-][0-9]+)*$/.test(token);
}

function normalizeDigits(str) {
  if (!str || typeof str !== 'string') return '';

  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹';

  return str.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, ch => {
    const a = arabicIndic.indexOf(ch);
    if (a >= 0) return String(a);
    const e = easternArabicIndic.indexOf(ch);
    if (e >= 0) return String(e);
    return ch;
  });
}

/**
 * Normalize one token for search.
 *
 * @param {*} token
 * @returns {string}
 */
export function normalizeSearchToken(token) {
  if (!token || typeof token !== 'string') return '';

  let t = normalizeDigits(token);
  t = normalizeArabic(t.toLowerCase());
  t = t
    .replace(/[^\p{L}\p{N}_-]+/gu, '')
    .replace(/^[-_]+|[-_]+$/g, '')
    .trim();

  if (!t) return '';

  if (!cfg().preserveNumbers && isNumberToken(t)) return '';

  if (t.length < minTokenLength()) return '';

  if (cfg().lightStemmingEnabled !== false) {
    t = lightStemArabicToken(t);
  }

  if (t.length < minTokenLength()) return '';

  return t;
}

/**
 * Conservative Arabic light stemming.
 * Avoids aggressive stemming to reduce false positives.
 *
 * @param {*} token
 * @returns {string}
 */
export function lightStemArabicToken(token) {
  if (!token || typeof token !== 'string') return '';

  let t = token;

  // Do not stem numbers or very short tokens.
  if (isNumberToken(t) || t.length <= 3) return t;

  // Normalize common feminine ending again after tokenizer normalization.
  // arabicNormalizer already maps ة → ه.
  const suffixes = ['اتها', 'يات', 'ات', 'ين', 'ون', 'ها', 'هم', 'كم', 'نا', 'ه'];
  for (const suffix of suffixes) {
    if (t.length >= suffix.length + 4 && t.endsWith(suffix)) {
      t = t.slice(0, -suffix.length);
      break;
    }
  }

  // Common prefixes. Prefer longer prefix first.
  const prefixes = ['وال', 'فال', 'بال', 'كال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];
  for (const prefix of prefixes) {
    if (t.length >= prefix.length + 4 && t.startsWith(prefix)) {
      t = t.slice(prefix.length);
      break;
    }
  }

  // Avoid returning empty/too-short stems.
  if (t.length < minTokenLength()) return token;
  return t;
}

/**
 * Remove local Arabic/English stopwords.
 *
 * @param {string[]} tokens
 * @returns {string[]}
 */
export function removeArabicStopwords(tokens) {
  if (!Array.isArray(tokens)) return [];
  if (cfg().stopwordsEnabled === false) return tokens.slice();

  return tokens.filter(token => {
    if (!token) return false;
    const normalized = normalizeArabic(String(token).toLowerCase());
    return !DEFAULT_STOPWORDS.has(normalized) && !DEFAULT_STOPWORDS.has(token);
  });
}

/**
 * Tokenize Arabic/English/numeric search text.
 *
 * @param {*} text
 * @param {{ maxTokens?: number, removeStopwords?: boolean, lightStem?: boolean }} options
 * @returns {string[]}
 */
export function tokenizeArabicSearch(text, options = {}) {
  if (!text || typeof text !== 'string') return [];

  const maxTokens = Math.max(1, Number(options.maxTokens) || maxTokensPerQuery());

  const previousLightStem = cfg().lightStemmingEnabled;
  let raw = normalizeDigits(text);
  raw = normalizeArabic(raw.toLowerCase());

  let tokens = raw
    .split(/[^\p{L}\p{N}_-]+/gu)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => {
      if (options.lightStem === false) {
        const normalized = normalizeArabic(normalizeDigits(t).toLowerCase())
          .replace(/[^\p{L}\p{N}_-]+/gu, '')
          .trim();
        return normalized.length >= minTokenLength() ? normalized : '';
      }
      return normalizeSearchToken(t);
    })
    .filter(Boolean);

  tokens = Array.from(new Set(tokens));

  if (options.removeStopwords !== false) {
    tokens = removeArabicStopwords(tokens);
  }

  return tokens.slice(0, maxTokens);
}

/**
 * Build a deterministic Set of search tokens.
 *
 * @param {*} text
 * @param {object} options
 * @returns {Set<string>}
 */
export function buildSearchTokenSet(text, options = {}) {
  return new Set(tokenizeArabicSearch(text, options));
}

export const _testHelpers = {
  DEFAULT_STOPWORDS,
  normalizeDigits,
  isNumberToken,
};
