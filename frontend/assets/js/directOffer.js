// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/directOffer.js — Direct Offer Modal (Phase 42)
// ═══════════════════════════════════════════════════════════════
// Worker-side: receives direct_offer_received SSE event,
// shows full-screen alertdialog with countdown,
// handles accept/decline, displays post-accept reveal modal.
// ═══════════════════════════════════════════════════════════════

var YawmiaDirectOffer = (function () {
  'use strict';

  var activeModal = null;
  var countdownTimer = null;
  var releaseTrap = null;

  function escapeHtml(str) {
    return (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(str) : (str || '');
  }

  // ── Audio + Vibration ───────────────────────────────────────
  function playOfferSound() {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      var ctx = new AudioContext();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(700, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (_) { /* audio unavailable */ }
  }

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
  }

  // ── Modal lifecycle ─────────────────────────────────────────
  function closeModal() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (releaseTrap) { try { releaseTrap(); } catch (_) {} releaseTrap = null; }
    if (activeModal && activeModal.parentNode) activeModal.parentNode.removeChild(activeModal);
    activeModal = null;
    document.body.style.overflow = '';
  }

  // ── Show offer modal (worker receives offer) ────────────────
  async function showOfferModal(detail) {
    if (!detail || !detail.offerId) return;
    if (activeModal) closeModal();

    // Fetch full offer details (redacted)
    var offer;
    try {
      var res = await Yawmia.api('GET', '/api/direct-offers/' + detail.offerId);
      if (!res.data || !res.data.ok || !res.data.offer) return;
      offer = res.data.offer;
    } catch (err) { return; }

    if (offer.status !== 'pending') return;

    var notifiedAt = detail.notifiedAt ? new Date(detail.notifiedAt).getTime() : Date.now();
    var windowSec = detail.acceptanceWindowSeconds || offer.acceptanceWindowSeconds || 120;
    var expiresAt = notifiedAt + windowSec * 1000;

    var titleId = 'do-title-' + Date.now();
    var overlay = document.createElement('div');
    overlay.className = 'ym-modal-overlay direct-offer-overlay';

    var card = document.createElement('div');
    card.className = 'ym-modal-card direct-offer-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', titleId);
    card.setAttribute('aria-live', 'assertive');

    var verifiedBadge = offer.employerVerified ? '<span class="verification-badge verification-badge--verified" style="font-size:0.7rem;">✓ محقق</span>' : '';
    var ratingHtml = (offer.employerRating && offer.employerRating.count > 0)
      ? '⭐ ' + offer.employerRating.avg + ' (' + offer.employerRating.count + ')'
      : 'بدون تقييم';

    var messageHtml = '';
    if (offer.message) {
      messageHtml =
        '<div class="direct-offer-modal__message">' +
          '<strong>رسالة من صاحب العمل:</strong><br>' + escapeHtml(offer.message) +
        '</div>';
    }

    card.innerHTML =
      '<div class="direct-offer-modal__header">' +
        '<span class="direct-offer-modal__badge">📩 عرض عمل مباشر</span>' +
        '<span class="direct-offer-modal__countdown" id="doCountdown" aria-live="polite">' + windowSec + '</span>' +
      '</div>' +
      '<h3 class="ym-modal-title" id="' + titleId + '">' + escapeHtml(offer.employerDisplayName || 'صاحب عمل') + ' ' + verifiedBadge + '</h3>' +
      '<div class="direct-offer-modal__sub">' + escapeHtml(ratingHtml) + '</div>' +
      '<div class="direct-offer-modal__info">' +
        '<div class="direct-offer-modal__info-row">' +
          '<span class="direct-offer-modal__info-label">💰 الأجر</span>' +
          '<span class="direct-offer-modal__info-value">' + offer.proposedDailyWage + ' جنيه/يوم</span>' +
        '</div>' +
        '<div class="direct-offer-modal__info-row">' +
          '<span class="direct-offer-modal__info-label">📅 يبدأ</span>' +
          '<span class="direct-offer-modal__info-value">' + escapeHtml(offer.proposedStartDate) + '</span>' +
        '</div>' +
        '<div class="direct-offer-modal__info-row">' +
          '<span class="direct-offer-modal__info-label">⏱ المدة</span>' +
          '<span class="direct-offer-modal__info-value">' + (offer.proposedDurationDays || 1) + ' يوم</span>' +
        '</div>' +
        '<div class="direct-offer-modal__info-row">' +
          '<span class="direct-offer-modal__info-label">📍 المحافظة</span>' +
          '<span class="direct-offer-modal__info-value">' + escapeHtml(offer.governorate) + '</span>' +
        '</div>' +
      '</div>' +
      messageHtml +
      '<div class="direct-offer-modal__actions">' +
        '<button class="btn btn--success btn--full direct-offer-modal__accept" id="btnAcceptOffer">✓ اقبل العرض</button>' +
        '<button class="btn btn--ghost btn--sm direct-offer-modal__decline" id="btnDeclineOffer">✗ ارفض</button>' +
      '</div>' +
      '<div class="direct-offer-modal__error" id="doError"></div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    activeModal = overlay;

    if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.trapFocus) {
      releaseTrap = YawmiaUtils.trapFocus(card, function () { closeModal(); });
    }

    playOfferSound();
    vibrate();

    // Countdown
    var countdownEl = document.getElementById('doCountdown');
    function updateCountdown() {
      var remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (countdownEl) {
        countdownEl.textContent = remaining;
        if (remaining <= 10) countdownEl.classList.add('countdown-warning');
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
    var acceptBtn = document.getElementById('btnAcceptOffer');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async function () {
        Yawmia.setLoading(acceptBtn, true);
        try {
          var ar = await Yawmia.api('POST', '/api/direct-offers/' + offer.id + '/accept');
          if (ar.data && ar.data.ok) {
            if (typeof YawmiaToast !== 'undefined') {
              YawmiaToast.success('تم قبول العرض ✓');
            }
            closeModal();
            // Show reveal modal with full identity
            showRevealModal(ar.data.offer, ar.data.jobId);
            // Notify rest of UI
            window.dispatchEvent(new CustomEvent('yawmia:direct-offer-accepted', {
              detail: { offerId: offer.id, jobId: ar.data.jobId }
            }));
          } else {
            var code = ar.data && ar.data.code;
            var msg = (ar.data && ar.data.error) || 'تعذّر قبول العرض';
            showError(msg);
            if (code === 'OFFER_NOT_PENDING' || code === 'OFFER_EXPIRED') {
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
    var declineBtn = document.getElementById('btnDeclineOffer');
    if (declineBtn) {
      declineBtn.addEventListener('click', async function () {
        // Optional reason picker
        var reason = null;
        try {
          if (typeof YawmiaModal !== 'undefined') {
            // Simple reason picker dialog
            reason = await pickDeclineReason();
          }
        } catch (_) { /* skip reason */ }

        Yawmia.setLoading(declineBtn, true);
        try {
          var dr = await Yawmia.api('POST', '/api/direct-offers/' + offer.id + '/decline', reason ? { reason: reason } : {});
          if (dr.data && dr.data.ok) {
            if (typeof YawmiaToast !== 'undefined') YawmiaToast.info('تم رفض العرض');
            closeModal();
          } else {
            showError((dr.data && dr.data.error) || 'تعذّر رفض العرض');
            Yawmia.setLoading(declineBtn, false);
          }
        } catch (err) {
          showError('خطأ في الاتصال');
          Yawmia.setLoading(declineBtn, false);
        }
      });
    }
  }

  function showError(msg) {
    var el = document.getElementById('doError');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
    }
  }

  // ── Decline reason picker (simple) ──────────────────────────
  function pickDeclineReason() {
    return new Promise(function (resolve) {
      var existing = document.querySelector('.do-reason-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'ym-modal-overlay do-reason-overlay';
      overlay.style.zIndex = '600';

      var card = document.createElement('div');
      card.className = 'ym-modal-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');

      var reasons = [
        { value: 'busy', label: 'مشغول دلوقتي' },
        { value: 'wage_low', label: 'الأجر قليل' },
        { value: 'distance', label: 'بعيد عني' },
        { value: 'category_mismatch', label: 'مش تخصصي' },
        { value: 'other', label: 'سبب آخر' },
      ];

      var btnsHtml = reasons.map(function (r) {
        return '<button class="btn btn--ghost btn--sm do-reason-btn" data-reason="' + r.value + '" style="margin:0.25rem;">' + r.label + '</button>';
      }).join('');

      card.innerHTML =
        '<h3 class="ym-modal-title">سبب الرفض (اختياري)</h3>' +
        '<div style="display:flex;flex-wrap:wrap;justify-content:center;">' + btnsHtml + '</div>' +
        '<div class="ym-modal-actions" style="margin-block-start:1rem;">' +
          '<button class="btn btn--ghost btn--sm" id="doReasonSkip">تخطي</button>' +
        '</div>';

      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function cleanup(reason) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(reason);
      }

      card.querySelectorAll('.do-reason-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          cleanup(btn.getAttribute('data-reason'));
        });
      });

      var skipBtn = document.getElementById('doReasonSkip');
      if (skipBtn) skipBtn.addEventListener('click', function () { cleanup(null); });

      // Auto-resolve null after 8 seconds (don't block decline)
      setTimeout(function () { cleanup(null); }, 8000);
    });
  }

  // ── Show reveal modal (post-accept full identity) ───────────
  function showRevealModal(offer, jobId) {
    if (!offer || !offer.revealedToWorker) return;

    var existing = document.querySelector('.do-reveal-overlay');
    if (existing) existing.remove();

    var r = offer.revealedToWorker;
    var verifiedBadge = r.employerVerified ? '<span class="verification-badge verification-badge--verified">✓ محقق</span>' : '';
    var ratingHtml = (r.employerRating && r.employerRating.count > 0)
      ? '⭐ ' + r.employerRating.avg + ' (' + r.employerRating.count + ')'
      : '';

    var overlay = document.createElement('div');
    overlay.className = 'ym-modal-overlay do-reveal-overlay';

    var card = document.createElement('div');
    card.className = 'ym-modal-card do-reveal-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    card.innerHTML =
      '<h3 class="ym-modal-title" style="color:var(--color-success);">✓ تم قبول العرض</h3>' +
      '<div class="do-reveal-modal__identity">' +
        '<div class="do-reveal-modal__name">' + escapeHtml(r.employerName) + ' ' + verifiedBadge + '</div>' +
        (ratingHtml ? '<div class="do-reveal-modal__rating">' + escapeHtml(ratingHtml) + '</div>' : '') +
        '<a class="do-reveal-modal__phone" href="tel:' + escapeHtml(r.employerPhone) + '" dir="ltr">📞 ' + escapeHtml(r.employerPhone) + '</a>' +
      '</div>' +
      '<p class="ym-modal-message" style="margin-block-start:1rem;">يمكنك الآن التواصل مع صاحب العمل والاتفاق على التفاصيل.</p>' +
      '<div class="ym-modal-actions">' +
        '<a href="/dashboard.html" class="btn btn--primary btn--sm">ابدأ المحادثة</a>' +
        '<button class="btn btn--ghost btn--sm" id="doRevealClose">إغلاق</button>' +
      '</div>';

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var closeBtn = document.getElementById('doRevealClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () { overlay.remove(); });
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ── Listen for SSE-forwarded window event ───────────────────
  window.addEventListener('yawmia:direct-offer-received', function (e) {
    if (e.detail) showOfferModal(e.detail);
  });

  return {
    showOfferModal: showOfferModal,
    showRevealModal: showRevealModal,
    closeModal: closeModal,
  };
})();
