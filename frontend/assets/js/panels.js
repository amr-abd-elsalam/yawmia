// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/panels.js — Inline Panels Module (IIFE)
// Phase 38 — Extracted from jobs.js for Single Responsibility
// ═══════════════════════════════════════════════════════════════

var YawmiaPanels = (function () {
  'use strict';

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

  /**
   * Close all panels in a card except the specified one.
   * @param {HTMLElement} card
   * @param {string} keepClass
   */
  function closeOtherPanels(card, keepClass) {
    ['applications-panel', 'messaging-panel', 'attendance-panel', 'report-form'].forEach(function (cls) {
      if (cls !== keepClass) {
        var existing = card.querySelector('.' + cls);
        if (existing) existing.remove();
      }
    });
  }

  /**
   * Toggle applications review panel for a job card.
   * @param {HTMLElement} card
   * @param {object} job
   * @param {object} callbacks — { onReload: function }
   */
  function toggleApplications(card, job, callbacks) {
    closeOtherPanels(card, 'applications-panel');
    var existing = card.querySelector('.applications-panel');
    if (existing) { existing.remove(); return; }

    var panel = document.createElement('div');
    panel.className = 'applications-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'طلبات التقدم لفرصة ' + escapeHtml(job.title));
    panel.innerHTML =
      '<div class="applications-panel__header">' +
        '<strong>📋 طلبات التقدم</strong>' +
        '<button class="btn btn--ghost btn--sm btn-close-apps" aria-label="إغلاق لوحة الطلبات">✕</button>' +
      '</div>' +
      '<div class="applications-panel__list">' +
        '<p class="empty-state">جاري تحميل الطلبات...</p>' +
      '</div>';

    card.appendChild(panel);

    panel.querySelector('.btn-close-apps').addEventListener('click', function () { panel.remove(); });

    (async function () {
      try {
        var res = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
        var listEl = panel.querySelector('.applications-panel__list');
        if (!res.data.ok || !res.data.applications || res.data.applications.length === 0) {
          listEl.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📭</span><p class="empty-state__text">لا توجد طلبات بعد</p></div>';
          return;
        }
        listEl.innerHTML = '';
        res.data.applications.forEach(function (app) {
          var w = app.worker || {};
          var statusLabels = { pending: 'في الانتظار', accepted: 'مقبول ✓', rejected: 'مرفوض ✗', withdrawn: 'تم السحب' };
          var statusLabel = statusLabels[app.status] || app.status;

          var verBadge = '';
          if (w.verificationStatus === 'verified') {
            verBadge = ' <span class="verification-badge verification-badge--verified">✓ محقق</span>';
          }

          var ratingHtml = '';
          if (w.rating && w.rating.count > 0) {
            ratingHtml = '<span style="color:var(--color-warning);font-size:0.8rem;">⭐ ' + w.rating.avg + ' (' + w.rating.count + ')</span>';
          }

          var catsHtml = '';
          if (w.categories && w.categories.length > 0) {
            catsHtml = '<div class="app-review-card__cats">' + w.categories.map(function (c) { return '<span class="badge badge--worker" style="font-size:0.7rem;padding:0.1rem 0.4rem;">' + escapeHtml(c) + '</span>'; }).join(' ') + '</div>';
          }

          var actionsHtml = '';
          if (app.status === 'pending') {
            actionsHtml =
              '<div class="app-review-card__actions">' +
                '<button class="btn btn--success btn--sm btn-accept-app" data-app-id="' + app.id + '">✓ قبول</button>' +
                '<button class="btn btn--ghost btn--sm btn-reject-app" data-app-id="' + app.id + '" style="color:var(--color-error);border-color:var(--color-error);">✗ رفض</button>' +
              '</div>';
          } else if (app.status === 'accepted') {
            actionsHtml =
              '<div class="app-review-card__actions">' +
                '<span class="badge badge--status badge--' + app.status + '">' + escapeHtml(statusLabel) + '</span>' +
                ' <button class="btn btn--ghost btn--sm btn-add-fav" data-worker-id="' + escapeHtml(app.workerId) + '">⭐ مفضّلة</button>' +
              '</div>';
          } else {
            actionsHtml = '<div class="app-review-card__actions"><span class="badge badge--status badge--' + app.status + '">' + escapeHtml(statusLabel) + '</span></div>';
          }

          var appCard = document.createElement('div');
          appCard.className = 'app-review-card';
          appCard.innerHTML =
            '<div class="app-review-card__info">' +
              '<div class="app-review-card__name">' +
                '<a href="/user.html?id=' + escapeHtml(w.id || app.workerId) + '" class="worker-link">' + escapeHtml(w.name || 'بدون اسم') + '</a>' +
                verBadge +
              '</div>' +
              '<div class="app-review-card__meta">' +
                '<span class="phone-cell">' + escapeHtml(w.phone || '') + '</span>' +
                (w.governorate ? ' • 📍 ' + escapeHtml(w.governorate) : '') +
                (ratingHtml ? ' • ' + ratingHtml : '') +
              '</div>' +
              catsHtml +
            '</div>' +
            actionsHtml;

          // Accept handler
          var acceptBtn = appCard.querySelector('.btn-accept-app');
          if (acceptBtn) {
            acceptBtn.addEventListener('click', async function () {
              Yawmia.setLoading(acceptBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/accept', { applicationId: app.id });
                if (r.data.ok) {
                  YawmiaToast.success('تم قبول العامل ✓');
                  panel.remove();
                  toggleApplications(card, job, callbacks);
                  callbacks.onReload();
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في قبول العامل');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(acceptBtn, false); }
            });
          }

          // Reject handler
          var rejectBtn = appCard.querySelector('.btn-reject-app');
          if (rejectBtn) {
            rejectBtn.addEventListener('click', async function () {
              Yawmia.setLoading(rejectBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/reject', { applicationId: app.id });
                if (r.data.ok) {
                  YawmiaToast.success('تم رفض الطلب');
                  panel.remove();
                  toggleApplications(card, job, callbacks);
                  callbacks.onReload();
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ في رفض الطلب');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(rejectBtn, false); }
            });
          }

          // Favorite handler
          var favBtn = appCard.querySelector('.btn-add-fav');
          if (favBtn) {
            favBtn.addEventListener('click', async function () {
              Yawmia.setLoading(favBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/favorites', { favoriteUserId: app.workerId });
                if (r.data.ok) {
                  favBtn.textContent = '⭐ تمت الإضافة';
                  favBtn.disabled = true;
                  favBtn.classList.add('btn--done');
                } else if (r.data.code === 'ALREADY_FAVORITE') {
                  favBtn.textContent = '⭐ موجود بالفعل';
                  favBtn.disabled = true;
                } else {
                  YawmiaToast.error(r.data.error || 'خطأ');
                }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(favBtn, false); }
            });
          }

          listEl.appendChild(appCard);
        });
      } catch (err) {
        var listEl = panel.querySelector('.applications-panel__list');
        if (listEl) listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الطلبات</p>';
      }
    })();
  }

  /**
   * Toggle attendance panel for a job card.
   * @param {HTMLElement} card
   * @param {object} job
   * @param {object} callbacks — { onReload: function }
   */
  function toggleAttendance(card, job, callbacks) {
    closeOtherPanels(card, 'attendance-panel');
    var existing = card.querySelector('.attendance-panel');
    if (existing) { existing.remove(); return; }

    var panel = document.createElement('div');
    panel.className = 'attendance-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'حضور عمال فرصة ' + escapeHtml(job.title));
    panel.innerHTML =
      '<div class="attendance-panel__header">' +
        '<strong>📊 حضور العمال</strong>' +
        '<button class="btn btn--ghost btn--sm btn-close-att" aria-label="إغلاق لوحة الحضور">✕</button>' +
      '</div>' +
      '<div class="attendance-panel__list">' +
        '<p class="empty-state">جاري تحميل بيانات الحضور...</p>' +
      '</div>';

    card.appendChild(panel);

    panel.querySelector('.btn-close-att').addEventListener('click', function () { panel.remove(); });

    (async function () {
      try {
        var appsRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
        var attRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/attendance');

        var listEl = panel.querySelector('.attendance-panel__list');
        if (!appsRes.data.ok || !appsRes.data.applications) {
          listEl.innerHTML = '<p class="empty-state">لا يوجد عمال مقبولين</p>';
          return;
        }

        var accepted = appsRes.data.applications.filter(function (a) { return a.status === 'accepted'; });
        if (accepted.length === 0) {
          listEl.innerHTML = '<div class="empty-state"><span class="empty-state__icon">👷</span><p class="empty-state__text">لا يوجد عمال مقبولين بعد</p></div>';
          return;
        }

        var attRecords = (attRes.data.ok && attRes.data.records) ? attRes.data.records : [];

        var attMap = {};
        attRecords.forEach(function (r) {
          if (!attMap[r.workerId] || new Date(r.createdAt) > new Date(attMap[r.workerId].createdAt)) {
            attMap[r.workerId] = r;
          }
        });

        var attStatusLabels = {
          checked_in: '✓ حاضر',
          checked_out: '🏁 انصرف',
          confirmed: '✓✓ مؤكد',
          no_show: '✗ غائب',
          pending: '⏳ في الانتظار'
        };
        var attStatusClasses = {
          checked_in: 'attendance-status-checked_in',
          checked_out: 'attendance-status-checked_out',
          confirmed: 'attendance-status-confirmed',
          no_show: 'attendance-status-no_show'
        };

        listEl.innerHTML = '';
        accepted.forEach(function (app) {
          var w = app.worker || {};
          var att = attMap[app.workerId];
          var attStatus = att ? att.status : 'none';
          var attLabel = att ? (attStatusLabels[attStatus] || attStatus) : 'لم يسجل بعد';
          var attClass = att ? (attStatusClasses[attStatus] || '') : '';

          var actionsHtml = '';
          if (!att || attStatus === 'no_show') {
            actionsHtml += '<button class="btn btn-checkin btn--sm btn-manual-checkin" data-worker-id="' + app.workerId + '">📍 تسجيل يدوي</button>';
          }
          if (!att) {
            actionsHtml += '<button class="btn btn-noshow btn--sm btn-noshow-att" data-worker-id="' + app.workerId + '">✗ غياب</button>';
          }
          if (att && (attStatus === 'checked_in' || attStatus === 'checked_out') && !att.employerConfirmed) {
            actionsHtml += '<button class="btn btn--primary btn--sm btn-confirm-att" data-att-id="' + att.id + '">✓ تأكيد</button>';
          }

          var workerCard = document.createElement('div');
          workerCard.className = 'att-worker-card';
          workerCard.innerHTML =
            '<div class="att-worker-card__info">' +
              '<div class="att-worker-card__name">' +
                '<a href="/user.html?id=' + escapeHtml(w.id || app.workerId) + '" class="worker-link">' + escapeHtml(w.name || 'بدون اسم') + '</a>' +
              '</div>' +
              '<div class="att-worker-card__status ' + attClass + '">' + attLabel +
                (att && att.hoursWorked ? ' • ' + att.hoursWorked + ' ساعة' : '') +
              '</div>' +
            '</div>' +
            '<div class="att-worker-card__actions">' + actionsHtml + '</div>';

          var manualBtn = workerCard.querySelector('.btn-manual-checkin');
          if (manualBtn) {
            manualBtn.addEventListener('click', async function () {
              Yawmia.setLoading(manualBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/manual-checkin', { workerId: app.workerId });
                if (r.data.ok) {
                  YawmiaToast.success('تم تسجيل الحضور ✓');
                  panel.remove();
                  toggleAttendance(card, job, callbacks);
                } else { YawmiaToast.error(r.data.error || 'خطأ في تسجيل الحضور'); }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(manualBtn, false); }
            });
          }

          var noshowBtn = workerCard.querySelector('.btn-noshow-att');
          if (noshowBtn) {
            noshowBtn.addEventListener('click', async function () {
              Yawmia.setLoading(noshowBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/jobs/' + job.id + '/no-show', { workerId: app.workerId });
                if (r.data.ok) {
                  YawmiaToast.success('تم تسجيل الغياب');
                  panel.remove();
                  toggleAttendance(card, job, callbacks);
                } else { YawmiaToast.error(r.data.error || 'خطأ في تسجيل الغياب'); }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(noshowBtn, false); }
            });
          }

          var confirmBtn = workerCard.querySelector('.btn-confirm-att');
          if (confirmBtn) {
            confirmBtn.addEventListener('click', async function () {
              Yawmia.setLoading(confirmBtn, true);
              try {
                var r = await Yawmia.api('POST', '/api/attendance/' + att.id + '/confirm');
                if (r.data.ok) {
                  YawmiaToast.success('تم تأكيد الحضور ✓');
                  panel.remove();
                  toggleAttendance(card, job, callbacks);
                } else { YawmiaToast.error(r.data.error || 'خطأ في تأكيد الحضور'); }
              } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
              finally { Yawmia.setLoading(confirmBtn, false); }
            });
          }

          listEl.appendChild(workerCard);
        });
      } catch (err) {
        var listEl = panel.querySelector('.attendance-panel__list');
        if (listEl) listEl.innerHTML = '<p class="empty-state">خطأ في تحميل بيانات الحضور</p>';
      }
    })();
  }

  /**
   * Toggle messaging panel for a job card.
   * @param {HTMLElement} card
   * @param {object} job
   * @param {object} user — current user
   * @param {object} callbacks — { onReload?: function }
   */
  function toggleMessaging(card, job, user, callbacks) {
    closeOtherPanels(card, 'messaging-panel');
    var existing = card.querySelector('.messaging-panel');
    if (existing) { existing.remove(); return; }

    var isJobEmployer = user.role === 'employer' && job.employerId === user.id;

    var recipientPickerHtml = '';
    if (isJobEmployer) {
      recipientPickerHtml =
        '<div class="msg-recipient-picker">' +
          '<select class="form-input form-input--sm" id="msgRecipient-' + job.id + '" aria-label="اختار المستلم">' +
            '<option value="__broadcast__">📢 بث لكل العمال</option>' +
          '</select>' +
        '</div>';
    }

    var panel = document.createElement('div');
    panel.className = 'messaging-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'رسائل فرصة ' + escapeHtml(job.title));
    panel.innerHTML =
      '<div class="messaging-panel__header">' +
        '<strong>💬 رسائل الفرصة</strong>' +
        '<button class="btn btn--ghost btn--sm btn-close-msgs" aria-label="إغلاق لوحة الرسائل">✕</button>' +
      '</div>' +
      recipientPickerHtml +
      '<div class="message-list" id="msgList-' + job.id + '">' +
        '<p class="empty-state">جاري التحميل...</p>' +
      '</div>' +
      '<div class="message-send-form">' +
        '<input type="text" class="message-input" placeholder="اكتب رسالة..." maxlength="500">' +
        '<button class="btn btn--primary btn--sm btn-send-msg">إرسال</button>' +
      '</div>';

    card.appendChild(panel);

    panel.querySelector('.btn-close-msgs').addEventListener('click', function () { panel.remove(); });

    // Populate recipient picker for employer
    if (isJobEmployer) {
      (async function () {
        try {
          var appsRes = await Yawmia.api('GET', '/api/jobs/' + job.id + '/applications');
          var selectEl = panel.querySelector('#msgRecipient-' + job.id);
          if (selectEl && appsRes.data.ok && appsRes.data.applications) {
            var accepted = appsRes.data.applications.filter(function (a) { return a.status === 'accepted'; });
            accepted.forEach(function (a) {
              var w = a.worker || {};
              var label = (w.name || 'بدون اسم') + ' — ' + (w.phone || a.workerId);
              var opt = document.createElement('option');
              opt.value = a.workerId;
              opt.textContent = label;
              selectEl.appendChild(opt);
            });
          }
        } catch (_) { /* non-blocking */ }
      })();
    }

    // Load messages
    loadJobMessages(panel, job, user);

    // Send handler
    var sendBtn = panel.querySelector('.btn-send-msg');
    var input = panel.querySelector('.message-input');

    async function handleSend() {
      var text = input.value.trim();
      if (!text) return;

      if (isJobEmployer) {
        var selectEl = panel.querySelector('#msgRecipient-' + job.id);
        var selectedValue = selectEl ? selectEl.value : '__broadcast__';

        Yawmia.setLoading(sendBtn, true);
        try {
          var res;
          if (selectedValue === '__broadcast__') {
            res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/messages/broadcast', { text: text });
          } else {
            res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/messages', { recipientId: selectedValue, text: text });
          }
          if (res.data.ok) { input.value = ''; loadJobMessages(panel, job, user); } else { YawmiaToast.error(res.data.error || 'خطأ في إرسال الرسالة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(sendBtn, false); }
      } else {
        // Worker sends to employer
        Yawmia.setLoading(sendBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs/' + job.id + '/messages', { recipientId: job.employerId, text: text });
          if (res.data.ok) { input.value = ''; loadJobMessages(panel, job, user); } else { YawmiaToast.error(res.data.error || 'خطأ في إرسال الرسالة'); }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(sendBtn, false); }
      }
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', handleSend);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') handleSend();
      });
    }
  }

  /**
   * Load messages for a job into the panel.
   */
  function loadJobMessages(panel, job, user) {
    var listEl = panel.querySelector('.message-list');
    (async function () {
      try {
        var res = await Yawmia.api('GET', '/api/jobs/' + job.id + '/messages?limit=50&offset=0');
        if (res.data.ok && res.data.items && res.data.items.length > 0) {
          listEl.innerHTML = '';
          var items = res.data.items.slice().reverse();
          items.forEach(function (msg) {
            var isMine = msg.senderId === user.id;
            var bubble = document.createElement('div');
            bubble.className = 'message-bubble' + (isMine ? ' message-bubble--mine' : ' message-bubble--other');
            var roleLabel = msg.senderRole === 'employer' ? 'صاحب العمل' : 'عامل';
            var broadcastLabel = msg.recipientId === null ? ' 📢' : '';
            bubble.innerHTML =
              '<div class="message-bubble__sender">' + escapeHtml(roleLabel) + broadcastLabel + '</div>' +
              '<div class="message-bubble__text">' + escapeHtml(msg.text) + '</div>' +
              '<div class="message-bubble__time">' + new Date(msg.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) + '</div>';
            listEl.appendChild(bubble);
          });
          listEl.scrollTop = listEl.scrollHeight;
          Yawmia.api('POST', '/api/jobs/' + job.id + '/messages/read-all').catch(function () {});
        } else {
          listEl.innerHTML = '<p class="empty-state">لا توجد رسائل بعد</p>';
        }
      } catch (err) {
        listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الرسائل</p>';
      }
    })();
  }

  return {
    closeOtherPanels: closeOtherPanels,
    toggleApplications: toggleApplications,
    toggleAttendance: toggleAttendance,
    toggleMessaging: toggleMessaging,
  };
})();
