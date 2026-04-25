// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/ratingModal.js — Rating & Receipt Modals (IIFE)
// Phase 38 — Extracted from jobs.js for Single Responsibility
// ═══════════════════════════════════════════════════════════════

var YawmiaRatingModal = (function () {
  'use strict';

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

  /**
   * Show rating submission modal.
   * @param {object} job — { id, title, employerId }
   * @param {string} prefilledTargetId — target user ID (worker view)
   * @param {object} user — current user
   * @param {function} onSuccess — called after successful submission
   */
  function showRating(job, prefilledTargetId, user, onSuccess) {
    var existingModal = document.querySelector('.rating-modal');
    if (existingModal) existingModal.remove();

    var selectedStars = 0;
    var isEmployer = user.role === 'employer' && job.employerId === user.id;

    var modal = document.createElement('div');
    modal.className = 'rating-modal';

    var targetField = '';
    if (isEmployer) {
      targetField =
        '<div class="form-group">' +
          '<label class="form-label">اختار العامل</label>' +
          '<select class="form-input form-input--sm" id="ratingTargetSelect">' +
            '<option value="">جاري تحميل العمال...</option>' +
          '</select>' +
        '</div>';
    }

    modal.innerHTML =
      '<div class="rating-modal__card">' +
        '<h3 class="rating-modal__title">⭐ قيّم تجربتك في: ' + escapeHtml(job.title) + '</h3>' +
        '<div class="rating-stars-input" id="ratingStarsInput" role="radiogroup" aria-label="اختار عدد النجوم">' +
          '<button class="star-btn" data-star="1" role="radio" aria-checked="false" aria-label="نجمة واحدة من 5" tabindex="0">★</button>' +
          '<button class="star-btn" data-star="2" role="radio" aria-checked="false" aria-label="نجمتين من 5" tabindex="-1">★</button>' +
          '<button class="star-btn" data-star="3" role="radio" aria-checked="false" aria-label="3 نجوم من 5" tabindex="-1">★</button>' +
          '<button class="star-btn" data-star="4" role="radio" aria-checked="false" aria-label="4 نجوم من 5" tabindex="-1">★</button>' +
          '<button class="star-btn" data-star="5" role="radio" aria-checked="false" aria-label="5 نجوم من 5" tabindex="-1">★</button>' +
        '</div>' +
        targetField +
        '<textarea class="rating-comment-input" id="ratingComment" placeholder="تعليق (اختياري)..." maxlength="500"></textarea>' +
        '<div class="rating-modal__error" id="ratingError"></div>' +
        '<div class="rating-modal__actions">' +
          '<button class="btn btn--primary btn--sm" id="btnSubmitRating">إرسال التقييم</button>' +
          '<button class="btn btn--ghost btn--sm" id="btnCancelRating">إلغاء</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    // Load accepted workers for employer
    if (isEmployer) {
      (async function () {
        try {
          var appsRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
          var selectEl = modal.querySelector('#ratingTargetSelect');
          if (selectEl && appsRes.data.ok && appsRes.data.applications) {
            var accepted = appsRes.data.applications.filter(function (a) { return a.status === 'accepted'; });
            if (accepted.length === 0) {
              selectEl.innerHTML = '<option value="">لا يوجد عمال مقبولين</option>';
            } else {
              selectEl.innerHTML = '<option value="">اختار العامل...</option>';
              accepted.forEach(function (a) {
                var w = a.worker || {};
                var label = (w.name || 'بدون اسم') + ' — ' + (w.phone || a.workerId);
                var opt = document.createElement('option');
                opt.value = a.workerId;
                opt.textContent = label;
                selectEl.appendChild(opt);
              });
            }
          }
        } catch (_) {
          var selectEl = modal.querySelector('#ratingTargetSelect');
          if (selectEl) selectEl.innerHTML = '<option value="">خطأ في تحميل العمال</option>';
        }
      })();
    }

    // Focus trap
    var releaseTrap = YawmiaUtils.trapFocus(modal.querySelector('.rating-modal__card'), function () {
      modal.remove();
    });

    // Star selection
    var starBtns = modal.querySelectorAll('.star-btn');
    function selectStar(starNum) {
      selectedStars = starNum;
      starBtns.forEach(function (b) {
        var s = parseInt(b.getAttribute('data-star'));
        if (s <= selectedStars) { b.classList.add('active'); b.setAttribute('aria-checked', 'true'); }
        else { b.classList.remove('active'); b.setAttribute('aria-checked', 'false'); }
        b.setAttribute('tabindex', s === selectedStars ? '0' : '-1');
      });
    }
    starBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        selectStar(parseInt(btn.getAttribute('data-star')));
      });
    });

    // Arrow key navigation (RTL-aware)
    var starsContainer = modal.querySelector('#ratingStarsInput');
    if (starsContainer) {
      starsContainer.addEventListener('keydown', function (e) {
        var current = selectedStars || 1;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          var next = Math.min(current + 1, 5);
          selectStar(next);
          starBtns[next - 1].focus();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          var prev = Math.max(current - 1, 1);
          selectStar(prev);
          starBtns[prev - 1].focus();
        }
      });
    }

    // Cancel
    modal.querySelector('#btnCancelRating').addEventListener('click', function () { releaseTrap(); modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) { releaseTrap(); modal.remove(); } });

    // Submit
    modal.querySelector('#btnSubmitRating').addEventListener('click', async function () {
      var errorEl = modal.querySelector('#ratingError');
      errorEl.textContent = '';

      if (selectedStars < 1) { errorEl.textContent = 'اختار عدد النجوم'; return; }

      var toUserId = prefilledTargetId;
      if (isEmployer) {
        toUserId = (modal.querySelector('#ratingTargetSelect') || {}).value || '';
        if (!toUserId) { errorEl.textContent = 'اختار العامل'; return; }
      }

      var comment = (modal.querySelector('#ratingComment') || {}).value || '';
      var submitBtn = modal.querySelector('#btnSubmitRating');
      Yawmia.setLoading(submitBtn, true);

      try {
        var body = { toUserId: toUserId, stars: selectedStars };
        if (comment.trim()) body.comment = comment.trim();
        var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/rate', body);
        if (res.data.ok) {
          releaseTrap();
          modal.remove();
          YawmiaToast.success('تم إرسال التقييم بنجاح ⭐');
          if (typeof onSuccess === 'function') onSuccess();
        } else {
          errorEl.textContent = res.data.error || 'خطأ في إرسال التقييم';
        }
      } catch (err) {
        errorEl.textContent = 'خطأ في الاتصال بالسيرفر';
      } finally {
        Yawmia.setLoading(submitBtn, false);
      }
    });
  }

  /**
   * Show receipt modal.
   * @param {object} receipt — receipt data from API
   */
  function showReceipt(receipt) {
    var existing = document.querySelector('.ym-modal-overlay.receipt-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.className = 'ym-modal-overlay receipt-overlay';

    var workersHtml = '';
    if (receipt.workers && receipt.workers.length > 0) {
      workersHtml = '<table style="width:100%;border-collapse:collapse;font-size:0.85rem;margin:0.75rem 0;"><thead><tr style="border-bottom:1px solid var(--color-border);"><th style="text-align:start;padding:0.4rem;">العامل</th><th style="text-align:start;padding:0.4rem;">اليومية</th><th style="text-align:start;padding:0.4rem;">الأيام</th><th style="text-align:start;padding:0.4rem;">الإجمالي</th></tr></thead><tbody>';
      receipt.workers.forEach(function (w) {
        workersHtml += '<tr style="border-bottom:1px solid var(--color-border);"><td style="padding:0.4rem;">' + escapeHtml(w.name) + '</td><td style="padding:0.4rem;">' + w.dailyWage + '</td><td style="padding:0.4rem;">' + w.daysWorked + '</td><td style="padding:0.4rem;">' + w.total + ' جنيه</td></tr>';
      });
      workersHtml += '</tbody></table>';
    }

    var attHtml = '';
    if (receipt.attendance) {
      attHtml = '<div style="font-size:0.8rem;color:var(--color-text-muted);margin:0.5rem 0;">الحضور: ' + receipt.attendance.attendedDays + ' يوم حضور | ' + receipt.attendance.noShows + ' غياب | نسبة ' + receipt.attendance.attendanceRate + '%</div>';
    }

    overlay.innerHTML =
      '<div class="ym-modal-card" style="max-width:520px;" id="receiptCard">' +
        '<div style="text-align:center;margin-bottom:1rem;">' +
          '<h3 style="font-size:1.2rem;color:var(--color-primary);">إيصال — يوميّة</h3>' +
          '<p style="font-size:0.8rem;color:var(--color-text-muted);">رقم: ' + escapeHtml(receipt.receiptNumber) + '</p>' +
          '<p style="font-size:0.8rem;color:var(--color-text-muted);">' + new Date(receipt.date).toLocaleDateString('ar-EG') + '</p>' +
        '</div>' +
        '<div style="border-top:1px solid var(--color-border);padding-top:0.75rem;">' +
          '<div style="font-size:0.9rem;"><strong>صاحب العمل:</strong> ' + escapeHtml(receipt.employer.name) + '</div>' +
          '<div style="font-size:0.9rem;"><strong>الفرصة:</strong> ' + escapeHtml(receipt.job.title) + ' — ' + escapeHtml(receipt.job.governorate) + '</div>' +
          '<div style="font-size:0.85rem;color:var(--color-text-muted);">' + receipt.job.durationDays + ' يوم | بدء ' + receipt.job.startDate + '</div>' +
        '</div>' +
        workersHtml +
        '<div style="border-top:1px solid var(--color-border);padding-top:0.75rem;">' +
          '<div style="display:flex;justify-content:space-between;font-size:0.9rem;padding:0.3rem 0;"><span>إجمالي</span><span>' + receipt.subtotal + ' جنيه</span></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--color-warning);padding:0.3rem 0;"><span>عمولة المنصة (' + receipt.feePercent + '%)</span><span>' + receipt.platformFee + ' جنيه</span></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:0.85rem;padding:0.3rem 0;"><span>صافي العمال</span><span>' + receipt.workerPayout + ' جنيه</span></div>' +
          '<div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--color-text-muted);padding:0.3rem 0;"><span>طريقة الدفع</span><span>' + escapeHtml(receipt.paymentMethod) + '</span></div>' +
        '</div>' +
        attHtml +
        '<div class="ym-modal-actions" style="margin-top:1rem;">' +
          '<button class="btn btn--primary btn--sm" id="btnPrintReceipt">🖨 طباعة</button>' +
          '<button class="btn btn--ghost btn--sm" id="btnCloseReceipt">إغلاق</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);

    overlay.querySelector('#btnCloseReceipt').addEventListener('click', function () { overlay.remove(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#btnPrintReceipt').addEventListener('click', function () { window.print(); });
  }

  return {
    showRating: showRating,
    showReceipt: showReceipt,
  };
})();
