// ═══════════════════════════════════════════════════════════════
// server/services/verification.js — Identity Verification Service
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import { atomicWrite, readJSON, getRecordPath, listJSON, getCollectionPath, addToSetIndex, getFromSetIndex } from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

const VERIFICATION_INDEX = config.DATABASE.indexFiles.userVerificationIndex;

/**
 * Submit a verification request
 * @param {string} userId
 * @param {{ nationalIdImage: string, selfieImage?: string }} data
 * @returns {Promise<{ ok: boolean, verification?: object, error?: string, code?: string }>}
 */
export async function submitVerification(userId, { nationalIdImage, selfieImage } = {}) {
  // 1. Feature flag
  if (!config.VERIFICATION.enabled) {
    return { ok: false, error: 'خدمة التحقق غير مفعّلة حالياً', code: 'VERIFICATION_DISABLED' };
  }

  // 2. Image present
  if (!nationalIdImage || typeof nationalIdImage !== 'string') {
    return { ok: false, error: 'صورة البطاقة الشخصية مطلوبة', code: 'IMAGE_REQUIRED' };
  }

  // 3. Image size check (base64 string length approximates encoded size)
  const imageBytes = Buffer.byteLength(nationalIdImage, 'utf-8');
  if (imageBytes > config.VERIFICATION.maxImageSizeBytes) {
    return { ok: false, error: 'حجم الصورة أكبر من الحد المسموح (2MB)', code: 'IMAGE_TOO_LARGE' };
  }

  // Check selfie size too if provided
  if (selfieImage && typeof selfieImage === 'string') {
    const selfieBytes = Buffer.byteLength(selfieImage, 'utf-8');
    if (selfieBytes > config.VERIFICATION.maxImageSizeBytes) {
      return { ok: false, error: 'حجم صورة السيلفي أكبر من الحد المسموح (2MB)', code: 'IMAGE_TOO_LARGE' };
    }
  }

  // 4. User exists
  const { findById, update } = await import('./users.js');
  const user = await findById(userId);
  if (!user) {
    return { ok: false, error: 'المستخدم غير موجود', code: 'USER_NOT_FOUND' };
  }

  // 5. Not already verified
  if (user.verificationStatus === 'verified') {
    return { ok: false, error: 'تم التحقق من هويتك بالفعل', code: 'ALREADY_VERIFIED' };
  }

  // 6. Not already pending
  if (user.verificationStatus === 'pending') {
    return { ok: false, error: 'طلب التحقق قيد المراجعة بالفعل', code: 'ALREADY_PENDING' };
  }

  // 7. Rejection cooldown check
  if (user.verificationStatus === 'rejected' && user.verificationSubmittedAt) {
    const cooldownMs = config.VERIFICATION.rejectionCooldownHours * 60 * 60 * 1000;
    const submittedAt = new Date(user.verificationSubmittedAt).getTime();
    const now = Date.now();
    if (now - submittedAt < cooldownMs) {
      const hoursLeft = Math.ceil((cooldownMs - (now - submittedAt)) / (60 * 60 * 1000));
      return { ok: false, error: `يُرجى الانتظار ${hoursLeft} ساعة قبل إعادة التقديم`, code: 'COOLDOWN_ACTIVE' };
    }
  }

  // 8. Daily submission limit (non-blocking on failure)
  try {
    const todayCount = await countTodayByUser(userId);
    if (todayCount >= config.VERIFICATION.maxSubmissionsPerDay) {
      return { ok: false, error: 'وصلت للحد الأقصى لطلبات التحقق اليوم', code: 'DAILY_VERIFICATION_LIMIT' };
    }
  } catch (_) {
    // Non-blocking: allow on count failure
  }

  // 9. Create verification record
  const id = 'vrf_' + crypto.randomBytes(6).toString('hex');
  const now = new Date().toISOString();

  const verification = {
    id,
    userId,
    nationalIdImage,
    selfieImage: selfieImage || null,
    status: 'pending',
    adminNotes: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: now,
  };

  const vrfPath = getRecordPath('verifications', id);
  await atomicWrite(vrfPath, verification);

  // Update user-verification index
  await addToSetIndex(VERIFICATION_INDEX, userId, id);

  // Update user verificationStatus
  await update(userId, {
    verificationStatus: 'pending',
    verificationSubmittedAt: now,
  });

  // Emit event
  eventBus.emit('verification:submitted', { verificationId: id, userId });

  logger.info('Verification submitted', { verificationId: id, userId });

  // Return WITHOUT image data (privacy)
  return {
    ok: true,
    verification: {
      id,
      userId,
      status: 'pending',
      createdAt: now,
    },
  };
}

/**
 * Admin reviews a verification request
 * @param {string} verificationId
 * @param {{ status: string, adminNotes?: string, reviewedBy?: string }} data
 * @returns {Promise<{ ok: boolean, verification?: object, error?: string, code?: string }>}
 */
