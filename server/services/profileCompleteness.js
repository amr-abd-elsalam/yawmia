// ═══════════════════════════════════════════════════════════════
// server/services/profileCompleteness.js — Profile Completeness Score
// ═══════════════════════════════════════════════════════════════
// Pure function — zero I/O, zero async, zero database access.
// Weights: name(20) + governorate(20) + categories(20) + location(15) + verification(15) + terms(10) = 100
// ═══════════════════════════════════════════════════════════════

const FIELD_LABELS = {
  name: 'الاسم',
  governorate: 'المحافظة',
  categories: 'التخصصات',
  location: 'الموقع الجغرافي',
  verification: 'التحقق من الهوية',
  terms: 'قبول الشروط والأحكام',
};

/**
 * Calculate profile completeness score.
 * Pure sync function — no I/O, no imports needed beyond this file.
 *
 * @param {object} user — user object from database
 * @returns {{ score: number, missing: string[], complete: boolean }}
 *   score: 0–100 integer
 *   missing: array of field keys that are incomplete
 *   complete: true if score >= 100
 */
export function calculateCompleteness(user) {
  if (!user) return { score: 0, missing: Object.keys(FIELD_LABELS), complete: false };

  const missing = [];
  let score = 0;

  // Name (20%)
  if (user.name && typeof user.name === 'string' && user.name.trim().length >= 2) {
    score += 20;
  } else {
    missing.push('name');
  }

  // Governorate (20%)
  if (user.governorate && typeof user.governorate === 'string' && user.governorate.trim().length > 0) {
    score += 20;
  } else {
    missing.push('governorate');
  }

  // Categories (20%) — workers need at least one, employers always pass
  if (user.role === 'employer') {
    score += 20;
  } else if (user.categories && Array.isArray(user.categories) && user.categories.length > 0) {
    score += 20;
  } else {
    missing.push('categories');
  }

  // Location — lat/lng (15%)
  if (typeof user.lat === 'number' && typeof user.lng === 'number') {
    score += 15;
  } else {
    missing.push('location');
  }

  // Verification (15%)
  if (user.verificationStatus === 'verified') {
    score += 15;
  } else {
    missing.push('verification');
  }

  // Terms accepted (10%)
  if (user.termsAcceptedAt) {
    score += 10;
  } else {
    missing.push('terms');
  }

  return {
    score,
    missing,
    complete: score >= 100,
  };
}

/**
 * Get Arabic label for a field key.
 * Used by frontend to display human-readable missing field names.
 * @param {string} fieldKey
 * @returns {string}
 */
export function getFieldLabel(fieldKey) {
  return FIELD_LABELS[fieldKey] || fieldKey;
}
