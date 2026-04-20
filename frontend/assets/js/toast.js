// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/toast.js — Toast Notification System (IIFE)
// Phase 19 — 4 types, SVG icons, aria-live, auto-dismiss
// ═══════════════════════════════════════════════════════════════

var YawmiaToast = (function () {
  'use strict';

  var container = null;
  var toastCounter = 0;

  var defaultIcons = {
    success: 'checkCircle',
    error: 'xCircle',
    warning: 'alertTriangle',
    info: 'info',
  };

  var defaultDuration = 4000;

  /**
   * Lazily create and return the toast container element.
   */
  function getContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(container);
    return container;
  }

  /**
   * Show a toast notification.
   * @param {string} message — text to display
   * @param {object} [options]
   * @param {string} [options.type='info'] — 'success'|'error'|'warning'|'info'
   * @param {number} [options.duration=4000] — auto-dismiss delay in ms (0 = no auto-dismiss)
   * @param {string} [options.icon] — icon name override from YawmiaIcons
   * @returns {string} — toast ID
   */
  function show(message, options) {
    var opts = options || {};
    var type = opts.type || 'info';
    var duration = typeof opts.duration === 'number' ? opts.duration : defaultDuration;
    var iconName = opts.icon || defaultIcons[type] || 'info';

    var id = 'toast-' + (++toastCounter);
    var cont = getContainer();

    var toast = document.createElement('div');
    toast.id = id;
    toast.className = 'toast toast--' + type;
    toast.setAttribute('role', 'alert');

    // Icon
    var iconHtml = '';
    if (typeof YawmiaIcons !== 'undefined') {
      iconHtml = YawmiaIcons.get(iconName, { size: 20, 'class': 'toast__icon' });
    }

    // Message (escaped)
    var safeMsg = (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(message) : message;

    // Close button icon
    var closeIconHtml = '';
    if (typeof YawmiaIcons !== 'undefined') {
      closeIconHtml = YawmiaIcons.get('close', { size: 16 });
    } else {
      closeIconHtml = '✕';
    }

    toast.innerHTML =
      (iconHtml ? '<span class="toast__icon-wrap">' + iconHtml + '</span>' : '') +
      '<span class="toast__message">' + safeMsg + '</span>' +
      '<button class="toast__close" aria-label="إغلاق">' + closeIconHtml + '</button>';

    // Close button handler
    var closeBtn = toast.querySelector('.toast__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        dismiss(id);
      });
    }

    cont.appendChild(toast);

    // Entrance animation via rAF
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add('toast--visible');
      });
    });

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(function () {
        dismiss(id);
      }, duration);
    }

    return id;
  }

  /**
   * Dismiss a toast by ID.
   * @param {string} id
   */
  function dismiss(id) {
    var toast = document.getElementById(id);
    if (!toast) return;

    toast.classList.remove('toast--visible');
    toast.classList.add('toast--exit');

    // Remove from DOM after exit animation
    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  // ── Convenience Methods ───────────────────────────────────
  function success(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'success' }));
  }

  function error(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'error' }));
  }

  function warning(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'warning' }));
  }

  function info(msg, opts) {
    return show(msg, Object.assign({}, opts || {}, { type: 'info' }));
  }

  return {
    show: show,
    dismiss: dismiss,
    success: success,
    error: error,
    warning: warning,
    info: info,
  };
})();