export async function reviewVerification(verificationId, { status, adminNotes, reviewedBy } = {}) {
  // 1. Record exists
  const verification = await findById(verificationId);
  if (!verification) {
    return { ok: false, error: 'طلب التحقق غير موجود', code: 'VERIFICATION_NOT_FOUND' };
  }

  // 2. Still pending
  if (verification.status !== 'pending') {
    return { ok: false, error: 'تمت مراجعة هذا الطلب بالفعل', code: 'ALREADY_REVIEWED' };
  }

  // 3. Valid status
  if (status !== 'verified' && status !== 'rejected') {
    return { ok: false, error: 'حالة غير صالحة — يجب أن تكون verified أو rejected', code: 'INVALID_VERIFICATION_STATUS' };
  }

  // 4. Update record
  const now = new Date().toISOString();
  verification.status = status;
  verification.adminNotes = adminNotes || null;
  verification.reviewedAt = now;
  verification.reviewedBy = reviewedBy || null;

  const vrfPath = getRecordPath('verifications', verificationId);
  await atomicWrite(vrfPath, verification);

  // 5. Update user verificationStatus
  const { update } = await import('./users.js');
  await update(verification.userId, {
    verificationStatus: status,
  });

  // 6. Emit event
  eventBus.emit('verification:reviewed', {
    verificationId,
    userId: verification.userId,
    status,
  });

  logger.info('Verification reviewed', { verificationId, userId: verification.userId, status });

  // Return without image data
  return {
    ok: true,
    verification: {
      id: verification.id,
      userId: verification.userId,
      status: verification.status,
      adminNotes: verification.adminNotes,
      reviewedAt: verification.reviewedAt,
      reviewedBy: verification.reviewedBy,
      createdAt: verification.createdAt,
    },
  };
}

/**
 * Find verification by ID
 * @param {string} verificationId
 * @returns {Promise<object|null>}
 */
export async function findById(verificationId) {
  const vrfPath = getRecordPath('verifications', verificationId);
  return await readJSON(vrfPath);
}

/**
 * List verifications by user (index-accelerated, newest first)
 * Returns records WITHOUT image data (privacy)
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function listByUser(userId) {
  let verifications = [];

  // Try index-accelerated lookup
  const indexedIds = await getFromSetIndex(VERIFICATION_INDEX, userId);
  if (indexedIds.length > 0) {
    for (const vrfId of indexedIds) {
      const vrf = await readJSON(getRecordPath('verifications', vrfId));
      if (vrf) verifications.push(vrf);
    }
  } else {
    // Fallback: full scan
    const vrfDir = getCollectionPath('verifications');
    const allRecords = await listJSON(vrfDir);
    verifications = allRecords.filter(v => v.userId === userId);
  }

  // Sort newest first
  verifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Strip image data for privacy
  return verifications.map(v => ({
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    createdAt: v.createdAt,
  }));
}

/**
 * List all pending verifications (full scan, newest first)
 * Returns records WITHOUT image data
 * @returns {Promise<object[]>}
 */
export async function listPending() {
  const vrfDir = getCollectionPath('verifications');
  const allRecords = await listJSON(vrfDir);
  const pending = allRecords.filter(v => v.status === 'pending');

  // Sort newest first
  pending.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return pending.map(v => ({
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    createdAt: v.createdAt,
  }));
}

/**
 * List all verifications (paginated, filterable)
 * @param {{ page?: number, limit?: number, status?: string }} options
 * @returns {Promise<{ verifications: object[], page: number, limit: number, total: number, totalPages: number }>}
 */
export async function listAll({ page = 1, limit = 20, status } = {}) {
  const vrfDir = getCollectionPath('verifications');
  const allRecords = await listJSON(vrfDir);

  // Filter by status if provided
  let filtered = allRecords.filter(v => v.id && v.id.startsWith('vrf_'));
  if (status) {
    filtered = filtered.filter(v => v.status === status);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * limit;
  const items = filtered.slice(start, start + limit);

  // Strip image data
  const verifications = items.map(v => ({
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes,
    reviewedAt: v.reviewedAt,
    reviewedBy: v.reviewedBy,
    createdAt: v.createdAt,
  }));

  return { verifications, page: safePage, limit, total, totalPages };
}

/**
 * Count today's submissions by user (Egypt midnight reset)
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function countTodayByUser(userId) {
  const { getEgyptMidnight } = await import('./geo.js');
  const midnight = getEgyptMidnight();

  // Get all user verifications (with image data for internal use)
  const indexedIds = await getFromSetIndex(VERIFICATION_INDEX, userId);
  let verifications = [];

  if (indexedIds.length > 0) {
    for (const vrfId of indexedIds) {
      const vrf = await readJSON(getRecordPath('verifications', vrfId));
      if (vrf) verifications.push(vrf);
    }
  } else {
    const vrfDir = getCollectionPath('verifications');
    const allRecords = await listJSON(vrfDir);
    verifications = allRecords.filter(v => v.userId === userId);
  }

  // Count submissions after midnight
  return verifications.filter(v =>
    v.createdAt && new Date(v.createdAt) >= midnight
  ).length;
}
