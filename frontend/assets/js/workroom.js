// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/workroom.js — Workroom Messaging UX (Phase 51)
// ═══════════════════════════════════════════════════════════════
// IIFE module.
// Provides:
//   - active workrooms list
//   - workroom detail tabs: Details / Messages / Timeline
//   - quick positive templates
//   - message sending via /api/workrooms/:id/messages
//   - read-all support
//
// Does not replace existing inline job-card messaging panels.
// ═══════════════════════════════════════════════════════════════

var YawmiaWorkroom = (function () {
  'use strict';

  var listMountEl = null;
  var detailMountEl = null;
  var currentWorkroom = null;
  var currentJobId = null;
  var activeTab = 'details';
  var refreshTimer = null;

  function escapeHtml(str) {
    return (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(str) : (str || '');
  }

  function formatDateTime(iso) {
    if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.formatDateTime) {
      return YawmiaUtils.formatDateTime(iso);
    }
    try { return new Date(iso).toLocaleString('ar-EG'); } catch (_) { return iso || ''; }
  }

  function timeAgo(iso) {
    if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.timeAgo) {
      return YawmiaUtils.timeAgo(iso);
    }
    return formatDateTime(iso);
  }

  function statusLabel(status) {
    if (typeof YawmiaUtils !== 'undefined' && YawmiaUtils.statusLabel) {
      return YawmiaUtils.statusLabel(status);
    }
    return status || '';
  }

  function getUser() {
    return (typeof Yawmia !== 'undefined') ? Yawmia.getUser() : null;
  }

  // ═══════════════════════════════════════════════════════════════
  // Workroom List
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize active workrooms list.
   *
   * @param {string} mountId
   */
  function initList(mountId) {
    listMountEl = document.getElementById(mountId);
    if (!listMountEl) return;

    loadWorkrooms();

    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function () {
      if (document.visibilityState === 'visible') loadWorkrooms({ silent: true });
    }, 30000);

    if (refreshTimer.unref) refreshTimer.unref();
  }

  async function loadWorkrooms(options) {
    if (!listMountEl) return;
    var opts = options || {};

    if (!opts.silent) {
      listMountEl.innerHTML = renderListSkeleton();
    }

    try {
      var res = await Yawmia.api('GET', '/api/workrooms?activeOnly=true&limit=20');
      if (!res.data || !res.data.ok) {
        listMountEl.innerHTML = '';
        return;
      }

      var workrooms = res.data.workrooms || [];
      if (workrooms.length === 0) {
        listMountEl.innerHTML = '';
        return;
      }

      renderWorkroomList(workrooms);
    } catch (_) {
      if (!opts.silent) {
        listMountEl.innerHTML = '';
      }
    }
  }

  function renderListSkeleton() {
    return '<section class="card workroom-list-section">' +
      '<h2 class="card__title">💬 مساحات العمل</h2>' +
      '<div class="skeleton-card" style="margin-block-start:0.75rem;"></div>' +
      '</section>';
  }

  function renderWorkroomList(workrooms) {
    var user = getUser();
    var title = user && user.role === 'employer'
      ? '💬 مساحات العمل النشطة'
      : '💬 شغلي الحالي';

    var html = '<section class="card workroom-list-section">' +
      '<div class="section-header">' +
        '<h2 class="card__title">' + title + '</h2>' +
        '<button class="btn btn--ghost btn--sm" id="btnRefreshWorkrooms">تحديث</button>' +
      '</div>' +
      '<div class="workroom-list">';

    workrooms.forEach(function (w) {
      html += renderWorkroomListCard(w);
    });

    html += '</div></section>';

    listMountEl.innerHTML = html;

    var refreshBtn = document.getElementById('btnRefreshWorkrooms');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        loadWorkrooms();
      });
    }

    listMountEl.querySelectorAll('.workroom-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target && e.target.closest('button')) return;
        var jobId = card.getAttribute('data-job-id');
        if (jobId) {
          window.location.href = '/job.html?id=' + encodeURIComponent(jobId) + '#workroom';
        }
      });
    });
  }

  function renderWorkroomListCard(w) {
    var unread = w.unreadMessages || 0;
    var unreadHtml = unread > 0
      ? '<span class="notification-bell__badge" style="position:static;display:inline-flex;">' + unread + '</span>'
      : '';

    var lastMsg = w.lastMessageAt
      ? '<span>آخر رسالة: ' + escapeHtml(timeAgo(w.lastMessageAt)) + '</span>'
      : '<span>لا توجد رسائل بعد</span>';

    return '<article class="workroom-card" data-job-id="' + escapeHtml(w.jobId) + '" tabindex="0" role="button" aria-label="فتح مساحة عمل ' + escapeHtml(w.title) + '">' +
      '<div class="workroom-card__main">' +
        '<div class="workroom-card__title">' + escapeHtml(w.title || 'فرصة') + ' ' + unreadHtml + '</div>' +
        '<div class="workroom-card__meta">' +
          '<span>' + escapeHtml(statusLabel(w.status)) + '</span>' +
          '<span> • </span>' +
          lastMsg +
        '</div>' +
      '</div>' +
      '<div class="workroom-card__actions">' +
        '<a class="btn btn--primary btn--sm" href="/job.html?id=' + encodeURIComponent(w.jobId) + '#workroom">فتح</a>' +
      '</div>' +
    '</article>';
  }

  // ═══════════════════════════════════════════════════════════════
  // Workroom Detail
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize workroom detail for a job.
   *
   * @param {string} jobId
   * @param {string} mountId
   */
  function initJobDetail(jobId, mountId) {
    currentJobId = jobId;
    detailMountEl = document.getElementById(mountId);
    if (!detailMountEl || !jobId) return;

    loadWorkroomDetail();

    // If URL has #workroom, scroll after load.
    if (window.location.hash === '#workroom') {
      setTimeout(function () {
        if (detailMountEl) detailMountEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 500);
    }
  }

  async function loadWorkroomDetail() {
    if (!detailMountEl || !currentJobId) return;

    detailMountEl.innerHTML = '';

    if (!Yawmia.isLoggedIn()) return;

    try {
      var res = await Yawmia.api('GET', '/api/workrooms/' + currentJobId);
      if (!res.data || !res.data.ok || !res.data.workroom) {
        detailMountEl.innerHTML = '';
        return;
      }

      currentWorkroom = res.data.workroom;
      var currentUser = getUser();
      var defaultTab = currentUser && currentUser.role === 'worker' ? 'messages' : 'details';

      activeTab = window.location.hash === '#workroom-messages' ? 'messages' :
                  window.location.hash === '#workroom-timeline' ? 'timeline' :
                  window.location.hash === '#workroom-search' ? 'search' :
                  window.location.hash === '#workroom-pinned' ? 'pinned' :
                  window.location.hash === '#workroom-checklist' ? 'checklist' :
                  defaultTab;

      renderWorkroomDetail();
      if (activeTab === 'messages') loadMessages();
      if (activeTab === 'timeline') loadTimeline();
      if (activeTab === 'search') renderSearchTab();
      if (activeTab === 'pinned') loadPinnedMessages();
      if (activeTab === 'checklist') loadChecklist();
    } catch (_) {
      detailMountEl.innerHTML = '';
    }
  }

  function renderWorkroomDetail() {
    if (!detailMountEl || !currentWorkroom) return;

    var html = '<section class="card workroom-detail-card" id="workroom">' +
      '<div class="workroom-header">' +
        '<div>' +
          '<h2 class="card__title">💬 مساحة العمل</h2>' +
          '<p class="card__desc">' + escapeHtml(currentWorkroom.title || '') + ' — ' + escapeHtml(statusLabel(currentWorkroom.status)) + '</p>' +
        '</div>' +
        '<span class="risk-score-pill">' + escapeHtml(currentWorkroom.userRoleInWorkroom === 'employer' ? 'صاحب العمل' : 'عامل') + '</span>' +
      '</div>' +

      '<div class="workroom-tabs" role="tablist" aria-label="تبويبات مساحة العمل">' +
        '<button class="workroom-tab' + (activeTab === 'details' ? ' workroom-tab--active' : '') + '" data-tab="details" role="tab">التفاصيل</button>' +
        '<button class="workroom-tab' + (activeTab === 'messages' ? ' workroom-tab--active' : '') + '" data-tab="messages" role="tab">الرسائل</button>' +
        '<button class="workroom-tab' + (activeTab === 'timeline' ? ' workroom-tab--active' : '') + '" data-tab="timeline" role="tab">السجل</button>' +
        '<button class="workroom-tab' + (activeTab === 'search' ? ' workroom-tab--active' : '') + '" data-tab="search" role="tab">بحث</button>' +
        '<button class="workroom-tab' + (activeTab === 'pinned' ? ' workroom-tab--active' : '') + '" data-tab="pinned" role="tab">مثبت</button>' +
        '<button class="workroom-tab' + (activeTab === 'checklist' ? ' workroom-tab--active' : '') + '" data-tab="checklist" role="tab">مهام</button>' +
      '</div>' +

      '<div class="workroom-tab-panel" id="workroomTabPanel"></div>' +
    '</section>';

    detailMountEl.innerHTML = html;

    detailMountEl.querySelectorAll('.workroom-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        activeTab = btn.getAttribute('data-tab') || 'details';
        detailMountEl.querySelectorAll('.workroom-tab').forEach(function (b) {
          b.classList.remove('workroom-tab--active');
        });
        btn.classList.add('workroom-tab--active');

        if (activeTab === 'details') renderDetailsTab();
        if (activeTab === 'messages') loadMessages();
        if (activeTab === 'timeline') loadTimeline();
        if (activeTab === 'search') renderSearchTab();
        if (activeTab === 'pinned') loadPinnedMessages();
        if (activeTab === 'checklist') loadChecklist();
      });
    });

    if (activeTab === 'details') renderDetailsTab();
  }

  function renderDetailsTab() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    var job = currentWorkroom.job || {};
    var templates = currentWorkroom.quickTemplates || [];

    var templateHtml = '';
    if (templates.length > 0) {
      templateHtml = '<div class="workroom-template-row" style="margin-block-start:1rem;">' +
        '<strong style="font-size:0.9rem;color:var(--color-text-muted);">رسائل سريعة:</strong>' +
        '<div class="workroom-template-buttons">';
      templates.forEach(function (t, idx) {
        templateHtml += '<button class="btn btn--ghost btn--sm workroom-template-btn" data-text="' + escapeHtml(t) + '" data-template-key="' + escapeHtml(currentWorkroom.userRoleInWorkroom + '_' + idx) + '">' + escapeHtml(t) + '</button>';
      });
      templateHtml += '</div></div>';
    }

    panel.innerHTML =
      '<div id="workroomSummaryGrid" class="workroom-summary-grid">' +
        '<p class="empty-state">جاري تحميل الملخص...</p>' +
      '</div>' +
      '<div class="workroom-details-grid">' +
        '<div class="health-row"><span class="health-row__label">الحالة</span><span class="health-row__value">' + escapeHtml(statusLabel(job.status)) + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">الأجر</span><span class="health-row__value">' + escapeHtml(String(job.dailyWage || 0)) + ' جنيه/يوم</span></div>' +
        '<div class="health-row"><span class="health-row__label">تاريخ البدء</span><span class="health-row__value">' + escapeHtml(job.startDate || '-') + '</span></div>' +
        '<div class="health-row"><span class="health-row__label">المدة</span><span class="health-row__value">' + escapeHtml(String(job.durationDays || 0)) + ' يوم</span></div>' +
        '<div class="health-row"><span class="health-row__label">الرسائل غير المقروءة</span><span class="health-row__value">' + escapeHtml(String(currentWorkroom.unreadMessages || 0)) + '</span></div>' +
      '</div>' +
      templateHtml +
      '<div style="margin-block-start:1rem;">' +
        '<button class="btn btn--primary btn--sm" id="btnOpenWorkroomMessages">فتح الرسائل</button>' +
        '<button class="btn btn--ghost btn--sm" id="btnOpenWorkroomTimeline" style="margin-inline-start:0.5rem;">عرض السجل</button>' +
      '</div>';

    var msgBtn = document.getElementById('btnOpenWorkroomMessages');
    if (msgBtn) {
      msgBtn.addEventListener('click', function () {
        activeTab = 'messages';
        renderWorkroomDetail();
        loadMessages();
      });
    }

    var timelineBtn = document.getElementById('btnOpenWorkroomTimeline');
    if (timelineBtn) {
      timelineBtn.addEventListener('click', function () {
        activeTab = 'timeline';
        renderWorkroomDetail();
        loadTimeline();
      });
    }

    loadSummaryCards();
    wireTemplateButtons();
  }

  async function loadSummaryCards() {
    var grid = document.getElementById('workroomSummaryGrid');
    if (!grid || !currentWorkroom) return;

    try {
      var res = await Yawmia.api('GET', '/api/workrooms/' + currentWorkroom.jobId + '/summary');
      if (!res.data || !res.data.ok || !res.data.summary) {
        grid.innerHTML = '';
        return;
      }

      var s = res.data.summary;
      var cards = [
        {
          value: (s.messages && s.messages.unread) || 0,
          label: 'رسائل غير مقروءة'
        },
        {
          value: (s.pins && s.pins.total) || 0,
          label: 'رسائل مثبتة'
        },
        {
          value: ((s.checklist && s.checklist.completed) || 0) + '/' + ((s.checklist && s.checklist.total) || 0),
          label: 'مهام مكتملة'
        },
        {
          value: ((s.attendance && s.attendance.attendanceRate) || 0) + '%',
          label: 'نسبة الحضور'
        },
        {
          value: (s.payment && s.payment.exists) ? statusLabel(s.payment.status) : 'لا يوجد',
          label: 'حالة الدفع'
        }
      ];

      grid.innerHTML = '';
      cards.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'workroom-summary-card';
        card.innerHTML =
          '<div class="workroom-summary-card__value">' + escapeHtml(String(c.value)) + '</div>' +
          '<div class="workroom-summary-card__label">' + escapeHtml(c.label) + '</div>';
        grid.appendChild(card);
      });
    } catch (_) {
      grid.innerHTML = '';
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Messages
  // ═══════════════════════════════════════════════════════════════

  async function loadMessages() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    panel.innerHTML =
      '<div class="workroom-message-list" id="workroomMessageList">' +
        '<p class="empty-state">جاري تحميل الرسائل...</p>' +
      '</div>' +
      renderMessageComposer();

    wireComposer();

    try {
      var res = await Yawmia.api('GET', '/api/workrooms/' + currentWorkroom.jobId + '/messages?limit=100&offset=0');
      var listEl = document.getElementById('workroomMessageList');
      if (!listEl) return;

      if (!res.data || !res.data.ok || !res.data.items || res.data.items.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><span class="empty-state__icon">💬</span><p class="empty-state__text">لا توجد رسائل بعد</p><p class="empty-state__hint">ابدأ برسالة سريعة أو اكتب أول رسالة</p></div>';
      } else {
        renderMessages(res.data.items);
      }

      // Mark read in background.
      Yawmia.api('POST', '/api/workrooms/' + currentWorkroom.jobId + '/messages/read-all').catch(function () {});
    } catch (_) {
      var el = document.getElementById('workroomMessageList');
      if (el) el.innerHTML = '<p class="empty-state">خطأ في تحميل الرسائل</p>';
    }
  }

  function renderMessages(items) {
    var user = getUser();
    var listEl = document.getElementById('workroomMessageList');
    if (!listEl) return;

    listEl.innerHTML = '';

    var ordered = items.slice().reverse();
    ordered.forEach(function (msg) {
      var isMine = user && msg.senderId === user.id;
      var bubble = document.createElement('div');
      bubble.className = 'message-bubble' + (isMine ? ' message-bubble--mine' : ' message-bubble--other');

      var sourceLabel = msg.source === 'workroom'
        ? '<span style="color:var(--color-primary);font-size:0.65rem;">workroom</span>'
        : '';

      bubble.innerHTML =
        '<div class="message-bubble__sender">' + escapeHtml(msg.senderRole === 'employer' ? 'صاحب العمل' : 'عامل') + ' ' + sourceLabel + '</div>' +
        '<div class="message-bubble__text">' + escapeHtml(msg.text || '') + '</div>' +
        renderAttachments(msg.attachments || []) +
        '<div class="message-bubble__time">' + escapeHtml(formatDateTime(msg.createdAt)) + renderReceiptHint(msg, isMine) + '</div>' +
        renderPinButton(msg);

      listEl.appendChild(bubble);
    });

    listEl.scrollTop = listEl.scrollHeight;
    wirePinButtons();
  }

  function renderMessageComposer() {
    var templates = currentWorkroom.quickTemplates || [];
    var templateHtml = '';

    if (templates.length > 0) {
      templateHtml = '<div class="workroom-template-row">' +
        '<div class="workroom-template-buttons">';
      templates.forEach(function (t, idx) {
        templateHtml += '<button class="btn btn--ghost btn--sm workroom-template-btn" data-text="' + escapeHtml(t) + '" data-template-key="' + escapeHtml(currentWorkroom.userRoleInWorkroom + '_' + idx) + '">' + escapeHtml(t) + '</button>';
      });
      templateHtml += '</div></div>';
    }

    return templateHtml +
      '<div class="workroom-attachment-row">' +
        '<input type="file" id="workroomAttachmentInput" accept="image/*" class="form-input form-input--sm">' +
        '<small class="form-hint">اختياري: صورة واحدة لكل رسالة حالياً</small>' +
      '</div>' +
      '<div class="message-send-form workroom-composer">' +
        '<input type="text" class="message-input" id="workroomMessageInput" placeholder="اكتب رسالة..." maxlength="500">' +
        '<button class="btn btn--primary btn--sm" id="btnSendWorkroomMessage">إرسال</button>' +
      '</div>' +
      '<div class="message" id="workroomMessageError"></div>';
  }

  function wireComposer() {
    var input = document.getElementById('workroomMessageInput');
    var btn = document.getElementById('btnSendWorkroomMessage');

    async function send() {
      if (!currentWorkroom || !input) return;
      var text = input.value.trim();
      if (!text) return;

      await sendMessage(text, null, btn, function () {
        input.value = '';
        var fileInput = document.getElementById('workroomAttachmentInput');
        if (fileInput) fileInput.value = '';
        loadMessages();
      }, true);
    }

    if (btn) btn.addEventListener('click', send);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') send();
      });
    }

    wireTemplateButtons();
  }

  function wireTemplateButtons() {
    document.querySelectorAll('.workroom-template-btn').forEach(function (btn) {
      if (btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', async function () {
        var text = btn.getAttribute('data-text');
        var templateKey = btn.getAttribute('data-template-key');
        await sendMessage(text, templateKey, btn, function () {
          if (activeTab === 'messages') loadMessages();
          else if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم إرسال الرسالة');
        });
      });
    });
  }

  async function uploadSelectedAttachment(btn) {
    var fileInput = document.getElementById('workroomAttachmentInput');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return null;

    var file = fileInput.files[0];

    if (file.size > 2 * 1024 * 1024) {
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('حجم الصورة أكبر من 2MB');
      return null;
    }

    try {
      var dataUri = await fileToDataUri(file);
      var res = await Yawmia.api('POST', '/api/workrooms/' + currentWorkroom.jobId + '/attachments', {
        dataUri: dataUri,
        clientName: file.name,
      });

      if (res.data && res.data.ok && res.data.attachment) {
        return res.data.attachment;
      }

      if (typeof YawmiaToast !== 'undefined') {
        YawmiaToast.error((res.data && res.data.error) || 'تعذّر رفع المرفق');
      }
      return null;
    } catch (_) {
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في رفع المرفق');
      return null;
    }
  }

  function fileToDataUri(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('READ_FAILED')); };
      reader.readAsDataURL(file);
    });
  }

  async function sendMessage(text, templateKey, btn, onSuccess, includeAttachment) {
    if (!currentWorkroom || !text) return;

    var errorEl = document.getElementById('workroomMessageError');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.className = 'message';
    }

    if (btn) Yawmia.setLoading(btn, true);

    try {
      var body = { text: text };
      if (templateKey) body.templateKey = templateKey;

      if (includeAttachment) {
        var uploaded = await uploadSelectedAttachment(btn);
        if (uploaded) body.attachments = [uploaded];
      }

      var res = await Yawmia.api('POST', '/api/workrooms/' + currentWorkroom.jobId + '/messages', body);

      if (res.data && res.data.ok) {
        if (typeof onSuccess === 'function') onSuccess(res.data.message);
      } else {
        var msg = (res.data && res.data.error) || 'خطأ في إرسال الرسالة';
        if (errorEl) Yawmia.showMessage('workroomMessageError', msg, 'error');
        else if (typeof YawmiaToast !== 'undefined') YawmiaToast.error(msg);
      }
    } catch (_) {
      if (errorEl) Yawmia.showMessage('workroomMessageError', 'خطأ في الاتصال', 'error');
      else if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
    } finally {
      if (btn) Yawmia.setLoading(btn, false);
    }
  }

  function renderAttachments(attachments) {
    if (!attachments || !attachments.length) return '';

    var html = '<div class="message-attachments">';
    attachments.forEach(function (att) {
      if (att.type === 'image' && att.imageRef) {
        html += '<a class="attachment-chip" href="/api/images/' + encodeURIComponent(att.imageRef) + '" target="_blank" rel="noopener">' +
          '🖼 ' + escapeHtml(att.caption || att.clientName || 'صورة') +
        '</a>';
      }
    });
    html += '</div>';
    return html;
  }

  function renderReceiptHint(msg, isMine) {
    if (!isMine) return '';

    if (!msg.readReceipt) {
      return ' · <span class="read-receipt read-receipt--unknown">غير معروف</span>';
    }

    var count = msg.readReceipt.readCount || 0;
    if (count > 0) {
      return ' · <span class="read-receipt read-receipt--read">تمت القراءة</span>';
    }

    return ' · <span class="read-receipt read-receipt--unread">غير مقروء</span>';
  }

  function renderPinButton(msg) {
    var user = getUser();
    if (!user || !currentWorkroom) return '';
    if (currentWorkroom.userRoleInWorkroom !== 'employer') return '';
    return '<button class="btn btn--ghost btn--sm workroom-pin-btn" data-message-id="' + escapeHtml(msg.id) + '" style="margin-block-start:0.35rem;">📌 تثبيت</button>';
  }

  async function handlePinMessage(messageId, btn) {
    if (!currentWorkroom || !messageId) return;
    if (btn) Yawmia.setLoading(btn, true);

    try {
      var res = await Yawmia.api('POST', '/api/workrooms/' + currentWorkroom.jobId + '/pins', {
        messageId: messageId
      });
      if (res.data && res.data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم تثبيت الرسالة');
        if (activeTab === 'messages') loadMessages();
      } else {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.error((res.data && res.data.error) || 'خطأ في التثبيت');
      }
    } catch (_) {
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
    } finally {
      if (btn) Yawmia.setLoading(btn, false);
    }
  }

  function wirePinButtons() {
    document.querySelectorAll('.workroom-pin-btn').forEach(function (btn) {
      if (btn.dataset.wired === '1') return;
      btn.dataset.wired = '1';
      btn.addEventListener('click', function () {
        handlePinMessage(btn.getAttribute('data-message-id'), btn);
      });
    });
  }

  async function loadPinnedMessages() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    panel.innerHTML = '<p class="empty-state">جاري تحميل الرسائل المثبتة...</p>';

    try {
      var res = await Yawmia.api('GET', '/api/workrooms/' + currentWorkroom.jobId + '/pins');
      var pins = (res.data && res.data.pins) || [];

      if (pins.length === 0) {
        panel.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📌</span><p class="empty-state__text">لا توجد رسائل مثبتة بعد</p><p class="empty-state__hint">ثبّت أهم رسالة لتظهر هنا بسرعة</p></div>';
        return;
      }

      var html = '<div class="workroom-pin-list">';
      pins.forEach(function (pin) {
        var msg = pin.message || {};
        html += '<div class="workroom-pin-card">' +
          '<div class="workroom-pin-card__text">' + escapeHtml(msg.text || 'رسالة غير متاحة') + '</div>' +
          '<div class="workroom-pin-card__meta">' +
            escapeHtml(formatDateTime(pin.pinnedAt)) +
            (pin.note ? ' · ' + escapeHtml(pin.note) : '') +
          '</div>';

        if (currentWorkroom.userRoleInWorkroom === 'employer') {
          html += '<button class="btn btn--ghost btn--sm workroom-unpin-btn" data-message-id="' + escapeHtml(pin.messageId) + '" style="margin-block-start:0.5rem;color:var(--color-error);border-color:var(--color-error);">إلغاء التثبيت</button>';
        }

        html += '</div>';
      });
      html += '</div>';

      panel.innerHTML = html;

      panel.querySelectorAll('.workroom-unpin-btn').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          Yawmia.setLoading(btn, true);
          try {
            var r = await Yawmia.api('DELETE', '/api/workrooms/' + currentWorkroom.jobId + '/pins/' + btn.getAttribute('data-message-id'));
            if (r.data && r.data.ok) {
              if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم إلغاء التثبيت');
              loadPinnedMessages();
            } else {
              if (typeof YawmiaToast !== 'undefined') YawmiaToast.error((r.data && r.data.error) || 'خطأ');
            }
          } catch (_) {
            if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
          } finally {
            Yawmia.setLoading(btn, false);
          }
        });
      });
    } catch (_) {
      panel.innerHTML = '<p class="empty-state">خطأ في تحميل الرسائل المثبتة</p>';
    }
  }

  async function loadChecklist() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    panel.innerHTML = '<p class="empty-state">جاري تحميل المهام...</p>';

    try {
      var res = await Yawmia.api('GET', '/api/workrooms/' + currentWorkroom.jobId + '/checklist');
      var checklist = (res.data && res.data.checklist) || { items: [] };
      renderChecklist(checklist);
    } catch (_) {
      panel.innerHTML = '<p class="empty-state">خطأ في تحميل قائمة المهام</p>';
    }
  }

  function renderChecklist(checklist) {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    var items = checklist.items || [];
    var html = '<div class="workroom-checklist">';

    if (currentWorkroom.userRoleInWorkroom === 'employer') {
      html += '<div class="workroom-checklist-create">' +
        '<input type="text" id="workroomChecklistText" class="form-input form-input--sm" placeholder="أضف مهمة..." maxlength="300">' +
        '<button class="btn btn--primary btn--sm" id="btnCreateChecklistItem">إضافة</button>' +
      '</div>';
    }

    if (items.length === 0) {
      html += '<div class="empty-state"><span class="empty-state__icon">✅</span><p class="empty-state__text">لا توجد مهام بعد</p><p class="empty-state__hint">استخدم المهام لتوضيح المطلوب قبل وأثناء الشغل</p></div>';
    } else {
      html += '<div class="workroom-checklist-items">';
      items.forEach(function (item) {
        var done = item.status === 'completed';
        html += '<div class="workroom-checklist-item' + (done ? ' workroom-checklist-item--done' : '') + '">' +
          '<label>' +
            '<input type="checkbox" class="workroom-checklist-toggle" data-item-id="' + escapeHtml(item.id) + '" ' + (done ? 'checked disabled' : '') + '>' +
            '<span>' + escapeHtml(item.text || '') + '</span>' +
          '</label>';

        if (currentWorkroom.userRoleInWorkroom === 'employer') {
          html += '<button class="btn btn--ghost btn--sm workroom-checklist-delete" data-item-id="' + escapeHtml(item.id) + '">حذف</button>';
        }

        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    panel.innerHTML = html;

    var createBtn = document.getElementById('btnCreateChecklistItem');
    var input = document.getElementById('workroomChecklistText');
    if (createBtn && input) {
      createBtn.addEventListener('click', async function () {
        var text = input.value.trim();
        if (!text) return;
        Yawmia.setLoading(createBtn, true);
        try {
          var r = await Yawmia.api('POST', '/api/workrooms/' + currentWorkroom.jobId + '/checklist', { text: text });
          if (r.data && r.data.ok) {
            input.value = '';
            loadChecklist();
          } else {
            if (typeof YawmiaToast !== 'undefined') YawmiaToast.error((r.data && r.data.error) || 'خطأ');
          }
        } catch (_) {
          if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(createBtn, false);
        }
      });
    }

    panel.querySelectorAll('.workroom-checklist-toggle').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        var itemId = cb.getAttribute('data-item-id');
        try {
          var r = await Yawmia.api('PUT', '/api/workrooms/' + currentWorkroom.jobId + '/checklist/' + itemId, {
            status: 'completed'
          });
          if (r.data && r.data.ok) {
            loadChecklist();
          } else {
            cb.checked = false;
            if (typeof YawmiaToast !== 'undefined') YawmiaToast.error((r.data && r.data.error) || 'خطأ');
          }
        } catch (_) {
          cb.checked = false;
          if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
        }
      });
    });

    panel.querySelectorAll('.workroom-checklist-delete').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var itemId = btn.getAttribute('data-item-id');
        Yawmia.setLoading(btn, true);
        try {
          var r = await Yawmia.api('DELETE', '/api/workrooms/' + currentWorkroom.jobId + '/checklist/' + itemId);
          if (r.data && r.data.ok) {
            loadChecklist();
          } else {
            if (typeof YawmiaToast !== 'undefined') YawmiaToast.error((r.data && r.data.error) || 'خطأ');
          }
        } catch (_) {
          if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(btn, false);
        }
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Search
  // ═══════════════════════════════════════════════════════════════

  function renderSearchTab() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    panel.innerHTML =
      '<div class="workroom-search-box">' +
        '<input type="search" id="workroomSearchInput" class="form-input form-input--sm" placeholder="ابحث في الرسائل..." aria-label="بحث في رسائل مساحة العمل">' +
        '<button class="btn btn--primary btn--sm" id="btnWorkroomSearch">بحث</button>' +
      '</div>' +
      '<div id="workroomSearchResults" class="workroom-search-results">' +
        '<p class="empty-state">اكتب كلمة للبحث داخل رسائل مساحة العمل</p>' +
      '</div>';

    var btn = document.getElementById('btnWorkroomSearch');
    var input = document.getElementById('workroomSearchInput');

    async function doSearch() {
      var q = input ? input.value.trim() : '';
      var resultsEl = document.getElementById('workroomSearchResults');
      if (!resultsEl) return;

      if (q.length < 2) {
        resultsEl.innerHTML = '<p class="empty-state">كلمة البحث لازم تكون حرفين على الأقل</p>';
        return;
      }

      resultsEl.innerHTML = '<p class="empty-state">جاري البحث...</p>';

      try {
        var res = await Yawmia.api('GET', '/api/workrooms/' + currentWorkroom.jobId + '/search?q=' + encodeURIComponent(q) + '&limit=50');
        if (!res.data || !res.data.ok || !res.data.results || res.data.results.length === 0) {
          resultsEl.innerHTML = '<p class="empty-state">لا توجد نتائج</p>';
          return;
        }

        var html = '<div class="workroom-search-meta">تم العثور على ' + res.data.total + ' نتيجة' +
          (res.data.fallbackUsed ? ' · بحث احتياطي' : '') +
          '</div>';

        res.data.results.forEach(function (msg) {
          html += '<div class="workroom-search-result">' +
            '<div class="workroom-search-result__text">' + escapeHtml(msg.preview || msg.text || '') + '</div>' +
            '<div class="workroom-search-result__meta">' +
              escapeHtml(msg.senderRole === 'employer' ? 'صاحب العمل' : 'عامل') +
              ' · ' + escapeHtml(formatDateTime(msg.createdAt)) +
            '</div>' +
          '</div>';
        });

        resultsEl.innerHTML = html;
      } catch (_) {
        resultsEl.innerHTML = '<p class="empty-state">خطأ في البحث</p>';
      }
    }

    if (btn) btn.addEventListener('click', doSearch);
    if (input) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doSearch();
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Timeline
  // ═══════════════════════════════════════════════════════════════

  async function loadTimeline() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    panel.innerHTML =
      '<div class="workroom-timeline-filter">' +
        '<select id="workroomTimelineType" class="form-input form-input--sm" aria-label="فلترة السجل">' +
          '<option value="">كل الأحداث</option>' +
          '<option value="attendance_checkin,attendance_confirmed,attendance_noshow">الحضور</option>' +
          '<option value="payment_created,payment_confirmed,payment_completed,payment_disputed">الدفع</option>' +
          '<option value="job_created,job_started,job_completed">الفرصة</option>' +
          '<option value="message_pinned,checklist_item_created,checklist_item_completed,attachment_added">التعاون</option>' +
        '</select>' +
      '</div>' +
      '<div class="workroom-timeline"><p class="empty-state">جاري تحميل السجل...</p></div>';

    try {
      var typeEl = document.getElementById('workroomTimelineType');
      var type = typeEl ? typeEl.value : '';
      var url = '/api/workrooms/' + currentWorkroom.jobId + '/timeline?limit=200';
      if (type) url += '&type=' + encodeURIComponent(type);

      var res = await Yawmia.api('GET', url);
      if (!res.data || !res.data.ok) {
        panel.innerHTML = '<p class="empty-state">تعذّر تحميل السجل</p>';
        return;
      }

      var timeline = res.data.timeline || [];
      renderTimeline(timeline);

      var typeEl = document.getElementById('workroomTimelineType');
      if (typeEl && typeEl.dataset.wired !== '1') {
        typeEl.dataset.wired = '1';
        typeEl.addEventListener('change', loadTimeline);
      }
    } catch (_) {
      panel.innerHTML = '<p class="empty-state">خطأ في تحميل السجل</p>';
    }
  }

  function renderTimeline(timeline) {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel) return;

    if (!timeline || timeline.length === 0) {
      panel.innerHTML = '<p class="empty-state">لا توجد أحداث بعد</p>';
      return;
    }

    var html = '<div class="workroom-timeline">';
    timeline.forEach(function (evt) {
      html += '<div class="timeline-event timeline-event--' + escapeHtml(evt.type || 'event') + '">' +
        '<div class="timeline-event__dot"></div>' +
        '<div class="timeline-event__body">' +
          '<div class="timeline-event__label">' + escapeHtml(evt.label || evt.type || 'حدث') + '</div>' +
          '<div class="timeline-event__time">' + escapeHtml(formatDateTime(evt.timestamp)) + '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    panel.innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════════
  // Events
  // ═══════════════════════════════════════════════════════════════

  window.addEventListener('yawmia:notification', function (e) {
    try {
      if (!e.detail) return;
      if (e.detail.type === 'new_message') {
        if (listMountEl) loadWorkrooms({ silent: true });
        if (currentWorkroom && activeTab === 'messages') {
          loadMessages();
        }
      }
    } catch (_) {}
  });

  window.addEventListener('yawmia:workroom-message', function (e) {
    try {
      if (!e.detail) return;

      var incoming = e.detail;
      var isCurrentWorkroom = currentJobId && incoming.jobId === currentJobId;

      if (listMountEl) {
        loadWorkrooms({ silent: true });
      }

      if (isCurrentWorkroom && activeTab === 'messages') {
        loadMessages();

        if (typeof Yawmia !== 'undefined' && document.visibilityState === 'visible') {
          Yawmia.api('POST', '/api/workrooms/' + currentJobId + '/messages/read-all').catch(function () {});
          if (Yawmia.refreshMessageUnreadBadge) Yawmia.refreshMessageUnreadBadge();
        }

        return;
      }

      if (!isCurrentWorkroom && typeof YawmiaToast !== 'undefined') {
        YawmiaToast.info('💬 رسالة جديدة — افتح المحادثة');
      }
    } catch (_) {}
  });

  function destroy() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    listMountEl = null;
    detailMountEl = null;
    currentWorkroom = null;
    currentJobId = null;
  }

  return {
    initList: initList,
    initJobDetail: initJobDetail,
    loadWorkrooms: loadWorkrooms,
    loadWorkroomDetail: loadWorkroomDetail,
    destroy: destroy,
  };
})();
