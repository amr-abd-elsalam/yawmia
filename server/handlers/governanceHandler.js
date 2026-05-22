// ═══════════════════════════════════════════════════════════════
// server/handlers/governanceHandler.js — Governance Admin APIs (Phase 58)
// ═══════════════════════════════════════════════════════════════
// Admin RBAC, approvals, privacy requests, ops review records,
// and incident postmortems.
// ═══════════════════════════════════════════════════════════════

import { logAction } from '../services/auditLog.js';
import {
  getAdminRole,
  getRbacMatrix,
  listRoleCapabilities,
} from '../services/adminRbac.js';

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function adminId(req) {
  return req.user?.id || 'admin_token';
}

function adminRole(req) {
  return req.adminRole || getAdminRole(req);
}

function requestIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

function safeNote(value, max = 1000) {
  if (!value || typeof value !== 'string') return null;
  return value.trim().slice(0, max) || null;
}

function audit(req, action, targetType, targetId, details = {}) {
  logAction({
    adminId: adminId(req),
    action,
    targetType,
    targetId,
    details,
    ip: requestIp(req),
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// RBAC
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/rbac/matrix
 */
export async function handleAdminRbacMatrix(req, res) {
  try {
    return sendJSON(res, 200, {
      ok: true,
      rbac: getRbacMatrix(),
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب نموذج صلاحيات الأدمن',
      code: 'RBAC_MATRIX_ERROR',
    });
  }
}

/**
 * GET /api/admin/rbac/me
 */
export async function handleAdminRbacMe(req, res) {
  try {
    const role = adminRole(req);
    return sendJSON(res, 200, {
      ok: true,
      role,
      capabilities: listRoleCapabilities(role),
      isTokenAdmin: !!(req.isAdmin && !req.user),
      userId: req.user?.id || null,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب صلاحيات الأدمن الحالية',
      code: 'RBAC_ME_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Admin Approvals
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/approvals
 */
export async function handleListApprovals(req, res) {
  try {
    const { listApprovals } = await import('../services/adminApprovals.js');

    const result = await listApprovals({
      status: req.query.status || undefined,
      action: req.query.action || undefined,
      targetId: req.query.targetId || undefined,
      requestedBy: req.query.requestedBy || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب موافقات إجراءات الأدمن',
      code: 'APPROVALS_LIST_ERROR',
    });
  }
}

/**
 * POST /api/admin/approvals
 * Body: { action, targetType, targetId, reason, payload? }
 */
export async function handleCreateApproval(req, res) {
  try {
    const { createApprovalRequest } = await import('../services/adminApprovals.js');

    const body = req.body || {};
    const result = await createApprovalRequest({
      action: body.action,
      targetType: body.targetType || 'unknown',
      targetId: body.targetId || 'unknown',
      requestedBy: adminId(req),
      reason: body.reason || null,
      payload: body.payload || {},
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'APPROVAL_CREATE_FAILED',
      });
    }

    audit(req, 'admin_approval_created', 'admin_approval', result.approval.id, {
      action: result.approval.action,
      targetType: result.approval.targetType,
      targetId: result.approval.targetId,
    });

    return sendJSON(res, 201, {
      ok: true,
      approval: result.approval,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء طلب الموافقة',
      code: 'APPROVAL_CREATE_ERROR',
    });
  }
}

/**
 * POST /api/admin/approvals/:id/approve
 * Body: { note? }
 */
export async function handleApproveApproval(req, res) {
  try {
    const { approveRequest } = await import('../services/adminApprovals.js');

    const result = await approveRequest(
      req.params.id,
      adminId(req),
      safeNote(req.body?.note)
    );

    if (!result.ok) {
      const status = result.code === 'APPROVAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'APPROVAL_APPROVE_FAILED',
      });
    }

    audit(req, 'admin_approval_approved', 'admin_approval', req.params.id, {
      action: result.approval.action,
      targetId: result.approval.targetId,
    });

    return sendJSON(res, 200, {
      ok: true,
      approval: result.approval,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في الموافقة على الطلب',
      code: 'APPROVAL_APPROVE_ERROR',
    });
  }
}

/**
 * POST /api/admin/approvals/:id/reject
 * Body: { note? }
 */
export async function handleRejectApproval(req, res) {
  try {
    const { rejectRequest } = await import('../services/adminApprovals.js');

    const result = await rejectRequest(
      req.params.id,
      adminId(req),
      safeNote(req.body?.note)
    );

    if (!result.ok) {
      const status = result.code === 'APPROVAL_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'APPROVAL_REJECT_FAILED',
      });
    }

    audit(req, 'admin_approval_rejected', 'admin_approval', req.params.id, {
      action: result.approval.action,
      targetId: result.approval.targetId,
    });

    return sendJSON(res, 200, {
      ok: true,
      approval: result.approval,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في رفض طلب الموافقة',
      code: 'APPROVAL_REJECT_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Privacy Requests
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/privacy/requests
 */
export async function handleListPrivacyRequests(req, res) {
  try {
    const { listPrivacyRequests } = await import('../services/privacyRequests.js');

    const result = await listPrivacyRequests({
      status: req.query.status || undefined,
      type: req.query.type || undefined,
      userId: req.query.userId || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب طلبات الخصوصية',
      code: 'PRIVACY_REQUESTS_LIST_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests
 * Body: { type, userId, reason?, approvalId? }
 */
export async function handleCreatePrivacyRequest(req, res) {
  try {
    const { createPrivacyRequest } = await import('../services/privacyRequests.js');

    const body = req.body || {};
    const result = await createPrivacyRequest({
      type: body.type,
      userId: body.userId,
      requestedBy: adminId(req),
      reason: body.reason || null,
      approvalId: body.approvalId || null,
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_REQUEST_CREATE_FAILED',
      });
    }

    audit(req, 'privacy_request_created', 'privacy_request', result.request.id, {
      type: result.request.type,
      userId: result.request.userId,
    });

    return sendJSON(res, 201, {
      ok: true,
      request: result.request,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء طلب الخصوصية',
      code: 'PRIVACY_REQUEST_CREATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/privacy/requests/:id
 */
export async function handleGetPrivacyRequest(req, res) {
  try {
    const { getPrivacyRequest } = await import('../services/privacyRequests.js');

    const request = await getPrivacyRequest(req.params.id);
    if (!request) {
      return sendJSON(res, 404, {
        error: 'طلب الخصوصية غير موجود',
        code: 'PRIVACY_REQUEST_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, request });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب طلب الخصوصية',
      code: 'PRIVACY_REQUEST_GET_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/export
 */
export async function handleQueuePrivacyExport(req, res) {
  try {
    const { queuePrivacyExport } = await import('../services/privacyRequests.js');

    const result = await queuePrivacyExport(req.params.id, adminId(req));

    if (!result.ok) {
      const status = result.code === 'PRIVACY_REQUEST_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_EXPORT_QUEUE_FAILED',
      });
    }

    audit(req, 'privacy_export_queued', 'privacy_request', req.params.id, {
      queueJobId: result.queueJob?.id || null,
      userId: result.request?.userId || null,
    });

    return sendJSON(res, 202, {
      ok: true,
      queued: true,
      request: result.request,
      queueJobId: result.queueJob?.id || null,
      queueJob: result.queueJob || null,
      deduped: !!result.deduped,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في وضع تصدير بيانات المستخدم في الطابور',
      code: 'PRIVACY_EXPORT_QUEUE_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/anonymize
 * Body: { approvalId }
 */
export async function handleQueuePrivacyAnonymize(req, res) {
  try {
    const { queueUserAnonymization } = await import('../services/privacyRequests.js');

    const result = await queueUserAnonymization(
      req.params.id,
      adminId(req),
      req.body?.approvalId || null
    );

    if (!result.ok) {
      const status = result.code === 'PRIVACY_REQUEST_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_ANONYMIZE_QUEUE_FAILED',
      });
    }

    audit(req, 'privacy_anonymization_queued', 'privacy_request', req.params.id, {
      queueJobId: result.queueJob?.id || null,
      userId: result.request?.userId || null,
      approvalId: result.request?.approvalId || null,
    });

    return sendJSON(res, 202, {
      ok: true,
      queued: true,
      request: result.request,
      queueJobId: result.queueJob?.id || null,
      queueJob: result.queueJob || null,
      deduped: !!result.deduped,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في وضع إخفاء بيانات المستخدم في الطابور',
      code: 'PRIVACY_ANONYMIZE_QUEUE_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/anonymize-preview
 * Returns anonymization preview for request.userId.
 */
export async function handlePreviewPrivacyAnonymize(req, res) {
  try {
    const { getPrivacyRequest } = await import('../services/privacyRequests.js');
    const { previewUserAnonymization } = await import('../services/userAnonymization.js');

    const request = await getPrivacyRequest(req.params.id);
    if (!request) {
      return sendJSON(res, 404, {
        error: 'طلب الخصوصية غير موجود',
        code: 'PRIVACY_REQUEST_NOT_FOUND',
      });
    }

    if (request.type !== 'user_anonymization') {
      return sendJSON(res, 400, {
        error: 'هذا الطلب ليس طلب إخفاء بيانات',
        code: 'INVALID_REQUEST_TYPE',
      });
    }

    const preview = await previewUserAnonymization(request.userId, {
      requestId: request.id,
    });

    if (!preview.ok) {
      return sendJSON(res, 400, {
        error: preview.error || preview.code,
        code: preview.code || 'ANONYMIZATION_PREVIEW_FAILED',
      });
    }

    audit(req, 'privacy_anonymization_previewed', 'privacy_request', req.params.id, {
      userId: request.userId,
      counts: preview.counts || {},
    });

    return sendJSON(res, 200, {
      ok: true,
      preview,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في معاينة إخفاء البيانات',
      code: 'PRIVACY_ANONYMIZE_PREVIEW_ERROR',
    });
  }
}

/**
 * POST /api/admin/privacy/requests/:id/cancel
 */
export async function handleCancelPrivacyRequest(req, res) {
  try {
    const { cancelPrivacyRequest } = await import('../services/privacyRequests.js');

    const result = await cancelPrivacyRequest(req.params.id, adminId(req));

    if (!result.ok) {
      const status = result.code === 'PRIVACY_REQUEST_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'PRIVACY_REQUEST_CANCEL_FAILED',
      });
    }

    audit(req, 'privacy_request_cancelled', 'privacy_request', req.params.id, {
      type: result.request?.type || null,
      userId: result.request?.userId || null,
    });

    return sendJSON(res, 200, {
      ok: true,
      request: result.request,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إلغاء طلب الخصوصية',
      code: 'PRIVACY_REQUEST_CANCEL_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Ops Review Records
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/ops/reviews
 */
export async function handleListOpsReviews(req, res) {
  try {
    const { listReviewRecords } = await import('../services/opsReviewRecords.js');

    const result = await listReviewRecords({
      type: req.query.type || undefined,
      status: req.query.status || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مراجعات التشغيل',
      code: 'OPS_REVIEWS_LIST_ERROR',
    });
  }
}

/**
 * POST /api/admin/ops/reviews
 */
export async function handleCreateOpsReview(req, res) {
  try {
    const { createReviewRecord } = await import('../services/opsReviewRecords.js');

    const body = req.body || {};
    const result = await createReviewRecord({
      type: body.type,
      title: body.title || body.type,
      summary: body.summary || '',
      findings: body.findings || [],
      actions: body.actions || [],
      refs: body.refs || {},
      createdBy: adminId(req),
      status: body.status || 'draft',
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'OPS_REVIEW_CREATE_FAILED',
      });
    }

    audit(req, 'ops_review_created', 'ops_review', result.review.id, {
      type: result.review.type,
      status: result.review.status,
    });

    return sendJSON(res, 201, {
      ok: true,
      review: result.review,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء مراجعة تشغيل',
      code: 'OPS_REVIEW_CREATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/ops/reviews/:id
 */
export async function handleGetOpsReview(req, res) {
  try {
    const { getReviewRecord } = await import('../services/opsReviewRecords.js');

    const review = await getReviewRecord(req.params.id);
    if (!review) {
      return sendJSON(res, 404, {
        error: 'مراجعة التشغيل غير موجودة',
        code: 'OPS_REVIEW_NOT_FOUND',
      });
    }

    return sendJSON(res, 200, { ok: true, review });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب مراجعة التشغيل',
      code: 'OPS_REVIEW_GET_ERROR',
    });
  }
}

/**
 * POST /api/admin/ops/reviews/:id/complete
 */
export async function handleCompleteOpsReview(req, res) {
  try {
    const { completeReviewRecord } = await import('../services/opsReviewRecords.js');

    const result = await completeReviewRecord(req.params.id, {
      ...req.body,
      completedBy: adminId(req),
    });

    if (!result.ok) {
      const status = result.code === 'REVIEW_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'OPS_REVIEW_COMPLETE_FAILED',
      });
    }

    audit(req, 'ops_review_completed', 'ops_review', req.params.id, {
      type: result.review.type,
    });

    return sendJSON(res, 200, {
      ok: true,
      review: result.review,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إكمال مراجعة التشغيل',
      code: 'OPS_REVIEW_COMPLETE_ERROR',
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// Postmortems
// ═══════════════════════════════════════════════════════════════

/**
 * GET /api/admin/incidents/:id/postmortem
 */
export async function handleGetIncidentPostmortem(req, res) {
  try {
    const { getPostmortemByIncident } = await import('../services/postmortemRecords.js');

    const postmortem = await getPostmortemByIncident(req.params.id);
    return sendJSON(res, 200, {
      ok: true,
      postmortem: postmortem || null,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Postmortem للحادث',
      code: 'POSTMORTEM_GET_BY_INCIDENT_ERROR',
    });
  }
}

/**
 * POST /api/admin/incidents/:id/postmortem
 */
export async function handleCreateIncidentPostmortem(req, res) {
  try {
    const { getIncident } = await import('../services/incidentTimeline.js');
    const { createPostmortem } = await import('../services/postmortemRecords.js');

    const incident = await getIncident(req.params.id);
    if (!incident) {
      return sendJSON(res, 404, {
        error: 'الحادث غير موجود',
        code: 'INCIDENT_NOT_FOUND',
      });
    }

    const body = req.body || {};
    const result = await createPostmortem({
      incidentId: req.params.id,
      severity: incident.severity || body.severity || null,
      summary: body.summary || incident.title || '',
      impact: body.impact || '',
      timeline: body.timeline || [],
      rootCause: body.rootCause || '',
      whatWentWell: body.whatWentWell || '',
      whatWentWrong: body.whatWentWrong || '',
      detection: body.detection || '',
      resolution: body.resolution || incident.resolutionNote || '',
      prevention: body.prevention || '',
      actionItems: body.actionItems || [],
      createdBy: adminId(req),
    });

    if (!result.ok) {
      return sendJSON(res, 400, {
        error: result.error || result.code,
        code: result.code || 'POSTMORTEM_CREATE_FAILED',
      });
    }

    audit(req, 'postmortem_created', 'incident', req.params.id, {
      postmortemId: result.postmortem.id,
    });

    return sendJSON(res, 201, {
      ok: true,
      postmortem: result.postmortem,
      alreadyExists: !!result.alreadyExists,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في إنشاء Postmortem',
      code: 'POSTMORTEM_CREATE_ERROR',
    });
  }
}

/**
 * PUT /api/admin/postmortems/:id
 */
export async function handleUpdatePostmortem(req, res) {
  try {
    const { updatePostmortem } = await import('../services/postmortemRecords.js');

    const result = await updatePostmortem(req.params.id, {
      ...(req.body || {}),
      updatedBy: adminId(req),
    });

    if (!result.ok) {
      const status = result.code === 'POSTMORTEM_NOT_FOUND' ? 404 : 400;
      return sendJSON(res, status, {
        error: result.error || result.code,
        code: result.code || 'POSTMORTEM_UPDATE_FAILED',
      });
    }

    audit(req, 'postmortem_updated', 'postmortem', req.params.id, {
      status: result.postmortem.status,
      incidentId: result.postmortem.incidentId,
    });

    return sendJSON(res, 200, {
      ok: true,
      postmortem: result.postmortem,
    });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في تحديث Postmortem',
      code: 'POSTMORTEM_UPDATE_ERROR',
    });
  }
}

/**
 * GET /api/admin/postmortems
 */
export async function handleListPostmortems(req, res) {
  try {
    const { listPostmortems } = await import('../services/postmortemRecords.js');

    const result = await listPostmortems({
      incidentId: req.query.incidentId || undefined,
      status: req.query.status || undefined,
      severity: req.query.severity || undefined,
      limit: parseInt(req.query.limit) || 20,
      offset: parseInt(req.query.offset) || 0,
    });

    return sendJSON(res, 200, { ok: true, ...result });
  } catch (err) {
    return sendJSON(res, 500, {
      error: 'خطأ في جلب Postmortems',
      code: 'POSTMORTEMS_LIST_ERROR',
    });
  }
}
