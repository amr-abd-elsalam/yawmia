// ═══════════════════════════════════════════════════════════════
// server/services/arabicNormalizer.js — Arabic Text Normalization
// ═══════════════════════════════════════════════════════════════
// Pure functions — zero dependencies, zero I/O.
// Normalizes Arabic text for improved search matching:
//   - Removes diacritics (tashkeel)
//   - Normalizes hamza variants (أ إ آ ٱ → ا)
//   - Normalizes taa marbuta (ة → ه)
//   - Normalizes alef maksura (ى → ي)
//   - Removes tatweel (kashida ـ)
//   - Normalizes whitespace
// ═══════════════════════════════════════════════════════════════

/**
 * Normalize Arabic text for search matching.
 * Handles common variations that should be treated as equivalent.
 *
 * @param {*} text — input text (any type, non-strings return '')
 * @returns {string} normalized text
 */
export function normalizeArabic(text) {
  if (!text || typeof text !== 'string') return '';

  let normalized = text;

  // Step 1: Remove Arabic diacritics (tashkeel)
  // U+0610-U+061A: Arabic sign ranges
  // U+064B-U+065F: Arabic fathatan through wavy hamza below
  // U+0670: Arabic letter superscript alef
  normalized = normalized.replace(/[\u0610-\u061A\u064B-\u065F\u0670]/g, '');

  // Step 2: Normalize hamza variants → bare alef (ا)
  // أ (U+0623) — alef with hamza above
  // إ (U+0625) — alef with hamza below
  // آ (U+0622) — alef with madda above
  // ٱ (U+0671) — alef wasla
  normalized = normalized.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');

  // Step 3: Normalize taa marbuta → haa
  // ة (U+0629) → ه (U+0647)
  normalized = normalized.replace(/\u0629/g, '\u0647');

  // Step 4: Normalize alef maksura → yaa
  // ى (U+0649) → ي (U+064A)
  normalized = normalized.replace(/\u0649/g, '\u064A');

  // Step 5: Remove tatweel (kashida)
  // ـ (U+0640)
  normalized = normalized.replace(/\u0640/g, '');

  // Step 6: Normalize whitespace (collapse multiple spaces)
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if a string contains Arabic characters.
 * Tests for the Arabic Unicode block (U+0600-U+06FF).
 *
 * @param {*} text — input text
 * @returns {boolean} true if text contains at least one Arabic character
 */
export function hasArabic(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0600-\u06FF]/.test(text);
}
