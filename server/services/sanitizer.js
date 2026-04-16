// ═══════════════════════════════════════════════════════════════
// server/services/sanitizer.js — Input Sanitization Service
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

/**
 * Strip all HTML tags from a string
 * @param {*} text
 * @returns {*} cleaned string or original value if not a string
 */
export function stripHtml(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a text value — strip HTML tags + trim
 * Respects config.SECURITY.sanitizeInput flag
 * @param {*} text
 * @returns {*} sanitized string or original value if not a string
 */
export function sanitizeText(text) {
  if (typeof text !== 'string') return text;
  if (!config.SECURITY.sanitizeInput) return text;
  return stripHtml(text).trim();
}

/**
 * Sanitize specific fields in an object (shallow copy)
 * @param {object} obj - the object to sanitize
 * @param {string[]} keys - field names to sanitize
 * @returns {object} new object with sanitized fields
 */
export function sanitizeFields(obj, keys) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = { ...obj };
  for (const key of keys) {
    if (typeof result[key] === 'string') {
      result[key] = sanitizeText(result[key]);
    }
  }
  return result;
}
