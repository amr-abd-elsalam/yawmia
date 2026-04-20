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

  return {
    escapeHtml: escapeHtml,
    starsDisplay: starsDisplay,
    starsText: starsText,
    timeAgo: timeAgo,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    statusLabel: statusLabel,
    roleLabel: roleLabel,
  };
})();
