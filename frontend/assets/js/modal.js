// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/modal.js — Custom Modal System (IIFE)
// Phase 26 — Promise-based confirm() + prompt() replacements
// Dark theme, RTL-aware, accessible, focus-trapped
// ═══════════════════════════════════════════════════════════════

var YawmiaModal = (function () {
  'use strict';

  var escapeHtml = (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml : function (s) { return s || ''; };

  /**
   * Show a confirmation modal (replaces native confirm()).
   *
   * @param {object} options
   * @param {string} options.title — modal title (Arabic)
   * @param {string} options.message — description text (Arabic)
   * @param {string} [options.confirmText='تأكيد'] — confirm button label
   * @param {string} [options.cancelText='إلغاء'] — cancel button label
   * @param {boolean} [options.danger=false] — if true, confirm button is red
   * @returns {Promise<boolean>} — true if confirmed, false if cancelled
   */
  function confirm(options) {
    var opts = options || {};
    var title = opts.title || 'تأكيد';
    var message = opts.message || '';
    var confirmText = opts.confirmText || 'تأكيد';
    var cancelText = opts.cancelText || 'إلغاء';
    var danger = !!opts.danger;

    return new Promise(function (resolve) {
      var previousFocus = document.activeElement;

      // Build modal DOM
      var overlay = document.createElement('div');
      overlay.className = 'ym-modal-overlay';

      var titleId = 'ym-modal-title-' + Date.now();
      var messageId = 'ym-modal-msg-' + Date.now();

      var card = document.createElement('div');
      card.className = 'ym-modal-card';
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', titleId);
      if (message) card.setAttribute('aria-describedby', messageId);

      var btnClass = danger ? 'btn btn--sm ym-modal-btn--danger' : 'btn btn--sm btn--primary';

      card.innerHTML =
        '<h3 class="ym-modal-title" id="' + titleId + '">' + escapeHtml(title) + '</h3>' +
        (message ? '<p class="ym-modal-message" id="' + messageId + '">' + escapeHtml(message) + '</p>' : '') +
        '<div class="ym-modal-actions">' +
          '<button class="' + btnClass + '" data-ym-role="confirm">' + escapeHtml(confirmText) + '</button>' +
          '<button class="btn btn--sm btn--ghost" data-ym-role="cancel">' + escapeHtml(cancelText) + '</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Focus trap
      var releaseTrap = null;
      if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.trapFocus) {
        releaseTrap = YawmiaUtils.trapFocus(card, function () {
          cleanup(false);
        });
      }

      function cleanup(result) {
        if (releaseTrap) releaseTrap();
        document.body.style.overflow = '';
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Restore focus
        if (previousFocus && typeof previousFocus.focus === 'function') {
          try { previousFocus.focus(); } catch (_) {}
        }
        resolve(result);
      }

      // Button handlers
      var confirmBtn = card.querySelector('[data-ym-role="confirm"]');
      var cancelBtn = card.querySelector('[data-ym-role="cancel"]');

      if (confirmBtn) {
        confirmBtn.addEventListener('click', function () { cleanup(true); });
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { cleanup(false); });
      }

      // Click outside card → cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          cleanup(false);
        }
      });
    });
  }

  /**
   * Show a prompt modal (replaces native prompt()).
   *
   * @param {object} options
   * @param {string} options.title — modal title (Arabic)
   * @param {string} [options.message] — description text (Arabic)
   * @param {string} [options.placeholder=''] — input placeholder
   * @param {string} [options.inputType='text'] — input type
   * @param {number} [options.minLength] — minimum input length for validation
   * @param {boolean} [options.required=false] — if true, empty input shows error
   * @param {string} [options.confirmText='إرسال'] — submit button label
   * @param {string} [options.cancelText='إلغاء'] — cancel button label
   * @returns {Promise<string|null>} — submitted string or null if cancelled
   */
  function prompt(options) {
    var opts = options || {};
    var title = opts.title || 'إدخال';
    var message = opts.message || '';
    var placeholder = opts.placeholder || '';
    var inputType = opts.inputType || 'text';
    var minLength = typeof opts.minLength === 'number' ? opts.minLength : 0;
    var required = !!opts.required;
    var confirmText = opts.confirmText || 'إرسال';
    var cancelText = opts.cancelText || 'إلغاء';

    return new Promise(function (resolve) {
      var previousFocus = document.activeElement;

      // Build modal DOM
      var overlay = document.createElement('div');
      overlay.className = 'ym-modal-overlay';

      var titleId = 'ym-modal-title-' + Date.now();
      var messageId = 'ym-modal-msg-' + Date.now();
      var errorId = 'ym-modal-error-' + Date.now();

      var card = document.createElement('div');
      card.className = 'ym-modal-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', titleId);
      if (message) card.setAttribute('aria-describedby', messageId);

      var inputTag = inputType === 'textarea'
        ? '<textarea class="ym-modal-input" placeholder="' + escapeHtml(placeholder) + '" aria-describedby="' + errorId + '"></textarea>'
        : '<input type="' + escapeHtml(inputType) + '" class="ym-modal-input" placeholder="' + escapeHtml(placeholder) + '" aria-describedby="' + errorId + '">';

      card.innerHTML =
        '<h3 class="ym-modal-title" id="' + titleId + '">' + escapeHtml(title) + '</h3>' +
        (message ? '<p class="ym-modal-message" id="' + messageId + '">' + escapeHtml(message) + '</p>' : '') +
        inputTag +
        '<div class="ym-modal-error" id="' + errorId + '" aria-live="polite"></div>' +
        '<div class="ym-modal-actions">' +
          '<button class="btn btn--sm btn--primary" data-ym-role="submit">' + escapeHtml(confirmText) + '</button>' +
          '<button class="btn btn--sm btn--ghost" data-ym-role="cancel">' + escapeHtml(cancelText) + '</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Auto-focus input
      var inputEl = card.querySelector('.ym-modal-input');
      var errorEl = card.querySelector('.ym-modal-error');

      // Focus trap
      var releaseTrap = null;
      if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.trapFocus) {
        releaseTrap = YawmiaUtils.trapFocus(card, function () {
          cleanup(null);
        });
      }

      // Override auto-focus from trapFocus to focus input instead
      if (inputEl) {
        setTimeout(function () { inputEl.focus(); }, 0);
      }

      function cleanup(result) {
        if (releaseTrap) releaseTrap();
        document.body.style.overflow = '';
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        // Restore focus
        if (previousFocus && typeof previousFocus.focus === 'function') {
          try { previousFocus.focus(); } catch (_) {}
        }
        resolve(result);
      }

      function trySubmit() {
        var value = inputEl ? inputEl.value.trim() : '';

        // Validation
        if (required && !value) {
          if (errorEl) errorEl.textContent = 'هذا الحقل مطلوب';
          if (inputEl) inputEl.focus();
          return;
        }
        if (minLength > 0 && value.length > 0 && value.length < minLength) {
          if (errorEl) errorEl.textContent = 'لازم يكون ' + minLength + ' حروف على الأقل';
          if (inputEl) inputEl.focus();
          return;
        }

        cleanup(value || null);
      }

      // Button handlers
      var submitBtn = card.querySelector('[data-ym-role="submit"]');
      var cancelBtn = card.querySelector('[data-ym-role="cancel"]');

      if (submitBtn) {
        submitBtn.addEventListener('click', trySubmit);
      }
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () { cleanup(null); });
      }

      // Enter key in input → submit
      if (inputEl && inputType !== 'textarea') {
        inputEl.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.keyCode === 13) {
            e.preventDefault();
            trySubmit();
          }
        });
      }

      // Clear error on input
      if (inputEl && errorEl) {
        inputEl.addEventListener('input', function () {
          errorEl.textContent = '';
        });
      }

      // Click outside card → cancel
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) {
          cleanup(null);
        }
      });
    });
  }

  return {
    confirm: confirm,
    prompt: prompt,
  };
})();
