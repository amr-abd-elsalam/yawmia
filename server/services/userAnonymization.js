// ═══════════════════════════════════════════════════════════════
// server/services/userAnonymization.js — User Privacy Anonymization (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Previewable and idempotent anonymization workflow.
// Does not blindly delete financial or audit records.
// ═══════════════════════════════════════════════════════════════

import crypto from 'node:crypto';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  deleteJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
  readIndex,
  writeIndex,
} from './database.js';
import { eventBus } from './eventBus.js';
import { logger } from './logger.js';

function nowIso() {
  return new Date().toISOString();
}

function anonMarker(userId) {
  const hash = crypto.createHash('sha256').update(String(userId)).digest('hex').slice(0, 12);
  return `${config.PRIVACY_REQUESTS?.anonymizeUserIdPrefix || 'anon_'}${hash}`;
}

async function listCollection(collection) {
  try {
    const dir = getCollectionPath(collection);
    return await listJSON(dir);
  } catch (_) {
    return [];
  }
}

function isUserAlreadyAnonymized(user) {
  return !!(user && (user.status === 'anonymized' || user.anonymizedAt));
}

function countRelated(rows, userId, fields) {
  return rows.filter(r => r && fields.some(f => r[f] === userId)).length;
}

async function collectAffectedCounts(userId) {
  const [
    sessions,
    applications,
    jobs,
    attendance,
    payments,
    ratings,
    reports,
    verifications,
    notifications,
    directOffers,
    messages,
    predictiveSignals,
  ] = await Promise.all([
    listCollection('sessions'),
    listCollection('applications'),
    listCollection('jobs'),
    listCollection('attendance'),
    listCollection('payments'),
    listCollection('ratings'),
    listCollection('reports'),
    listCollection('verifications'),
    listCollection('notifications'),
    listCollection('direct_offers'),
    listCollection('messages'),
    listCollection('predictive_signals'),
  ]);

  return {
    sessions: countRelated(sessions, userId, ['userId']),
    applications: countRelated(applications, userId, ['workerId']),
    jobs: countRelated(jobs, userId, ['employerId']),
    attendance: countRelated(attendance, userId, ['workerId', 'employerId']),
    payments: countRelated(payments, userId, ['employerId', 'disputedBy']),
    ratings: countRelated(ratings, userId, ['fromUserId', 'toUserId']),
    reports: countRelated(reports, userId, ['reporterId', 'targetId']),
    verifications: countRelated(verifications, userId, ['userId']),
    notifications: countRelated(notifications, userId, ['userId']),
    directOffers: countRelated(directOffers, userId, ['employerId', 'workerId']),
    messages: countRelated(messages, userId, ['senderId', 'recipientId']),
    predictiveSignals: countRelated(predictiveSignals, userId, ['entityId', 'relatedUserId']),
  };
}

/**
 * Preview anonymization.
 */
export async function previewUserAnonymization(userId, options = {}) {
  const { findById } = await import('./users.js');
  const user = await findById(userId);

  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND', error: 'user not found' };
  }

  if (user.role === 'admin') {
    return { ok: false, code: 'CANNOT_ANONYMIZE_ADMIN', error: 'cannot anonymize admin users' };
  }

  const counts = await collectAffectedCounts(userId);

  return {
    ok: true,
    userId,
    anonymized: isUserAlreadyAnonymized(user),
    anonId: anonMarker(userId),
    counts,
    destructive: true,
    dryRun: true,
    policy: {
      deleteVerificationImagesOnAnonymize: !!config.PRIVACY_REQUESTS?.deleteVerificationImagesOnAnonymize,
      deleteSessionsOnAnonymize: config.PRIVACY_REQUESTS?.deleteSessionsOnAnonymize !== false,
      preserveFinancialRecords: true,
      preserveAuditRecords: true,
      preserveMessageHistory: true,
    },
  };
}

async function destroySessions(userId) {
  if (config.PRIVACY_REQUESTS?.deleteSessionsOnAnonymize === false) return 0;
  const { destroyAllByUser } = await import('./sessions.js');
  return await destroyAllByUser(userId);
}

async function anonymizeUserRecord(user) {
  const now = nowIso();
  const marker = anonMarker(user.id);

  const phoneIndex = await readIndex('phoneIndex');
  if (user.phone && phoneIndex[user.phone]) {
    delete phoneIndex[user.phone];
    await writeIndex('phoneIndex', phoneIndex);
  }

  const next = {
    ...user,
    phone: marker,
    name: 'مستخدم محذوف',
    governorate: null,
    categories: [],
    lat: null,
    lng: null,
    notificationPreferences: null,
    verificationStatus: 'unverified',
    verificationSubmittedAt: null,
    status: 'anonymized',
    anonymizedAt: user.anonymizedAt || now,
    deletedAt: user.deletedAt || now,
    updatedAt: now,
  };

  await atomicWrite(getRecordPath('users', user.id), next);
  return next;
}

