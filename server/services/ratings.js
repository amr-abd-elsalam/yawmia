// ═══════════════════════════════════════════════════════════════
// server/services/ratings.js — Bidirectional Rating System
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath } from './database.js';
import { findById as findJobById } from './jobs.js';
import { findById as findUserById, update as updateUser } from './users.js';
import { listByJob as listApplicationsByJob } from './applications.js';
import { eventBus } from './eventBus.js';

/**
 * Check if a user is an accepted worker for a specific job
 * @param {string} jobId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isAcceptedWorker(jobId, userId) {
  const applications = await listApplicationsByJob(jobId);
  return applications.some(app => app.workerId === userId && app.status === 'accepted');
}

/**
 * Recalculate and persist user aggregate rating
 * Full recalculation from all ratings — not incremental — to avoid drift
 * @param {string} userId
 */
async function recalculateUserRating(userId) {
  const summary = await getUserRatingSummary(userId);
  await updateUser(userId, {
    rating: { avg: summary.avg, count: summary.count },
  });
}

/**
 * Submit a rating for a completed job
 * @param {string} jobId
 * @param {string} fromUserId
 * @param {{ toUserId: string, stars: number, comment?: string }} data
 * @returns {Promise<{ ok: boolean, rating?: object, error?: string, code?: string }>}
 */
export async function submitRating(jobId, fromUserId, { toUserId, stars, comment }) {
  // Rule 1: RATINGS_ENABLED
  if (!config.RATINGS.enabled) {
    return { ok: false, error: 'نظام التقييم غير مفعّل', code: 'RATINGS_DISABLED' };
  }

  // Rule 2: VALID_STARS
  if (typeof stars !== 'number' || !Number.isFinite(stars) || stars < 1 || stars > config.RATINGS.maxStars) {
    return { ok: false, error: `التقييم لازم يكون رقم بين 1 و ${config.RATINGS.maxStars}`, code: 'INVALID_STARS' };
  }

  // Ensure stars is an integer
  stars = Math.floor(stars);

  // Rule 3: VALID_COMMENT
  if (comment !== undefined && comment !== null) {
    if (typeof comment !== 'string') {
      return { ok: false, error: 'التعليق لازم يكون نص', code: 'INVALID_COMMENT' };
    }
    if (comment.length > config.VALIDATION.descriptionMaxLength) {
      return { ok: false, error: `التعليق لازم يكون أقل من ${config.VALIDATION.descriptionMaxLength} حرف`, code: 'COMMENT_TOO_LONG' };
    }
  }

  // Rule 4: NO_SELF_RATING
  if (fromUserId === toUserId) {
    return { ok: false, error: 'مش ممكن تقيّم نفسك', code: 'CANNOT_RATE_SELF' };
  }

  // Rule 5: JOB_EXISTS_AND_COMPLETED
  const job = await findJobById(jobId);
  if (!job) {
    return { ok: false, error: 'الفرصة غير موجودة', code: 'JOB_NOT_FOUND' };
  }
  if (job.status !== 'completed') {
    return { ok: false, error: 'الفرصة لازم تكون مكتملة عشان تقدر تقيّم', code: 'JOB_NOT_COMPLETED' };
  }

  // Rule 6: USERS_EXIST
  const fromUser = await findUserById(fromUserId);
  if (!fromUser) {
    return { ok: false, error: 'المستخدم المُقيِّم غير موجود', code: 'USER_NOT_FOUND' };
  }
  const toUser = await findUserById(toUserId);
  if (!toUser) {
    return { ok: false, error: 'المستخدم المُقيَّم غير موجود', code: 'USER_NOT_FOUND' };
  }

  // Direction Permission Rules
  if (fromUser.role === 'worker' && !config.RATINGS.canWorkerRateEmployer) {
    return { ok: false, error: 'غير مسموح للعامل بتقييم صاحب العمل', code: 'WORKER_CANNOT_RATE' };
  }
  if (fromUser.role === 'employer' && !config.RATINGS.canEmployerRateWorker) {
    return { ok: false, error: 'غير مسموح لصاحب العمل بتقييم العامل', code: 'EMPLOYER_CANNOT_RATE' };
  }

  // Rule 7: FROM_USER_INVOLVED
  const isFromEmployer = job.employerId === fromUserId;
  const isFromAcceptedWorker = await isAcceptedWorker(jobId, fromUserId);
  if (!isFromEmployer && !isFromAcceptedWorker) {
    return { ok: false, error: 'أنت مش مشارك في هذه الفرصة', code: 'NOT_INVOLVED' };
  }

  // Rule 8: TO_USER_INVOLVED
  const isToEmployer = job.employerId === toUserId;
  const isToAcceptedWorker = await isAcceptedWorker(jobId, toUserId);
  if (!isToEmployer && !isToAcceptedWorker) {
    return { ok: false, error: 'المستخدم المُقيَّم مش مشارك في هذه الفرصة', code: 'TARGET_NOT_INVOLVED' };
  }

  // Rule 9: NO_DUPLICATE
  const existing = await findByJobAndUsers(jobId, fromUserId, toUserId);
  if (existing) {
    return { ok: false, error: 'أنت قيّمت هذا المستخدم في هذه الفرصة بالفعل', code: 'ALREADY_RATED' };
  }

  // ── Create rating ──
  const id = 'rtg_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const rating = {
    id,
    jobId,
    fromUserId,
    toUserId,
    fromRole: fromUser.role,
    toRole: toUser.role,
    stars,
    comment: (comment && typeof comment === 'string') ? comment : null,
    createdAt: now,
  };

  const ratingPath = getRecordPath('ratings', id);
  await atomicWrite(ratingPath, rating);

  // Update target user aggregate rating
  await recalculateUserRating(toUserId);

  // Emit event
  eventBus.emit('rating:submitted', {
    ratingId: id,
    jobId,
    fromUserId,
    toUserId,
    stars,
    jobTitle: job.title,
  });

  return { ok: true, rating };
}

/**
 * Find a rating by (jobId, fromUserId, toUserId) — duplicate check
 * @returns {Promise<object|null>}
 */
export async function findByJobAndUsers(jobId, fromUserId, toUserId) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);
  return all.find(r => r.jobId === jobId && r.fromUserId === fromUserId && r.toUserId === toUserId) || null;
}

/**
 * List all ratings for a job (newest first)
 * @param {string} jobId
 * @returns {Promise<object[]>}
 */
export async function listByJob(jobId) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);
  return all
    .filter(r => r.jobId === jobId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * List ratings received by a user (paginated, newest first)
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ items: object[], total: number, limit: number, offset: number }>}
 */
export async function listByUser(userId, { limit = 20, offset = 0 } = {}) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);

  const userRatings = all
    .filter(r => r.toUserId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = userRatings.length;
  const items = userRatings.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

/**
 * Get rating summary for a user (avg, count, distribution)
 * @param {string} userId
 * @returns {Promise<{ avg: number, count: number, distribution: object }>}
 */
export async function getUserRatingSummary(userId) {
  const ratingsDir = getCollectionPath('ratings');
  const all = await listJSON(ratingsDir);

  const userRatings = all.filter(r => r.toUserId === userId);

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;

  for (const r of userRatings) {
    sum += r.stars;
    if (distribution[r.stars] !== undefined) {
      distribution[r.stars]++;
    }
  }

  const count = userRatings.length;
  const avg = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;

  return { avg, count, distribution };
}

