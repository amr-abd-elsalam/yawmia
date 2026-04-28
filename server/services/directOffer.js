// ═══════════════════════════════════════════════════════════════
// server/services/directOffer.js — Direct Offer Lifecycle (Phase 42)
// ═══════════════════════════════════════════════════════════════
// First-class entity for direct employer→worker offers.
// Lifecycle: pending → accepted | declined | expired | withdrawn
// Two-phase identity reveal: hidden before accept, revealed after.
// Storage: sharded monthly (data/direct_offers/YYYY-MM/).
// Indexes: employerOffersIndex + workerOffersIndex (flat).
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite, readJSON, getRecordPath, getWriteRecordPath,
  getCollectionPath, listJSON,
  addToSetIndex, getFromSetIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';
import { withLock } from './resourceLock.js';

const EMPLOYER_OFFERS_INDEX = config.DATABASE.indexFiles.employerOffersIndex;
const WORKER_OFFERS_INDEX = config.DATABASE.indexFiles.workerOffersIndex;

/** Generate offer ID */
function generateId() {
  return 'dof_' + crypto.randomBytes(6).toString('hex');
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Redact name to "FirstName L." format for privacy.
 * @param {string} fullName
 * @returns {string}
 */
function redactName(fullName) {
  if (!fullName || typeof fullName !== 'string') return 'مستخدم';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'مستخدم';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

/**
 * Redact offer based on viewer + status.
 * BEFORE accept: redact employer name+phone for worker; redact worker name+phone for employer.
 * AFTER accept (and beyond): full reveal for both involved parties.
 *
 * @param {object} offer
 * @param {string} viewerId
 * @returns {object} redacted copy
 */
export function redactOfferForViewer(offer, viewerId) {
  if (!offer) return null;
  const isWorker = offer.workerId === viewerId;
  const isEmployer = offer.employerId === viewerId;
  const fullReveal = (offer.status === 'accepted');

  // Build base output (always-visible fields)
  const out = {
    id: offer.id,
    status: offer.status,
    category: offer.category,
    governorate: offer.governorate,
    proposedDailyWage: offer.proposedDailyWage,
    proposedStartDate: offer.proposedStartDate,
    proposedDurationDays: offer.proposedDurationDays,
    message: offer.message,
    adId: offer.adId,
    acceptanceWindowSeconds: offer.acceptanceWindowSeconds,
    notifiedAt: offer.notifiedAt,
    expiresAt: offer.expiresAt,
    acceptedAt: offer.acceptedAt,
    declinedAt: offer.declinedAt,
    declinedReason: offer.declinedReason,
    expiredAt: offer.expiredAt,
    withdrawnAt: offer.withdrawnAt,
    resultingJobId: offer.resultingJobId,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };

  if (fullReveal) {
    // Full identity reveal for both parties
    out.employerId = offer.employerId;
    out.workerId = offer.workerId;
    out.revealedToWorker = offer.revealedToWorker;
    out.revealedToEmployer = offer.revealedToEmployer;
    return out;
  }

  // Pre-accept: viewer-specific redaction
  if (isWorker) {
    // Worker sees: redacted employer info only
    const r = offer.preAcceptEmployerSummary || {};
    out.employerDisplayName = r.displayName || 'صاحب عمل';
    out.employerRating = r.rating || { avg: 0, count: 0 };
    out.employerVerified = !!r.verified;
    // employerId, employerPhone HIDDEN
  } else if (isEmployer) {
    // Employer sees: own offer with redacted worker name
    out.workerId = offer.workerId; // employer chose them, they know the ID
    const w = offer.preAcceptWorkerSummary || {};
    out.workerDisplayName = w.displayName || 'مستخدم';
    out.workerRating = w.rating || { avg: 0, count: 0 };
    out.workerVerified = !!w.verified;
    // workerPhone HIDDEN
  } else {
    // Unrelated viewer (admin, etc.) — show minimal
    return {
      id: out.id,
      status: out.status,
      createdAt: out.createdAt,
    };
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════
// Counts (for caps)
// ═══════════════════════════════════════════════════════════════

/**
 * Count pending offers by employer.
 * @param {string} employerId
 * @returns {Promise<number>}
 */
export async function countPendingByEmployer(employerId) {
  const ids = await getFromSetIndex(EMPLOYER_OFFERS_INDEX, employerId);
  let count = 0;
  for (const oid of ids) {
    const offer = await readJSON(getRecordPath('direct_offers', oid));
    if (offer && offer.status === 'pending') count++;
  }
  return count;
}

/**
 * Count pending offers by worker.
 * @param {string} workerId
 * @returns {Promise<number>}
 */
export async function countPendingByWorker(workerId) {
  const ids = await getFromSetIndex(WORKER_OFFERS_INDEX, workerId);
  let count = 0;
  for (const oid of ids) {
    const offer = await readJSON(getRecordPath('direct_offers', oid));
    if (offer && offer.status === 'pending') count++;
  }
  return count;
}

/**
 * Count offers created today by employer (Egypt timezone).
 * @param {string} employerId
 * @returns {Promise<number>}
 */
export async function countTodayByEmployer(employerId) {
  const { getEgyptMidnight } = await import('./geo.js');
  const todayMidnight = getEgyptMidnight();
  const ids = await getFromSetIndex(EMPLOYER_OFFERS_INDEX, employerId);
  let count = 0;
  for (const oid of ids) {
    const offer = await readJSON(getRecordPath('direct_offers', oid));
    if (offer && new Date(offer.createdAt) >= todayMidnight) count++;
  }
  return count;
}

/**
 * Find existing pending offer for (employerId, workerId) pair.
 * @param {string} employerId
 * @param {string} workerId
 * @returns {Promise<object|null>}
 */
export async function findPendingByPair(employerId, workerId) {
  const ids = await getFromSetIndex(EMPLOYER_OFFERS_INDEX, employerId);
  for (const oid of ids) {
    const offer = await readJSON(getRecordPath('direct_offers', oid));
    if (offer && offer.workerId === workerId && offer.status === 'pending') {
      return offer;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Validate offer fields.
 * @param {object} fields
 * @returns {{ valid: boolean, error?: string, code?: string }}
 */
function validateFields(fields) {
  if (!fields || typeof fields !== 'object') {
    return { valid: false, error: 'بيانات العرض غير صالحة', code: 'INVALID_FIELDS' };
  }

  // Category
  const validCatIds = new Set(config.LABOR_CATEGORIES.map(c => c.id));
  if (!fields.category || !validCatIds.has(fields.category)) {
    return { valid: false, error: 'التخصص غير صالح', code: 'INVALID_CATEGORY' };
  }

  // Governorate
  const validGovs = new Set(config.REGIONS.governorates.map(g => g.id));
  if (!fields.governorate || !validGovs.has(fields.governorate)) {
    return { valid: false, error: 'المحافظة غير صالحة', code: 'INVALID_GOVERNORATE' };
  }

  // Wage
  const minW = config.FINANCIALS.minDailyWage;
  const maxW = config.FINANCIALS.maxDailyWage;
  if (typeof fields.proposedDailyWage !== 'number' ||
      isNaN(fields.proposedDailyWage) ||
      fields.proposedDailyWage < minW ||
      fields.proposedDailyWage > maxW) {
    return { valid: false, error: `الأجر لازم يكون بين ${minW} و ${maxW} جنيه`, code: 'INVALID_WAGE' };
  }

  // Start date (YYYY-MM-DD)
  if (!fields.proposedStartDate || typeof fields.proposedStartDate !== 'string') {
    return { valid: false, error: 'تاريخ البدء مطلوب', code: 'INVALID_START_DATE' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.proposedStartDate)) {
    return { valid: false, error: 'صيغة تاريخ البدء غير صالحة', code: 'INVALID_START_DATE' };
  }

  // Duration (default 1, max 7)
  if (fields.proposedDurationDays !== undefined && fields.proposedDurationDays !== null) {
    if (typeof fields.proposedDurationDays !== 'number' ||
        fields.proposedDurationDays < 1 ||
        fields.proposedDurationDays > 7) {
      return { valid: false, error: 'مدة العمل لازم تكون بين 1 و 7 أيام', code: 'INVALID_DURATION' };
    }
  }

  // Message (optional, ≤ 200 chars)
  if (fields.message !== undefined && fields.message !== null) {
    if (typeof fields.message !== 'string') {
      return { valid: false, error: 'الرسالة لازم تكون نص', code: 'MESSAGE_TOO_LONG' };
    }
    const maxLen = config.DIRECT_OFFERS.maxMessageLength || 200;
    if (fields.message.length > maxLen) {
      return { valid: false, error: `الرسالة لا تتجاوز ${maxLen} حرف`, code: 'MESSAGE_TOO_LONG' };
    }
  }

  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════
// Create
// ═══════════════════════════════════════════════════════════════

/**
 * Create a new direct offer.
 * Two-level locking for atomic cap enforcement:
 *   - Outer lock: per-worker (`offer-create-worker:${workerId}`) — serializes ALL creates targeting same worker
 *   - Inner lock: per-employer (`offer-create-emp:${employerId}`) — serializes per-employer cap checks
 * Lock order is fixed (worker → employer) to prevent deadlock.
 *
 * @param {string} employerId
 * @param {string} workerId
 * @param {object} fields — { adId?, category, governorate, proposedDailyWage, proposedStartDate, proposedDurationDays?, message? }
 * @returns {Promise<{ ok: boolean, offer?: object, error?: string, code?: string }>}
 */
export function create(employerId, workerId, fields) {
  // Outer lock: per-worker — ensures only one create attempt against this worker proceeds at a time.
  // This makes the worker pending cap (max 3) atomically enforced even when multiple
  // employers race to create offers for the same worker.
  return withLock(`offer-create-worker:${workerId}`, async () => {
    // Inner lock: per-employer — ensures employer cap (max 5) and daily cap (max 20)
    // are atomically enforced when the same employer creates offers in parallel.
    return withLock(`offer-create-emp:${employerId}`, async () => {
    // 1. Feature flag
    if (!config.DIRECT_OFFERS || !config.DIRECT_OFFERS.enabled) {
      return { ok: false, error: 'العروض المباشرة غير مفعّلة', code: 'OFFERS_DISABLED' };
    }

    // 2. Self-offer guard
    if (employerId === workerId) {
      return { ok: false, error: 'لا يمكنك إرسال عرض لنفسك', code: 'SELF_OFFER' };
    }

    // 3. Validate employer
    const { findById: findUser } = await import('./users.js');
    const employer = await findUser(employerId);
    if (!employer || employer.status !== 'active' || employer.role !== 'employer') {
      return { ok: false, error: 'صاحب العمل غير صالح', code: 'INVALID_EMPLOYER' };
    }

    // 4. Validate worker
    const worker = await findUser(workerId);
    if (!worker || worker.status !== 'active' || worker.role !== 'worker') {
      return { ok: false, error: 'العامل غير موجود أو غير متاح', code: 'INVALID_WORKER' };
    }

    // 5. Validate fields
    const validation = validateFields(fields);
    if (!validation.valid) {
      return { ok: false, error: validation.error, code: validation.code };
    }

    // 6. Content filter on message (if present)
    if (fields.message && fields.message.trim()) {
      const { sanitizeText } = await import('./sanitizer.js');
      fields.message = sanitizeText(fields.message.trim());

      if (config.CONTENT_FILTER && config.CONTENT_FILTER.enabled) {
        try {
          const { isContentSafe } = await import('./contentFilter.js');
          if (!isContentSafe(fields.message)) {
            return { ok: false, error: 'الرسالة تحتوي على محتوى غير مسموح', code: 'CONTENT_BLOCKED' };
          }
        } catch (_) { /* non-blocking */ }
      }
    }

    // 7. Concurrency caps (inside lock — atomic)
    try {
      const empPending = await countPendingByEmployer(employerId);
      if (empPending >= config.DIRECT_OFFERS.maxPendingPerEmployer) {
        return { ok: false, error: 'وصلت للحد الأقصى للعروض المعلّقة', code: 'EMPLOYER_PENDING_CAP' };
      }
    } catch (_) { /* on error, allow */ }

    try {
      const wkrPending = await countPendingByWorker(workerId);
      if (wkrPending >= config.DIRECT_OFFERS.maxPendingPerWorker) {
        return { ok: false, error: 'العامل لديه عروض معلّقة كثيرة — جرّب بعد قليل', code: 'WORKER_PENDING_CAP' };
      }
    } catch (_) { /* on error, allow */ }

    try {
      const dailyCount = await countTodayByEmployer(employerId);
      if (dailyCount >= config.DIRECT_OFFERS.maxPerEmployerPerDay) {
        return { ok: false, error: 'وصلت للحد اليومي لإرسال العروض', code: 'EMPLOYER_DAILY_CAP' };
      }
    } catch (_) { /* on error, allow */ }

    // 8. Dedup: no duplicate pending offer for same (employer, worker)
    try {
      const existing = await findPendingByPair(employerId, workerId);
      if (existing) {
        return { ok: false, error: 'لديك عرض معلّق بالفعل لهذا العامل', code: 'DUPLICATE_PENDING' };
      }
    } catch (_) { /* on error, allow */ }

    // 9. Validate ad linkage (if provided)
    let adId = fields.adId || null;
    if (adId) {
      try {
        const { findById: findAd } = await import('./availabilityAd.js');
        const ad = await findAd(adId);
        if (!ad || ad.status !== 'active' || ad.workerId !== workerId) {
          return { ok: false, error: 'الإعلان غير صالح أو غير نشط', code: 'INVALID_AD' };
        }
      } catch (err) {
        return { ok: false, error: 'تعذّر التحقق من الإعلان', code: 'INVALID_AD' };
      }
    }

    // 10. Build pre-accept summaries (for redaction)
    const preAcceptEmployerSummary = {
      displayName: 'صاحب عمل',
      rating: employer.rating || { avg: 0, count: 0 },
      verified: employer.verificationStatus === 'verified',
    };

    const preAcceptWorkerSummary = {
      displayName: redactName(worker.name),
      rating: worker.rating || { avg: 0, count: 0 },
      verified: worker.verificationStatus === 'verified',
    };

    // 11. Create offer record
    const id = generateId();
    const now = new Date();
    const acceptanceWindowSec = config.DIRECT_OFFERS.acceptanceWindowSeconds;
    const expiresAt = new Date(now.getTime() + acceptanceWindowSec * 1000);

    const offer = {
      id,
      employerId,
      workerId,
      adId,
      status: 'pending',
      category: fields.category,
      governorate: fields.governorate,
      proposedDailyWage: fields.proposedDailyWage,
      proposedStartDate: fields.proposedStartDate,
      proposedDurationDays: fields.proposedDurationDays || 1,
      message: fields.message || null,
      acceptanceWindowSeconds: acceptanceWindowSec,
      notifiedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),

      // Two-phase reveal — null until accept
      revealedToWorker: null,
      revealedToEmployer: null,

      // Pre-accept summaries (for redaction helper)
      preAcceptEmployerSummary,
      preAcceptWorkerSummary,

      acceptedAt: null,
      declinedAt: null,
      declinedReason: null,
      expiredAt: null,
      withdrawnAt: null,
      resultingJobId: null,

      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const offerPath = getWriteRecordPath('direct_offers', id);
    await atomicWrite(offerPath, offer);

    // 12. Update indexes
    await addToSetIndex(EMPLOYER_OFFERS_INDEX, employerId, id);
    await addToSetIndex(WORKER_OFFERS_INDEX, workerId, id);

    // 13. Schedule expiry (in-process timer + sweep fallback)
    const expiryTimer = setTimeout(() => {
      expireOffer(id).catch(err => {
        logger.warn('Direct offer expiry timer error', { offerId: id, error: err.message });
      });
    }, acceptanceWindowSec * 1000);
    if (expiryTimer.unref) expiryTimer.unref();

    // 14. Emit event
    eventBus.emit('direct_offer:created', {
      offerId: id,
      employerId,
      workerId,
      adId,
      proposedDailyWage: offer.proposedDailyWage,
      expiresAt: offer.expiresAt,
    });

    logger.info('Direct offer created', { offerId: id, employerId, workerId, adId });

    return { ok: true, offer: redactOfferForViewer(offer, employerId) };
    }); // end inner lock (per-employer)
  }); // end outer lock (per-worker)
}

// ═══════════════════════════════════════════════════════════════
// Try Accept (first-accept-wins)
// ═══════════════════════════════════════════════════════════════

/**
 * Worker tries to accept an offer.
 * Atomic via withLock(`offer:${offerId}`).
 *
 * Pipeline:
 *   1. Re-read inside lock
 *   2. Identity + status + expiry checks
 *   3. Load full identities (employer + worker)
 *   4. Build revealed objects
 *   5. Create synthetic job (sourceType='direct_offer')
 *   6. Create application via instantAcceptInternal (job → 'filled')
 *   7. Start job (transition 'filled' → 'in_progress')
 *   8. Mark linked ad as matched (fire-and-forget on error)
 *   9. Persist offer (status='accepted')
 *   10. Emit event
 *
 * Compensating rollback: if step 6 fails, cancel the synthetic job (still 'open').
 *
 * @param {string} offerId
 * @param {string} workerId
 * @returns {Promise<{ ok: boolean, offer?: object, jobId?: string, error?: string, code?: string }>}
 */
export async function tryAccept(offerId, workerId) {
  // Pre-lock existence check
  const offerPath = getRecordPath('direct_offers', offerId);
  const preCheck = await readJSON(offerPath);
  if (!preCheck) {
    return { ok: false, error: 'العرض غير موجود', code: 'OFFER_NOT_FOUND' };
  }

  return withLock(`offer:${offerId}`, async () => {
    // 1. Re-read inside lock
    const offer = await readJSON(offerPath);
    if (!offer) {
      return { ok: false, error: 'العرض غير موجود', code: 'OFFER_NOT_FOUND' };
    }

    // 2. Identity check
    if (offer.workerId !== workerId) {
      return { ok: false, error: 'مش مسموحلك تقبل هذا العرض', code: 'NOT_OFFER_RECIPIENT' };
    }

    // 3. Status check (first-accept-wins)
    if (offer.status !== 'pending') {
      return { ok: false, error: 'العرض غير متاح للقبول', code: 'OFFER_NOT_PENDING' };
    }

    // 4. Expiry check inside lock
    const buffer = config.DIRECT_OFFERS.expiryBufferMs || 0;
    if (Date.now() > new Date(offer.expiresAt).getTime() + buffer) {
      offer.status = 'expired';
      offer.expiredAt = new Date().toISOString();
      offer.updatedAt = offer.expiredAt;
      await atomicWrite(offerPath, offer);
      eventBus.emit('direct_offer:expired', {
        offerId,
        employerId: offer.employerId,
        workerId: offer.workerId,
      });
      return { ok: false, error: 'انتهت مهلة العرض', code: 'OFFER_EXPIRED' };
    }

    // 5. Load full identities
    const { findById: findUser } = await import('./users.js');
    const employer = await findUser(offer.employerId);
    const worker = await findUser(workerId);

    if (!employer || employer.status !== 'active') {
      return { ok: false, error: 'صاحب العمل غير متاح', code: 'USER_DELETED' };
    }
    if (!worker || worker.status !== 'active') {
      return { ok: false, error: 'الحساب غير متاح', code: 'USER_DELETED' };
    }

    // 6. Build revealed objects
    const revealedToWorker = {
      employerId: employer.id,
      employerName: employer.name || 'بدون اسم',
      employerPhone: employer.phone,
      employerRating: employer.rating || { avg: 0, count: 0 },
      employerVerified: employer.verificationStatus === 'verified',
    };

    const revealedToEmployer = {
      workerId: worker.id,
      workerName: worker.name || 'بدون اسم',
      workerPhone: worker.phone,
      workerRating: worker.rating || { avg: 0, count: 0 },
      workerVerified: worker.verificationStatus === 'verified',
    };

    // 7. Create synthetic job (status='open' at creation, then progressed below)
    let resultingJob;
    try {
      const { create: createJob } = await import('./jobs.js');
      resultingJob = await createJob(employer.id, {
        title: `عمل مباشر — ${offer.category}`,
        category: offer.category,
        governorate: offer.governorate,
        workersNeeded: 1,
        dailyWage: offer.proposedDailyWage,
        startDate: offer.proposedStartDate,
        durationDays: offer.proposedDurationDays || 1,
        description: offer.message || 'تم الاتفاق عبر العرض المباشر',
        urgency: config.DIRECT_OFFERS.syntheticJobUrgency || 'immediate',
        sourceType: 'direct_offer',
        sourceOfferId: offerId,
      });
    } catch (err) {
      logger.error('Synthetic job creation failed', { offerId, error: err.message });
      return { ok: false, error: 'تعذّر إنشاء الفرصة', code: 'JOB_CREATION_FAILED' };
    }

    if (!resultingJob || !resultingJob.id) {
      return { ok: false, error: 'تعذّر إنشاء الفرصة', code: 'JOB_CREATION_FAILED' };
    }

    // 8. Create application atomically via instantAcceptInternal
    //    (job will auto-transition 'open' → 'filled' since workersNeeded=1)
    let appResult;
    try {
      const { instantAcceptInternal } = await import('./applications.js');
      appResult = await instantAcceptInternal(resultingJob.id, workerId);
    } catch (err) {
      logger.error('Application creation failed for synthetic job', { offerId, jobId: resultingJob.id, error: err.message });
      // Compensating rollback: synthetic job is still 'open' — cancel it
      try {
        const { cancelJob } = await import('./jobs.js');
        await cancelJob(resultingJob.id, employer.id);
      } catch (_) { /* best-effort */ }
      return { ok: false, error: 'تعذّر تأكيد القبول', code: 'APP_CREATION_FAILED' };
    }

    if (!appResult || !appResult.ok) {
      // Compensating rollback
      try {
        const { cancelJob } = await import('./jobs.js');
        await cancelJob(resultingJob.id, employer.id);
      } catch (_) { /* best-effort */ }
      return { ok: false, error: 'تعذّر تأكيد القبول', code: 'APP_CREATION_FAILED' };
    }

    // 9. Transition synthetic job from 'filled' → 'in_progress' (auto-start)
    try {
      const { startJob } = await import('./jobs.js');
      await startJob(resultingJob.id, employer.id);
    } catch (err) {
      // Non-fatal — employer can manually start later
      logger.warn('Synthetic job startJob failed (non-fatal)', { offerId, jobId: resultingJob.id, error: err.message });
    }

    // 10. Mark linked ad as matched (fire-and-forget on error)
    if (offer.adId) {
      try {
        const { markAsMatched } = await import('./availabilityAd.js');
        await markAsMatched(offer.adId, resultingJob.id);
      } catch (err) {
        logger.warn('Ad markAsMatched failed (non-fatal)', { offerId, adId: offer.adId, error: err.message });
      }
    }

    // 11. Persist offer
    offer.status = 'accepted';
    offer.acceptedAt = new Date().toISOString();
    offer.updatedAt = offer.acceptedAt;
    offer.resultingJobId = resultingJob.id;
    offer.revealedToWorker = revealedToWorker;
    offer.revealedToEmployer = revealedToEmployer;
    await atomicWrite(offerPath, offer);

    // 12. Emit event
    eventBus.emit('direct_offer:accepted', {
      offerId,
      employerId: employer.id,
      workerId: worker.id,
      jobId: resultingJob.id,
      adId: offer.adId,
    });

    logger.info('Direct offer accepted', { offerId, jobId: resultingJob.id, employerId: employer.id, workerId });

    return { ok: true, offer: redactOfferForViewer(offer, workerId), jobId: resultingJob.id };
  });
}

// ═══════════════════════════════════════════════════════════════
// Decline
// ═══════════════════════════════════════════════════════════════

/**
 * Worker declines an offer.
 * @param {string} offerId
 * @param {string} workerId
 * @param {string} [reason]
 * @returns {Promise<{ ok: boolean, offer?: object, error?: string, code?: string }>}
 */
export async function decline(offerId, workerId, reason) {
  const offerPath = getRecordPath('direct_offers', offerId);
  const offer = await readJSON(offerPath);

  if (!offer) {
    return { ok: false, error: 'العرض غير موجود', code: 'OFFER_NOT_FOUND' };
  }

  if (offer.workerId !== workerId) {
    return { ok: false, error: 'مش مسموحلك ترفض هذا العرض', code: 'NOT_OFFER_RECIPIENT' };
  }

  if (offer.status !== 'pending') {
    return { ok: false, error: 'العرض غير متاح للرفض', code: 'OFFER_NOT_PENDING' };
  }

  // Validate reason if provided
  let cleanReason = null;
  if (reason !== undefined && reason !== null && reason !== '') {
    if (typeof reason !== 'string') {
      return { ok: false, error: 'سبب الرفض غير صالح', code: 'INVALID_REASON' };
    }
    const allowedReasons = config.DIRECT_OFFERS.declineReasons || [];
    if (!allowedReasons.includes(reason)) {
      return { ok: false, error: 'سبب الرفض غير صالح', code: 'INVALID_REASON' };
    }
    cleanReason = reason;
  }

  offer.status = 'declined';
  offer.declinedAt = new Date().toISOString();
  offer.declinedReason = cleanReason;
  offer.updatedAt = offer.declinedAt;

  await atomicWrite(offerPath, offer);

  eventBus.emit('direct_offer:declined', {
    offerId,
    employerId: offer.employerId,
    workerId: offer.workerId,
    reason: cleanReason,
  });

  logger.info('Direct offer declined', { offerId, workerId, reason: cleanReason });

  return { ok: true, offer: redactOfferForViewer(offer, workerId) };
}

// ═══════════════════════════════════════════════════════════════
// Withdraw
// ═══════════════════════════════════════════════════════════════

/**
 * Employer withdraws a pending offer.
 * @param {string} offerId
 * @param {string} employerId
 * @returns {Promise<{ ok: boolean, offer?: object, error?: string, code?: string }>}
 */
export async function withdraw(offerId, employerId) {
  const offerPath = getRecordPath('direct_offers', offerId);
  const offer = await readJSON(offerPath);

  if (!offer) {
    return { ok: false, error: 'العرض غير موجود', code: 'OFFER_NOT_FOUND' };
  }

  if (offer.employerId !== employerId) {
    return { ok: false, error: 'مش مسموحلك تسحب هذا العرض', code: 'NOT_OFFER_OWNER' };
  }

  if (offer.status !== 'pending') {
    return { ok: false, error: 'لا يمكن سحب العرض الآن', code: 'OFFER_NOT_PENDING' };
  }

  offer.status = 'withdrawn';
  offer.withdrawnAt = new Date().toISOString();
  offer.updatedAt = offer.withdrawnAt;

  await atomicWrite(offerPath, offer);

  eventBus.emit('direct_offer:withdrawn', {
    offerId,
    employerId: offer.employerId,
    workerId: offer.workerId,
  });

  logger.info('Direct offer withdrawn', { offerId, employerId });

  return { ok: true, offer: redactOfferForViewer(offer, employerId) };
}

// ═══════════════════════════════════════════════════════════════
// Expire
// ═══════════════════════════════════════════════════════════════

/**
 * Mark a pending offer as expired.
 * Called by per-offer setTimeout + cleanupExpired sweep.
 *
 * @param {string} offerId
 * @returns {Promise<boolean>}
 */
export async function expireOffer(offerId) {
  const offerPath = getRecordPath('direct_offers', offerId);
  const offer = await readJSON(offerPath);

  if (!offer) return false;
  if (offer.status !== 'pending') return false;

  offer.status = 'expired';
  offer.expiredAt = new Date().toISOString();
  offer.updatedAt = offer.expiredAt;

  await atomicWrite(offerPath, offer);

  eventBus.emit('direct_offer:expired', {
    offerId,
    employerId: offer.employerId,
    workerId: offer.workerId,
  });

  logger.info('Direct offer expired', { offerId });
  return true;
}

/**
 * Periodic sweep: find pending offers that have exceeded their expiresAt and expire them.
 * Called by cleanup timer.
 * Fire-and-forget per offer — never throws.
 *
 * @returns {Promise<number>} count expired
 */
export async function cleanupExpired() {
  if (!config.DIRECT_OFFERS || !config.DIRECT_OFFERS.enabled) return 0;

  let all;
  try {
    const dir = getCollectionPath('direct_offers');
    all = await listJSON(dir);
  } catch (_) {
    return 0;
  }

  const offers = all.filter(o => o && o.id && o.id.startsWith('dof_') && o.status === 'pending');
  if (offers.length === 0) return 0;

  const now = Date.now();
  const buffer = config.DIRECT_OFFERS.expiryBufferMs || 0;
  let count = 0;

  for (const offer of offers) {
    try {
      const expiresMs = new Date(offer.expiresAt).getTime();
      if (now > expiresMs + buffer) {
        const did = await expireOffer(offer.id);
        if (did) count++;
      }
    } catch (_) { /* fire-and-forget per offer */ }
  }

  return count;
}

// ═══════════════════════════════════════════════════════════════
// Read APIs
// ═══════════════════════════════════════════════════════════════

/**
 * Find offer by ID (raw — no redaction).
 * @param {string} offerId
 * @returns {Promise<object|null>}
 */
export async function findById(offerId) {
  return await readJSON(getRecordPath('direct_offers', offerId));
}

/**
 * List offers by employer (newest first, paginated, redacted).
 * @param {string} employerId
 * @param {{ status?: string, limit?: number, offset?: number }} options
 * @returns {Promise<{ offers: object[], total: number, limit: number, offset: number }>}
 */
export async function listByEmployer(employerId, options = {}) {
  const ids = await getFromSetIndex(EMPLOYER_OFFERS_INDEX, employerId);
  let offers = [];
  for (const oid of ids) {
    const offer = await readJSON(getRecordPath('direct_offers', oid));
    if (offer) offers.push(offer);
  }

  if (options.status) {
    offers = offers.filter(o => o.status === options.status);
  }

  offers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = offers.length;
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = Math.max(0, options.offset || 0);
  const sliced = offers.slice(offset, offset + limit);

  return {
    offers: sliced.map(o => redactOfferForViewer(o, employerId)),
    total,
    limit,
    offset,
  };
}

/**
 * List offers by worker (newest first, paginated, redacted).
 * @param {string} workerId
 * @param {{ status?: string, limit?: number, offset?: number }} options
 * @returns {Promise<{ offers: object[], total: number, limit: number, offset: number }>}
 */
export async function listByWorker(workerId, options = {}) {
  const ids = await getFromSetIndex(WORKER_OFFERS_INDEX, workerId);
  let offers = [];
  for (const oid of ids) {
    const offer = await readJSON(getRecordPath('direct_offers', oid));
    if (offer) offers.push(offer);
  }

  if (options.status) {
    offers = offers.filter(o => o.status === options.status);
  }

  offers.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const total = offers.length;
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = Math.max(0, options.offset || 0);
  const sliced = offers.slice(offset, offset + limit);

  return {
    offers: sliced.map(o => redactOfferForViewer(o, workerId)),
    total,
    limit,
    offset,
  };
}

// ═══════════════════════════════════════════════════════════════
// Stats (for /api/health)
// ═══════════════════════════════════════════════════════════════

/**
 * Aggregate stats for health endpoint.
 * @returns {Promise<{ activePending: number, expiredLastHour: number, acceptedLastHour: number, declinedLastHour: number }>}
 */
export async function getStats() {
  if (!config.DIRECT_OFFERS || !config.DIRECT_OFFERS.enabled) {
    return { activePending: 0, expiredLastHour: 0, acceptedLastHour: 0, declinedLastHour: 0 };
  }

  let all;
  try {
    const dir = getCollectionPath('direct_offers');
    all = await listJSON(dir);
  } catch (_) {
    return { activePending: 0, expiredLastHour: 0, acceptedLastHour: 0, declinedLastHour: 0 };
  }

  const offers = all.filter(o => o && o.id && o.id.startsWith('dof_'));
  const hourAgo = Date.now() - 60 * 60 * 1000;

  let activePending = 0;
  let expiredLastHour = 0;
  let acceptedLastHour = 0;
  let declinedLastHour = 0;

  for (const offer of offers) {
    if (offer.status === 'pending') activePending++;

    const updatedMs = new Date(offer.updatedAt || offer.createdAt).getTime();
    if (updatedMs >= hourAgo) {
      if (offer.status === 'expired') expiredLastHour++;
      else if (offer.status === 'accepted') acceptedLastHour++;
      else if (offer.status === 'declined') declinedLastHour++;
    }
  }

  return { activePending, expiredLastHour, acceptedLastHour, declinedLastHour };
}

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

export const _testHelpers = { validateFields, redactName };
