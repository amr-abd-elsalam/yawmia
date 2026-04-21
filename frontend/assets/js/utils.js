// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/utils.js — Shared Frontend Utilities (IIFE)
// Phase 18 — Deduplicated escapeHtml, starsDisplay, timeAgo, etc.
// ═══════════════════════════════════════════════════════════════

var YawmiaUtils = (function () {
  'use strict';

  /**
   * Escape HTML entities in a string.
   * Same implementation as previously duplicated across modules.
   */
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Star rating display using SVG icons from YawmiaIcons.
   * @param {number} rating — 0 to 5
   * @returns {string} HTML string with SVG star icons
   */
  function starsDisplay(rating) {
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    var html = '';
    var filledIcon = (typeof YawmiaIcons !== 'undefined') ? YawmiaIcons.get('starFilled', { size: 16, 'class': 'star-icon star-filled' }) : '★';
    var emptyIcon = (typeof YawmiaIcons !== 'undefined') ? YawmiaIcons.get('star', { size: 16, 'class': 'star-icon star-empty' }) : '☆';
    for (var i = 0; i < full; i++) html += filledIcon;
    for (var j = 0; j < half; j++) html += emptyIcon;
    for (var k = 0; k < empty; k++) html += emptyIcon;
    return html;
  }

  /**
   * Unicode text-based star rating (for non-SVG contexts like admin tables).
   * @param {number} rating — 0 to 5
   * @returns {string} Unicode star string
   */
  function starsText(rating) {
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    var str = '';
    for (var i = 0; i < full; i++) str += '★';
    if (half) str += '☆';
    for (var j = 0; j < empty; j++) str += '☆';
    return str;
  }

  /**
   * Relative time in Arabic (e.g., "منذ 5 دقائق").
   * @param {string} isoDate — ISO date string
   * @returns {string}
   */
  function timeAgo(isoDate) {
    if (!isoDate) return '';
    var now = Date.now();
    var then = new Date(isoDate).getTime();
    var diffMs = now - then;
    if (diffMs < 0) return 'الآن';

    var seconds = Math.floor(diffMs / 1000);
    var minutes = Math.floor(seconds / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);

    if (seconds < 60) return 'منذ لحظات';
    if (minutes < 60) return 'منذ ' + minutes + ' دقيقة';
    if (hours < 24) return 'منذ ' + hours + ' ساعة';
    if (days < 30) return 'منذ ' + days + ' يوم';
    return formatDate(isoDate);
  }

  /**
   * Format date in Arabic locale.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatDate(isoDate) {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleDateString('ar-EG');
    } catch (e) {
      return isoDate;
    }
  }

  /**
   * Format date+time in Arabic locale.
   * @param {string} isoDate
   * @returns {string}
   */
  function formatDateTime(isoDate) {
    if (!isoDate) return '';
    try {
      return new Date(isoDate).toLocaleString('ar-EG');
    } catch (e) {
      return isoDate;
    }
  }

  /**
   * Human-readable status label in Arabic.
   * Covers: job, application, payment, attendance, verification, user statuses.
   * @param {string} status
   * @returns {string}
   */
  function statusLabel(status) {
    var labels = {
      // Job statuses
      open: 'متاحة',
      filled: 'مكتملة العدد',
      in_progress: 'جاري التنفيذ',
      completed: 'مكتملة',
      expired: 'منتهية',
      cancelled: 'ملغية',
      // Application statuses
      pending: 'في الانتظار',
      accepted: 'مقبول',
      rejected: 'مرفوض',
      withdrawn: 'تم السحب',
      // Payment statuses
      employer_confirmed: 'تم تأكيد الدفع',
      disputed: 'نزاع',
      // Attendance statuses
      checked_in: 'حاضر',
      checked_out: 'انصرف',
      confirmed: 'مؤكد',
      no_show: 'غائب',
      // Verification statuses
      verified: 'محقق',
      unverified: 'غير محقق',
      // User statuses
      active: 'نشط',
      banned: 'محظور',
      deleted: 'محذوف',
    };
    return labels[status] || status || '';
  }

  /**
   * Role label in Arabic.
   * @param {string} role
   * @returns {string}
   */
  function roleLabel(role) {
    if (role === 'worker') return 'عامل';
    if (role === 'employer') return 'صاحب عمل';
    if (role === 'admin') return 'أدمن';
    return role || '';
  }

  /**
   * Generate skeleton loading HTML for job cards.
   * @param {number} count — number of skeleton cards to generate
   * @returns {string} HTML string
   */
  function skeletonJobCards(count) {
    var html = '';
    for (var i = 0; i < count; i++) {
      html +=
        '<div class="skeleton-card" style="margin-block-end: 1rem; padding: 1.25rem;">' +
          '<div style="display:flex;justify-content:space-between;margin-block-end:0.75rem;">' +
            '<div class="skeleton skeleton-text--lg" style="width: 50%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 20%;"></div>' +
          '</div>' +
          '<div style="display:flex;gap:0.75rem;margin-block-end:0.75rem;">' +
            '<div class="skeleton skeleton-text--sm" style="width: 25%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 20%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 15%;"></div>' +
          '</div>' +
          '<div class="skeleton skeleton-text" style="width: 90%;"></div>' +
          '<div class="skeleton skeleton-text" style="width: 70%;"></div>' +
          '<div style="display:flex;justify-content:space-between;margin-block-start:0.75rem;">' +
            '<div class="skeleton skeleton-text--sm" style="width: 30%;"></div>' +
            '<div class="skeleton skeleton-text--sm" style="width: 20%;"></div>' +
          '</div>' +
        '</div>';
    }
    return html;
  }

  /**
   * Trap focus within a container element.
   * Handles Tab cycling and Escape key to close.
   * @param {HTMLElement} container — the element to trap focus within
   * @param {Function} [onEscape] — callback when Escape is pressed
   * @returns {Function} cleanup — call to release the trap
   */
  function trapFocus(container, onEscape) {
    if (!container) return function () {};

    var focusableSelector = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

    function getFocusable() {
      return container.querySelectorAll(focusableSelector);
    }

    function handleKeydown(e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        if (typeof onEscape === 'function') {
          onEscape();
        }
        return;
      }

      if (e.key !== 'Tab' && e.keyCode !== 9) return;

      var focusable = getFocusable();
      if (focusable.length === 0) return;

      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    container.addEventListener('keydown', handleKeydown);

    // Focus first focusable element
    var initial = getFocusable();
    if (initial.length > 0) {
      initial[0].focus();
    }

    // Return cleanup function
    return function () {
      container.removeEventListener('keydown', handleKeydown);
    };
  }

  return {
    escapeHtml: escapeHtml,
    starsDisplay: starsDisplay,
    starsText: starsText,
    timeAgo: timeAgo,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    statusLabel: statusLabel,
    roleLabel: roleLabel,
    skeletonJobCards: skeletonJobCards,
    trapFocus: trapFocus,
  };
})();
