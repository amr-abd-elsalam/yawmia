// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/instantMatch.js — Instant Match Offer Modal
// Phase 40 — Full-screen modal + countdown + audio + vibration
// ═══════════════════════════════════════════════════════════════

var YawmiaInstantMatch = (function () {
  'use strict';

  var activeModal = null;
  var countdownTimer = null;
  var releaseTrap = null;

  function escapeHtml(str) {
    return (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(str) : (str || '');
  }

  function playOfferSound() {
    try {
      // Short ping using Web Audio API (no external file dependency)
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      var ctx = new AudioContext();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (_) { /* audio unavailable */ }
  }

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (_) {}
  }

  function closeModal() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (releaseTrap) {
      try { releaseTrap(); } catch (_) {}
      releaseTrap = null;
    }
    if (activeModal && activeModal.parentNode) {
      activeModal.parentNode.removeChild(activeModal);
    }
    activeModal = null;
    document.body.style.overflow = '';
  }

  function showOffer(detail) {
    if (!detail || !detail.matchId || !detail.job) return;
    if (activeModal) {
      // Close previous if any
      closeModal();
    }

    var job = detail.job;
    var matchId = detail.matchId;
    var jobId = detail.jobId || job.id;
    var windowSec = detail.acceptanceWindowSeconds || 90;
    var notifiedAt = detail.notifiedAt ? new Date(detail.notifiedAt).getTime() : Date.now();
    var expiresAt = notifiedAt + windowSec * 1000;

    // Build modal
    var overlay = document.createElement('div');
    overlay.className = 'ym-modal-overlay instant-match-overlay';

    var titleId = 'im-title-' + Date.now();
    var card = document.createElement('div');
    card.className = 'ym-modal-card instant-match-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleId);
    card.setAttribute('aria-live', 'assertive');

    card.innerHTML =
      '<div class="instant-match-header">' +
        '<span class="instant-match-badge">⚡ فرصة فورية</span>' +
        '<span class="instant-match-countdown" id="instantMatchCountdown" aria-live="polite">' + windowSec + '</span>' +
      '</div>' +
      '<h3 class="ym-modal-title" id="' + titleId + '">' + escapeHtml(job.title || 'فرصة عمل') + '</h3>' +
      '<div class="instant-match-info">' +
        '<div class="instant-match-info-row">' +
          '<span class="instant-match-info-label">💰 اليومية</span>' +
          '<span class="instant-match-info-value">' + (job.dailyWage || 0) + ' جنيه/يوم</span>' +
        '</div>' +
        '<div class="instant-match-info-row">' +
          '<span class="instant-match-info-label">📍 المحافظة</span>' +
          '<span class="instant-match-info-value">' + escapeHtml(job.governorate || '') + '</span>' +
        '</div>' +
        '<div class="instant-match-info-row">' +
          '<span class="instant-match-info-label">⏱ المدة</span>' +
          '<span class="instant-match-info-value">' + (job.durationDays || 1) + ' يوم</span>' +
        '</div>' +
      '</div>' +
      '<div class="instant-match-actions">' +
        '<button class="btn btn--success btn--full instant-match-accept" id="btnAcceptInstant">⚡ اقبل دلوقتي</button>' +
        '<button class="btn btn--ghost btn--sm instant-match-decline" id="btnDeclineInstant">ارفض</button>' +
      '</div>' +
      '<div class="instant-match-error" id="instantMatchError"></div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    activeModal = overlay;

    // Focus trap
    if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.trapFocus) {
      releaseTrap = YawmiaUtils.trapFocus(card, function () {
        // Escape closes the modal (counts as decline)
        handleDecline();
      });
    }

    // Audio + vibration alert
    playOfferSound();
    vibrate();

    // Countdown
    var countdownEl = document.getElementById('instantMatchCountdown');
    function updateCountdown() {
      var remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (countdownEl) {
        countdownEl.textContent = remaining;
        if (remaining <= 10) {
          countdownEl.classList.add('countdown-warning');
        }
      }
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        showError('انتهت مهلة العرض ⌛');
        setTimeout(closeModal, 1500);
      }
    }
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);

    // Accept handler
    var acceptBtn = document.getElementById('btnAcceptInstant');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async function () {
        Yawmia.setLoading(acceptBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + jobId + '/instant-accept', { matchId: matchId });
          if (res.data && res.data.ok) {
            if (typeof YawmiaToast !== 'undefined') {
              YawmiaToast.success('تم قبول الفرصة ✓ — يلا اشتغل!');
            }
            closeModal();
            // Trigger jobs reload if available
            window.dispatchEvent(new CustomEvent('yawmia:instant-match-accepted', { detail: { jobId: jobId, matchId: matchId } }));
          } else {
            var code = res.data && res.data.code;
            var msg = (res.data && res.data.error) || 'تعذّر قبول العرض';
            showError(msg);
            if (code === 'TOO_LATE' || code === 'EXPIRED') {
              setTimeout(closeModal, 2000);
            } else {
              Yawmia.setLoading(acceptBtn, false);
            }
          }
        } catch (err) {
          showError('خطأ في الاتصال');
          Yawmia.setLoading(acceptBtn, false);
        }
      });
    }

    // Decline handler
    function handleDecline() {
      closeModal();
    }
    var declineBtn = document.getElementById('btnDeclineInstant');
    if (declineBtn) {
      declineBtn.addEventListener('click', handleDecline);
    }

    // Click outside ignored (modal is alertdialog — must use buttons)
  }

  function showError(msg) {
    var el = document.getElementById('instantMatchError');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  function handleTaken(detail) {
    if (!activeModal) return;
    if (!detail || !detail.matchId) return;
    showError('حد آخر سبقك ⚡');
    setTimeout(closeModal, 1500);
  }

  // Listen for window events from livePresence SSE
  window.addEventListener('yawmia:instant-match-offer', function (e) {
    if (e.detail) showOffer(e.detail);
  });

  window.addEventListener('yawmia:instant-match-taken', function (e) {
    handleTaken(e.detail || {});
  });

  return {
    showOffer: showOffer,
    closeModal: closeModal,
  };
})();
