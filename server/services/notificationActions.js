// ═══════════════════════════════════════════════════════════════
// server/services/notificationActions.js — Safe Actionable Notifications (Phase 53)
// ═══════════════════════════════════════════════════════════════
// Builds safe relative action URLs for notifications.
// Additive only: old notifications without action remain valid.
// Security:
//   - relative URLs only
//   - allowlisted prefixes only
//   - rejects open redirects / javascript: / path traversal
// ═══════════════════════════════════════════════════════════════

import config from '../../config.js';

function isEnabled() {
  return !!(config.NOTIFICATION_ACTIONS && config.NOTIFICATION_ACTIONS.enabled);
}

export function getDefaultAction() {
  const url = config.NOTIFICATION_ACTIONS?.defaultUrl || '/dashboard.html';
  return {
    type: 'default',
    url,
    entityType: null,
    entityId: null,
  };
}

function safeId(value) {
  if (!value || typeof value !== 'string') return '';
  if (value.length > 100) return '';
  if (value.includes('..')) return '';
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) return '';
  return value;
}

function buildUrl(path, params = {}, hash = '') {
  const query = [];
  for (const [key, value] of Object.entries(params)) {
    const clean = safeId(value);
    if (!clean) continue;
    query.push(`${encodeURIComponent(key)}=${encodeURIComponent(clean)}`);
  }

  let url = path;
  if (query.length > 0) url += '?' + query.join('&');
  if (hash) url += hash.startsWith('#') ? hash : '#' + hash;
  return sanitizeActionUrl(url);
}

export function isAllowedActionUrl(url) {
  if (!isEnabled()) return false;
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  const lower = trimmed.toLowerCase();

  // Absolute/protocol/open-redirect guards.
  if (lower.startsWith('http://')) return false;
  if (lower.startsWith('https://')) return false;
  if (lower.startsWith('//')) return false;
  if (lower.startsWith('javascript:')) return false;
  if (lower.startsWith('data:')) return false;
  if (lower.startsWith('vbscript:')) return false;

  // Must be root-relative.
  if (!trimmed.startsWith('/')) return false;

  // No backslashes or traversal, including encoded traversal.
  if (trimmed.includes('\\')) return false;
  if (trimmed.includes('..')) return false;

  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch (_) {
    return false;
  }

  if (decoded.includes('\\')) return false;
  if (decoded.includes('..')) return false;

  const allowed = config.NOTIFICATION_ACTIONS?.allowedUrlPrefixes || ['/dashboard.html'];
  return allowed.some(prefix => trimmed.startsWith(prefix));
}

export function sanitizeActionUrl(url) {
  const fallback = config.NOTIFICATION_ACTIONS?.defaultUrl || '/dashboard.html';
  if (!isAllowedActionUrl(url)) return fallback;
  return url.trim();
}

export function buildNotificationAction(type, meta = {}, userRole) {
  if (!isEnabled()) return getDefaultAction();

  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const jobId = safeMeta.jobId;
  const userId = safeMeta.userId || safeMeta.toUserId || safeMeta.targetId;
  const offerId = safeMeta.offerId;

  function jobAction(actionType, hash) {
    return {
      type: actionType,
      url: buildUrl('/job.html', { id: jobId }, hash || ''),
      entityType: 'job',
      entityId: safeId(jobId) || null,
    };
  }

  function profileAction(actionType, hash) {
    const url = hash ? `/profile.html${hash}` : '/profile.html';
    return {
      type: actionType,
      url: sanitizeActionUrl(url),
      entityType: 'profile',
      entityId: null,
    };
  }

  switch (type) {
    case 'application_accepted':
      return jobAction('job_workroom', '#workroom');

    case 'application_rejected':
    case 'new_application':
    case 'job_filled':
    case 'job_cancelled':
    case 'job_renewed':
    case 'job_expiry_warning':
    case 'job_alert_match':
    case 'job_match':
    case 'job_nearby':
      return jobAction('job_detail');

    case 'payment_created':
    case 'payment_disputed':
    case 'payment_completed':
    case 'direct_offer_accepted':
      return jobAction('job_workroom', '#workroom');

    case 'new_message':
      return jobAction('workroom_messages', '#workroom-messages');

    case 'rating_received':
      if (userId && safeId(userId)) {
        return {
          type: 'user_profile',
          url: buildUrl('/user.html', { id: userId }),
          entityType: 'user',
          entityId: safeId(userId),
        };
      }
      return profileAction('profile');

    case 'direct_offer':
      return {
        type: 'direct_offer',
        url: sanitizeActionUrl('/dashboard.html'),
        entityType: 'direct_offer',
        entityId: safeId(offerId) || null,
      };

    case 'direct_offer_declined':
    case 'direct_offer_expired':
      return profileAction('direct_offers', '#directOffersSection');

    case 'verification_reviewed':
      return profileAction('verification', '#verification-section');

    case 'admin_warning':
    case 'activity_summary':
      return profileAction('profile');

    case 'terms_required':
      return {
        type: 'terms',
        url: sanitizeActionUrl('/terms.html?accept=1'),
        entityType: 'terms',
        entityId: null,
      };

    default:
      return getDefaultAction();
  }
}

export function attachAction(notification, userRole) {
  if (!notification || typeof notification !== 'object') return notification;

  const existingAction = notification.action;
  if (existingAction && typeof existingAction === 'object') {
    return {
      ...notification,
      action: {
        ...existingAction,
        url: sanitizeActionUrl(existingAction.url),
      },
    };
  }

  const action = buildNotificationAction(notification.type, notification.meta || {}, userRole);
  return { ...notification, action };
}

export const _testHelpers = {
  safeId,
  buildUrl,
  isEnabled,
};