async function anonymizeVerifications(userId) {
  const rows = await listCollection('verifications');
  let updated = 0;
  let deletedImages = 0;

  for (const v of rows) {
    if (!v || v.userId !== userId) continue;

    const refs = [v.nationalIdImageRef, v.selfieImageRef].filter(Boolean);

    if (config.PRIVACY_REQUESTS?.deleteVerificationImagesOnAnonymize) {
      try {
        const { deleteImage } = await import('./imageStore.js');
        for (const ref of refs) {
          const did = await deleteImage(ref).catch(() => false);
          if (did) deletedImages++;
        }
      } catch (_) {}
    }

    v.nationalIdImageRef = null;
    v.selfieImageRef = null;
    v.nationalIdImage = null;
    v.selfieImage = null;
    v.status = v.status === 'pending' ? 'rejected' : v.status;
    v.adminNotes = v.adminNotes ? '[redacted due to privacy request]' : v.adminNotes;
    v.updatedAt = nowIso();

    await atomicWrite(getRecordPath('verifications', v.id), v);
    updated++;
  }

  return { updated, deletedImages };
}

async function deleteUserNotifications(userId) {
  const rows = await listCollection('notifications');
  let deleted = 0;

  for (const n of rows) {
    if (!n || n.userId !== userId) continue;
    await deleteJSON(getRecordPath('notifications', n.id)).catch(() => {});
    deleted++;
  }

  return deleted;
}

async function scrubDirectOffers(userId) {
  const rows = await listCollection('direct_offers');
  let updated = 0;

  for (const offer of rows) {
    if (!offer || (offer.employerId !== userId && offer.workerId !== userId)) continue;

    if (offer.employerId === userId) {
      if (offer.preAcceptEmployerSummary) {
        offer.preAcceptEmployerSummary.displayName = 'مستخدم محذوف';
      }
      if (offer.revealedToWorker) {
        offer.revealedToWorker.employerName = 'مستخدم محذوف';
        offer.revealedToWorker.employerPhone = null;
      }
    }

    if (offer.workerId === userId) {
      if (offer.preAcceptWorkerSummary) {
        offer.preAcceptWorkerSummary.displayName = 'مستخدم محذوف';
      }
      if (offer.revealedToEmployer) {
        offer.revealedToEmployer.workerName = 'مستخدم محذوف';
        offer.revealedToEmployer.workerPhone = null;
      }
    }

    offer.privacyAnonymizedAt = offer.privacyAnonymizedAt || nowIso();
    offer.updatedAt = nowIso();

    await atomicWrite(getRecordPath('direct_offers', offer.id), offer);
    updated++;
  }

  return updated;
}

async function scrubPredictiveSignals(userId) {
  const rows = await listCollection('predictive_signals');
  let updated = 0;

  for (const sig of rows) {
    if (!sig || (sig.entityId !== userId && sig.relatedUserId !== userId)) continue;

    sig.entityAnonymized = sig.entityAnonymized || sig.entityId === userId;
    sig.relatedUserAnonymized = sig.relatedUserAnonymized || sig.relatedUserId === userId;
    sig.privacyAnonymizedAt = sig.privacyAnonymizedAt || nowIso();
    sig.updatedAt = nowIso();

    await atomicWrite(getRecordPath('predictive_signals', sig.id), sig);
    updated++;
  }

  return updated;
}

/**
 * Confirm anonymization. Idempotent.
 */
export async function anonymizeUserData(userId, options = {}) {
  const preview = await previewUserAnonymization(userId, options);
  if (!preview.ok) return preview;

  if (options.dryRun || options.preview) {
    return preview;
  }

  const { findById } = await import('./users.js');
  const user = await findById(userId);
  if (!user) return { ok: false, code: 'USER_NOT_FOUND', error: 'user not found' };

  if (isUserAlreadyAnonymized(user)) {
    return {
      ok: true,
      idempotent: true,
      userId,
      anonId: anonMarker(userId),
      counts: preview.counts,
      result: {
        alreadyAnonymized: true,
      },
    };
  }

  const started = Date.now();

  const result = {
    sessionsDestroyed: 0,
    userUpdated: false,
    verificationsUpdated: 0,
    verificationImagesDeleted: 0,
    notificationsDeleted: 0,
    directOffersScrubbed: 0,
    predictiveSignalsScrubbed: 0,
    financialRecordsPreserved: true,
    auditRecordsPreserved: true,
    messageHistoryPreserved: true,
  };

  try {
    result.sessionsDestroyed = await destroySessions(userId);
    await anonymizeUserRecord(user);
    result.userUpdated = true;

    const vrf = await anonymizeVerifications(userId);
    result.verificationsUpdated = vrf.updated;
    result.verificationImagesDeleted = vrf.deletedImages;

    result.notificationsDeleted = await deleteUserNotifications(userId);
    result.directOffersScrubbed = await scrubDirectOffers(userId);
    result.predictiveSignalsScrubbed = await scrubPredictiveSignals(userId);

    eventBus.emit('privacy:user_anonymized', {
      userId,
      anonId: anonMarker(userId),
      durationMs: Date.now() - started,
      timestamp: nowIso(),
    });

    return {
      ok: true,
      userId,
      anonId: anonMarker(userId),
      counts: preview.counts,
      result,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    logger.error('userAnonymization: anonymizeUserData failed', { userId, error: err.message });
    return {
      ok: false,
      code: 'ANONYMIZATION_FAILED',
      error: err.message,
      partialResult: result,
    };
  }
}

export const _testHelpers = {
  anonMarker,
  isUserAlreadyAnonymized,
  collectAffectedCounts,
};
