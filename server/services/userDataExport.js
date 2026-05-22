// ═══════════════════════════════════════════════════════════════
// server/services/userDataExport.js — Privacy-Safe User Data Export (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Generates user-scoped JSON export.
// Excludes raw secrets/session tokens/raw identity images.
// Does not expose unrevealed third-party phones.
// ═══════════════════════════════════════════════════════════════

import { join } from 'node:path';
import config from '../../config.js';
import {
  atomicWrite,
  readJSON,
  getRecordPath,
  getCollectionPath,
  listJSON,
} from './database.js';

const BASE_PATH = process.env.YAWMIA_DATA_PATH || config.DATABASE.basePath;

function nowIso() {
  return new Date().toISOString();
}

function exportPath(requestId) {
  return join(BASE_PATH, config.PRIVACY_REQUESTS?.basePath || 'privacy_requests', `${requestId}-export.json`);
}

function publicSafeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    role: user.role,
    name: user.name || null,
    phone: user.phone || null,
    governorate: user.governorate || null,
    categories: user.categories || [],
    lat: user.lat ?? null,
    lng: user.lng ?? null,
    rating: user.rating || { avg: 0, count: 0 },
    status: user.status,
    verificationStatus: user.verificationStatus || 'unverified',
    termsAcceptedAt: user.termsAcceptedAt || null,
    termsVersion: user.termsVersion || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null,
  };
}

function stripSession(session) {
  if (!session) return null;

  return {
    userId: session.userId,
    role: session.role,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    ip: session.ip || null,
    userAgent: session.userAgent ? String(session.userAgent).slice(0, 500) : null,
    token: '[redacted]',
  };
}

function verificationMetadata(v) {
  if (!v) return null;

  return {
    id: v.id,
    userId: v.userId,
    status: v.status,
    adminNotes: v.adminNotes || null,
    reviewedBy: v.reviewedBy || null,
    reviewedAt: v.reviewedAt || null,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt || null,
    nationalIdImageRef: v.nationalIdImageRef ? '[withheld]' : null,
    selfieImageRef: v.selfieImageRef ? '[withheld]' : null,
    nationalIdImage: v.nationalIdImage ? '[withheld]' : null,
    selfieImage: v.selfieImage ? '[withheld]' : null,
  };
}

function sanitizeOfferForExport(offer, userId) {
  if (!offer) return null;
  const copy = JSON.parse(JSON.stringify(offer));

  // Never include third-party phones in privacy export.
  if (copy.revealedToWorker && copy.revealedToWorker.employerId !== userId) {
    copy.revealedToWorker.employerPhone = '[redacted]';
  }
  if (copy.revealedToEmployer && copy.revealedToEmployer.workerId !== userId) {
    copy.revealedToEmployer.workerPhone = '[redacted]';
  }

  return copy;
}

function notificationExport(n) {
  if (!n) return null;
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    message: n.message,
    meta: n.meta || {},
    action: n.action || null,
    read: !!n.read,
    createdAt: n.createdAt,
    readAt: n.readAt || null,
  };
}

async function listCollection(collection) {
  try {
    const dir = getCollectionPath(collection);
    return await listJSON(dir);
  } catch (_) {
    return [];
  }
}

function relatedToUserByFields(row, userId, fields) {
  if (!row) return false;
  return fields.some(f => row[f] === userId);
}

/**
 * Generate privacy-safe export object.
 */
