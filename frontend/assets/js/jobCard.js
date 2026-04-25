// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/jobCard.js — Job Card Rendering Module (IIFE)
// Phase 38 — Extracted from jobs.js for Single Responsibility
// ═══════════════════════════════════════════════════════════════

var YawmiaJobCard = (function () {
  'use strict';

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

  function getStatusLabel(status) {
    var labels = {
      open: 'متاحة',
      filled: 'مكتملة',
      in_progress: 'جاري التنفيذ',
      completed: 'مكتملة ✓',
      expired: 'منتهية',
      cancelled: 'ملغية'
    };
    return labels[status] || status;
  }

  /**
   * Create a job card DOM element with all action handlers.
   * @param {object} job — job data from API
   * @param {object} user — current user
   * @param {object} callbacks — inter-module communication
   * @param {function} callbacks.onReload — reload job list
   * @param {function} callbacks.onToggleApps — toggle applications panel
   * @param {function} callbacks.onToggleAttendance — toggle attendance panel
   * @param {function} callbacks.onToggleMessaging — toggle messaging panel
   * @param {function} callbacks.onShowRating — show rating modal
   * @param {function} callbacks.onShowReceipt — show receipt modal
   * @returns {HTMLElement}
   */
  function create(job, user, callbacks) {
    var card = document.createElement('div');
    card.className = 'job-card';
    card.setAttribute('data-status', job.status);

    var statusBadge = '<span class="badge badge--status badge--' + job.status + '">' + getStatusLabel(job.status) + '</span>';

    var urgencyBadge = '';
    if (job.urgency === 'immediate') {
      urgencyBadge = '<span class="badge badge--immediate">🔥 فوري</span>';
    } else if (job.urgency === 'urgent') {
      urgencyBadge = '<span class="badge badge--urgent">⚡ عاجل</span>';
    }

    var employerProfileLink = '';
    if (job.employerId) {
      employerProfileLink = '<a href="/user.html?id=' + escapeHtml(job.employerId) + '" class="worker-link">عرض بروفايل صاحب العمل</a>';
    }

    var paymentBadgeHtml = '';
    if (job.status === 'completed') {
      paymentBadgeHtml = '<span class="payment-badge-placeholder" data-job-id="' + job.id + '"></span>';
    }

    var completedLabel = '';
    if (job.status === 'completed') {
      completedLabel = '<span class="badge badge--status badge--completed">✓ مكتملة</span>';
    }

    var distanceBadge = (job._distance !== undefined && job._distance !== null)
      ? '<span class="job-distance">📍 ' + job._distance + ' كم</span>'
      : '';

    if (user.role === 'employer' && job.employerId === user.id && window._enrichedMyJobs && window._enrichedMyJobs[job.id] !== undefined) {
      job.pendingApplicationsCount = window._enrichedMyJobs[job.id];
    }

    var primaryButtons = '';
    var secondaryButtons = '';

    if (user.role === 'worker' && job.status === 'open') {
      primaryButtons += '<button class="btn btn--primary btn--sm btn-apply" data-job-id="' + job.id + '" aria-label="تقدّم لفرصة ' + escapeHtml(job.title) + '">تقدّم</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id) {
      if (job.status === 'open') {
        primaryButtons += '<button class="btn btn--danger btn--sm btn-cancel" data-job-id="' + job.id + '" aria-label="إلغاء فرصة ' + escapeHtml(job.title) + '">إلغاء الفرصة</button>';
      } else if (job.status === 'filled') {
        primaryButtons += '<button class="btn btn--primary btn--sm btn-start" data-job-id="' + job.id + '" aria-label="ابدأ تنفيذ فرصة ' + escapeHtml(job.title) + '">ابدأ التنفيذ</button>';
      } else if (job.status === 'in_progress') {
        primaryButtons += '<button class="btn btn--success btn--sm btn-complete" data-job-id="' + job.id + '" aria-label="إنهاء فرصة ' + escapeHtml(job.title) + '">إنهاء الفرصة</button>';
      } else if (job.status === 'completed') {
        primaryButtons += '<button class="btn btn--warning btn--sm btn-rate" data-job-id="' + job.id + '" aria-label="قيّم العمال في فرصة ' + escapeHtml(job.title) + '">⭐ قيّم العمال</button>';
      } else if (job.status === 'expired' || job.status === 'cancelled') {
        primaryButtons += '<button class="btn btn-renew btn--sm" data-job-id="' + job.id + '" aria-label="تجديد فرصة ' + escapeHtml(job.title) + '">🔄 تجديد الفرصة</button>';
      }
    }
    if (user.role === 'worker' && job.status === 'in_progress') {
      primaryButtons += '<button class="btn btn-checkin btn--sm" data-job-id="' + job.id + '" aria-label="تسجيل حضور في فرصة ' + escapeHtml(job.title) + '">📍 تسجيل حضور</button>';
      primaryButtons += '<button class="btn btn-checkout btn--sm" data-job-id="' + job.id + '" aria-label="تسجيل انصراف من فرصة ' + escapeHtml(job.title) + '">🏁 تسجيل انصراف</button>';
    }
    if (user.role === 'worker' && job.status === 'completed') {
      primaryButtons += '<button class="btn btn--warning btn--sm btn-rate" data-job-id="' + job.id + '" data-target="' + (job.employerId || '') + '" aria-label="قيّم صاحب العمل في فرصة ' + escapeHtml(job.title) + '">⭐ قيّم صاحب العمل</button>';
    }

    var messagingStatuses = ['filled', 'in_progress', 'completed'];
    if (user.role === 'employer' && job.employerId === user.id && (job.status === 'open' || job.status === 'filled')) {
      secondaryButtons += '<button class="btn btn--ghost btn--sm btn-view-apps" data-job-id="' + job.id + '" aria-label="عرض طلبات فرصة ' + escapeHtml(job.title) + '">📋 عرض الطلبات</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id && job.status === 'in_progress') {
      secondaryButtons += '<button class="btn btn--ghost btn--sm btn-attendance" data-job-id="' + job.id + '" aria-label="حضور عمال فرصة ' + escapeHtml(job.title) + '">📊 الحضور</button>';
    }
    if (user.role === 'employer' && job.employerId === user.id && job.status !== 'open') {
      secondaryButtons += '<button class="btn btn--ghost btn--sm btn-duplicate" data-job-id="' + job.id + '" aria-label="نسخ فرصة ' + escapeHtml(job.title) + '">📋 نسخ الفرصة</button>';
    }
    if (messagingStatuses.indexOf(job.status) !== -1) {
      var isInvolved = (user.role === 'employer' && job.employerId === user.id) || user.role === 'worker';
      if (isInvolved) {
        secondaryButtons += '<button class="btn btn--ghost btn--sm btn-messages" data-job-id="' + job.id + '" aria-label="رسائل فرصة ' + escapeHtml(job.title) + '">💬 رسائل</button>';
      }
    }
    secondaryButtons += '<button class="btn btn--ghost btn--sm btn-share-whatsapp" data-job-id="' + job.id + '" data-title="' + escapeHtml(job.title) + '" data-wage="' + job.dailyWage + '" data-gov="' + escapeHtml(job.governorate) + '" aria-label="شارك الفرصة عبر واتساب">📤 شارك</button>';

    if (user.role === 'employer' && job.employerId === user.id && typeof job.pendingApplicationsCount === 'number' && job.pendingApplicationsCount > 0) {
      secondaryButtons += ' <span class="pending-badge">' + job.pendingApplicationsCount + ' طلب معلّق</span>';
    }

    if (user.role === 'employer' && job.employerId === user.id && window._enrichedMyJobs && window._enrichedMyJobs[job.id] !== undefined) {
      job.pendingApplicationsCount = window._enrichedMyJobs[job.id];
    }

    var actionsHtml = '';
    if (primaryButtons || secondaryButtons) {
      actionsHtml = '<div class="job-card__actions">';
      if (primaryButtons) actionsHtml += '<div class="job-card__actions-primary">' + primaryButtons + '</div>';
      if (secondaryButtons) actionsHtml += '<div class="job-card__actions-secondary">' + secondaryButtons + '</div>';
      actionsHtml += '</div>';
    }

    card.innerHTML =
      '<div class="job-card__header">' +
        '<a href="/job.html?id=' + escapeHtml(job.id) + '" class="job-card__title-link">' + escapeHtml(job.title) + '</a>' +
        '<div class="job-card__header-right">' +
          urgencyBadge +
          statusBadge +
          distanceBadge +
          '<span class="job-card__wage">' + job.dailyWage + ' جنيه/يوم</span>' +
        '</div>' +
      '</div>' +
      '<div class="job-card__meta">' +
        '<span>' + YawmiaIcons.get('mapPin', {size:14}) + ' ' + escapeHtml(job.governorate) + '</span>' +
        '<span>' + YawmiaIcons.get('calendar', {size:14}) + ' ' + job.startDate + '</span>' +
        '<span>' + YawmiaIcons.get('clock', {size:14}) + ' ' + job.durationDays + ' يوم</span>' +
      '</div>' +
      (job.description ? '<p class="job-card__desc">' + escapeHtml(job.description) + '</p>' : '') +
      (employerProfileLink ? '<div style="margin-block-end:0.5rem;">' + employerProfileLink + '</div>' : '') +
      paymentBadgeHtml +
      '<div class="job-card__footer">' +
        '<span class="job-card__workers">' + YawmiaIcons.get('workers', {size:14}) + ' ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل</span>' +
        completedLabel +
        actionsHtml +
      '</div>';

    // ── Attach Event Handlers ────────────────────────────────

    // Apply
    var applyBtn = card.querySelector('.btn-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', async function () {
        Yawmia.setLoading(applyBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/apply');
          if (res.data.ok) {
            applyBtn.textContent = 'تم التقديم ✓';
            applyBtn.disabled = true;
            applyBtn.setAttribute('aria-disabled', 'true');
            applyBtn.classList.remove('btn--primary');
            applyBtn.classList.add('btn--done');
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في التقديم');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(applyBtn, false);
        }
      });
    }

    // Start
    var startBtn = card.querySelector('.btn-start');
    if (startBtn) {
      startBtn.addEventListener('click', async function () {
        Yawmia.setLoading(startBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/start');
          if (res.data.ok) { callbacks.onReload(); } else { YawmiaToast.error(res.data.error || 'خطأ في بدء الفرصة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(startBtn, false); }
      });
    }

    // Complete
    var completeBtn = card.querySelector('.btn-complete');
    if (completeBtn) {
      completeBtn.addEventListener('click', async function () {
        Yawmia.setLoading(completeBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/complete');
          if (res.data.ok) { callbacks.onReload(); } else { YawmiaToast.error(res.data.error || 'خطأ في إنهاء الفرصة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(completeBtn, false); }
      });
    }

    // Cancel
    var cancelBtn = card.querySelector('.btn-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'إلغاء الفرصة', message: 'متأكد إنك عايز تلغي هذه الفرصة؟ الطلبات المعلقة هتترفض تلقائياً.', confirmText: 'إلغاء الفرصة', cancelText: 'رجوع', danger: true });
        if (!confirmed) return;
        Yawmia.setLoading(cancelBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/cancel');
          if (res.data.ok) { callbacks.onReload(); } else { YawmiaToast.error(res.data.error || 'خطأ في إلغاء الفرصة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(cancelBtn, false); }
      });
    }

    // Renew
    var renewBtn = card.querySelector('.btn-renew');
    if (renewBtn) {
      renewBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'تجديد الفرصة', message: 'هل تريد تجديد هذه الفرصة؟', confirmText: 'تجديد', cancelText: 'إلغاء' });
        if (!confirmed) return;
        Yawmia.setLoading(renewBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/renew');
          if (res.data.ok) { callbacks.onReload(); } else { YawmiaToast.error(res.data.error || 'خطأ في تجديد الفرصة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(renewBtn, false); }
      });
    }

    // Duplicate
    var duplicateBtn = card.querySelector('.btn-duplicate');
    if (duplicateBtn) {
      duplicateBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'نسخ الفرصة', message: 'هل تريد نسخ هذه الفرصة؟', confirmText: 'نسخ', cancelText: 'إلغاء' });
        if (!confirmed) return;
        Yawmia.setLoading(duplicateBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/duplicate');
          if (res.data.ok) { YawmiaToast.success('تم نسخ الفرصة بنجاح ✓'); callbacks.onReload(); } else { YawmiaToast.error(res.data.error || 'خطأ في نسخ الفرصة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(duplicateBtn, false); }
      });
    }

    // View Applications
    var viewAppsBtn = card.querySelector('.btn-view-apps');
    if (viewAppsBtn) {
      viewAppsBtn.addEventListener('click', function () {
        callbacks.onToggleApps(card, job);
      });
    }

    // Attendance
    var attendanceBtn = card.querySelector('.btn-attendance');
    if (attendanceBtn) {
      attendanceBtn.addEventListener('click', function () {
        callbacks.onToggleAttendance(card, job);
      });
    }

    // Messages
    var messagesBtn = card.querySelector('.btn-messages');
    if (messagesBtn) {
      messagesBtn.addEventListener('click', function () {
        callbacks.onToggleMessaging(card, job);
      });
    }

    // Check-in
    var checkinBtn = card.querySelector('.btn-checkin');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', function () {
        handleCheckIn(job.id, checkinBtn);
      });
    }

    // Check-out
    var checkoutBtn = card.querySelector('.btn-checkout');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', function () {
        handleCheckOut(job.id, checkoutBtn);
      });
    }

    // WhatsApp share
    var shareBtn = card.querySelector('.btn-share-whatsapp');
    if (shareBtn) {
      shareBtn.addEventListener('click', function () {
        var title = shareBtn.getAttribute('data-title');
        var wage = shareBtn.getAttribute('data-wage');
        var gov = shareBtn.getAttribute('data-gov');
        var jobUrl = window.location.origin + '/job.html?id=' + shareBtn.getAttribute('data-job-id');
        var text = 'فرصة عمل على يوميّة: ' + title + ' — ' + wage + ' جنيه/يوم 📍 ' + gov + '\n' + jobUrl;
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
      });
    }

    // Rate
    var rateBtn = card.querySelector('.btn-rate');
    if (rateBtn) {
      rateBtn.addEventListener('click', function () {
        var targetUserId = rateBtn.getAttribute('data-target') || '';
        callbacks.onShowRating(job, targetUserId);
      });
    }

    // Payment info for completed jobs
    var paymentPlaceholder = card.querySelector('.payment-badge-placeholder');
    if (paymentPlaceholder && job.status === 'completed') {
      loadPaymentInfo(paymentPlaceholder, job, user, callbacks);
    }

    return card;
  }

  /**
   * Load payment info into a placeholder element.
   */
  function loadPaymentInfo(paymentPlaceholder, job, user, callbacks) {
    (async function () {
      try {
        var payRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/payment');
        if (payRes.data.ok && payRes.data.payment) {
          var pay = payRes.data.payment;
          var statusLabels = {
            pending: 'في انتظار التأكيد',
            employer_confirmed: 'تم تأكيد الدفع',
            completed: 'مكتمل',
            disputed: 'نزاع'
          };
          var badgeLabel = statusLabels[pay.status] || pay.status;
          var html = '<div class="payment-info" style="margin-block-end: 0.5rem;">' +
            '<span class="payment-badge payment-badge--' + pay.status + '">' + escapeHtml(badgeLabel) + '</span>' +
            '<span style="font-size:0.8rem;color:var(--color-text-muted);margin-inline-start:0.5rem;">' + pay.amount + ' جنيه</span>';

          if (pay.status === 'pending' && user.role === 'employer' && job.employerId === user.id) {
            html += ' <button class="btn btn--primary btn--sm btn-confirm-payment" data-pay-id="' + pay.id + '">أكد الدفع</button>';
          }
          if (pay.status === 'pending' || pay.status === 'employer_confirmed') {
            html += ' <button class="btn btn--ghost btn--sm btn-dispute-payment" data-pay-id="' + pay.id + '">فتح نزاع</button>';
          }
          if (pay.status === 'completed' || pay.status === 'employer_confirmed') {
            html += ' <button class="btn btn--ghost btn--sm btn-receipt" data-job-id="' + job.id + '">📄 إيصال</button>';
          }
          html += '</div>';
          paymentPlaceholder.innerHTML = html;

          // Confirm handler
          var confirmBtn = paymentPlaceholder.querySelector('.btn-confirm-payment');
          if (confirmBtn) {
            confirmBtn.addEventListener('click', async function () {
              Yawmia.setLoading(confirmBtn, true);
              try {
                var cRes = await Yawmia.api('POST', '/api/payments/' + pay.id + '/confirm');
                if (cRes.data.ok) { callbacks.onReload(); } else { YawmiaToast.error(cRes.data.error || 'خطأ في تأكيد الدفع'); }
              } catch (e) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(confirmBtn, false); }
            });
          }

          // Receipt handler
          var receiptBtn = paymentPlaceholder.querySelector('.btn-receipt');
          if (receiptBtn) {
            receiptBtn.addEventListener('click', async function () {
              try {
                var rRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/receipt');
                if (rRes.data.ok && rRes.data.receipt) { callbacks.onShowReceipt(rRes.data.receipt); } else { YawmiaToast.error(rRes.data.error || 'خطأ في جلب الإيصال'); }
              } catch (e) { YawmiaToast.error('خطأ في الاتصال'); }
            });
          }

          // Dispute handler
          var disputeBtn = paymentPlaceholder.querySelector('.btn-dispute-payment');
          if (disputeBtn) {
            disputeBtn.addEventListener('click', async function () {
              var reason = await YawmiaModal.prompt({ title: 'فتح نزاع', message: 'اكتب سبب النزاع', placeholder: 'اكتب السبب هنا...', minLength: 5, required: true });
              if (!reason) return;
              Yawmia.setLoading(disputeBtn, true);
              try {
                var dRes = await Yawmia.api('POST', '/api/payments/' + pay.id + '/dispute', { reason: reason });
                if (dRes.data.ok) { callbacks.onReload(); } else { YawmiaToast.error(dRes.data.error || 'خطأ في فتح النزاع'); }
              } catch (e) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(disputeBtn, false); }
            });
          }
        }
      } catch (e) { /* ignore — payment may not exist */ }
    })();
  }

  // ── GPS Check-in ──────────────────────────────────────────
  function handleCheckIn(jobId, btn) {
    if (!navigator.geolocation) {
      YawmiaToast.error('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    Yawmia.setLoading(btn, true);
    navigator.geolocation.getCurrentPosition(
      async function (pos) {
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + jobId + '/checkin', {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          if (res.data.ok) {
            btn.textContent = 'تم الحضور ✓';
            btn.disabled = true;
            btn.setAttribute('aria-disabled', 'true');
            btn.classList.remove('btn-checkin');
            btn.classList.add('btn--done');
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في تسجيل الحضور');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(btn, false);
        }
      },
      function () {
        Yawmia.setLoading(btn, false);
        YawmiaToast.error('فشل تحديد الموقع — تأكد من تفعيل GPS');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // ── GPS Check-out ─────────────────────────────────────────
  function handleCheckOut(jobId, btn) {
    Yawmia.setLoading(btn, true);
    (async function () {
      try {
        var body = {};
        if (navigator.geolocation) {
          try {
            var pos = await new Promise(function (resolve, reject) {
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
            });
            body.lat = pos.coords.latitude;
            body.lng = pos.coords.longitude;
          } catch (_) { /* GPS optional for check-out */ }
        }
        var res = await Yawmia.api('POST', '/api/jobs/' + jobId + '/checkout', body);
        if (res.data.ok) {
          btn.textContent = 'تم الانصراف ✓';
          btn.disabled = true;
          btn.setAttribute('aria-disabled', 'true');
          btn.classList.remove('btn-checkout');
          btn.classList.add('btn--done');
          if (res.data.attendance && res.data.attendance.hoursWorked != null) {
            YawmiaToast.success('تم تسجيل الانصراف — ساعات العمل: ' + res.data.attendance.hoursWorked + ' ساعة');
          }
        } else {
          YawmiaToast.error(res.data.error || 'خطأ في تسجيل الانصراف');
        }
      } catch (err) {
        YawmiaToast.error('خطأ في الاتصال');
      } finally {
        Yawmia.setLoading(btn, false);
      }
    })();
  }

  return {
    create: create,
    loadPaymentInfo: loadPaymentInfo,
  };
})();