export async function generateUserDataExport(userId, options = {}) {
  if (!userId || typeof userId !== 'string') {
    return { ok: false, code: 'USER_ID_REQUIRED', error: 'userId is required' };
  }

  const { findById } = await import('./users.js');
  const user = await findById(userId);

  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND', error: 'user not found' };
  }

  const includeMessages = options.includeMessages !== false && config.PRIVACY_REQUESTS?.includeMessagesInExport !== false;
  const includeAuditRefs = !!options.includeAuditRefs && !!config.PRIVACY_REQUESTS?.includeAuditRefsInExport;

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
    workrooms,
    privacyRequests,
    audit,
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
    includeMessages ? listCollection('messages') : Promise.resolve([]),
    listCollection('workrooms'),
    listCollection('privacy_requests'),
    includeAuditRefs ? listCollection('audit') : Promise.resolve([]),
  ]);

  const ownedJobIds = new Set(jobs.filter(j => j.employerId === userId).map(j => j.id));
  const appJobIds = new Set(applications.filter(a => a.workerId === userId).map(a => a.jobId));
  const relatedJobIds = new Set([...ownedJobIds, ...appJobIds]);

  const exportObject = {
    kind: 'user_data_export',
    version: 1,
    generatedAt: nowIso(),
    userId,
    user: publicSafeUser(user),

    sessions: sessions
      .filter(s => s && s.userId === userId)
      .map(stripSession),

    jobs: jobs.filter(j => j && j.employerId === userId),

    applications: applications.filter(a => a && a.workerId === userId),

    attendance: attendance.filter(a =>
      relatedToUserByFields(a, userId, ['workerId', 'employerId'])
    ),

    payments: payments.filter(p =>
      p && (
        p.employerId === userId ||
        p.disputedBy === userId ||
        relatedJobIds.has(p.jobId)
      )
    ),

    ratings: ratings.filter(r =>
      relatedToUserByFields(r, userId, ['fromUserId', 'toUserId'])
    ),

    reports: reports.filter(r =>
      relatedToUserByFields(r, userId, ['reporterId', 'targetId'])
    ),

    verifications: verifications
      .filter(v => v && v.userId === userId)
      .map(verificationMetadata),

    notifications: notifications
      .filter(n => n && n.userId === userId)
      .map(notificationExport),

    directOffers: directOffers
      .filter(o => relatedToUserByFields(o, userId, ['employerId', 'workerId']))
      .map(o => sanitizeOfferForExport(o, userId)),

    workrooms: workrooms.filter(w => {
      if (!w) return false;
      if (w.employerId === userId || w.workerId === userId) return true;
      if (w.jobId && relatedJobIds.has(w.jobId)) return true;
      return false;
    }),

    messages: includeMessages
      ? messages.filter(m =>
          relatedToUserByFields(m, userId, ['senderId', 'recipientId']) ||
          (m.jobId && relatedJobIds.has(m.jobId))
        ).map(m => ({
          ...m,
          attachments: Array.isArray(m.attachments)
            ? m.attachments.map(a => ({ ...a, rawData: undefined, dataUri: undefined }))
            : [],
        }))
      : [],

    auditRefs: includeAuditRefs
      ? audit.filter(a =>
          a && (
            a.adminId === userId ||
            a.targetId === userId ||
            (a.details && JSON.stringify(a.details).includes(userId))
          )
        ).map(a => ({
          id: a.id,
          action: a.action,
          targetType: a.targetType,
          targetId: a.targetId,
          createdAt: a.createdAt,
          details: '[withheld]',
          ip: a.ip ? '[withheld]' : null,
        }))
      : [],

    privacyRequests: privacyRequests.filter(p => p && p.userId === userId),

    excluded: {
      sessionTokens: true,
      rawIdentityImages: true,
      rawImageBinaries: true,
      adminSecrets: true,
      unrevealedThirdPartyPhones: true,
      auditDetails: !includeAuditRefs,
    },
  };

  return { ok: true, export: exportObject };
}

/**
 * Persist export JSON for a privacy request.
 */
export async function persistUserDataExport(requestId, userId, options = {}) {
  const generated = await generateUserDataExport(userId, options);
  if (!generated.ok) return generated;

  const filePath = exportPath(requestId);
  await atomicWrite(filePath, generated.export);

  return {
    ok: true,
    export: generated.export,
    filePath,
    relativePath: `${config.PRIVACY_REQUESTS?.basePath || 'privacy_requests'}/${requestId}-export.json`,
  };
}

export const _testHelpers = {
  exportPath,
  stripSession,
  verificationMetadata,
  sanitizeOfferForExport,
  publicSafeUser,
};
