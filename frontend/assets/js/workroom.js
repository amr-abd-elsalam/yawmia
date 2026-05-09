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
      activeTab = window.location.hash === '#workroom-messages' ? 'messages' :
                  window.location.hash === '#workroom-timeline' ? 'timeline' :
                  'details';

      renderWorkroomDetail();
      if (activeTab === 'messages') loadMessages();
      if (activeTab === 'timeline') loadTimeline();
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

    wireTemplateButtons();
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
        listEl.innerHTML = '<p class="empty-state">لا توجد رسائل بعد</p>';
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
        '<div class="message-bubble__time">' + escapeHtml(formatDateTime(msg.createdAt)) + '</div>';

      listEl.appendChild(bubble);
    });

    listEl.scrollTop = listEl.scrollHeight;
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
        loadMessages();
      });
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

  async function sendMessage(text, templateKey, btn, onSuccess) {
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

  // ═══════════════════════════════════════════════════════════════
  // Timeline
  // ═══════════════════════════════════════════════════════════════

  async function loadTimeline() {
    var panel = document.getElementById('workroomTabPanel');
    if (!panel || !currentWorkroom) return;

    panel.innerHTML = '<div class="workroom-timeline"><p class="empty-state">جاري تحميل السجل...</p></div>';

    try {
      var res = await Yawmia.api('GET', '/api/workrooms/' + currentWorkroom.jobId + '/timeline?limit=200');
      if (!res.data || !res.data.ok) {
        panel.innerHTML = '<p class="empty-state">تعذّر تحميل السجل</p>';
        return;
      }

      var timeline = res.data.timeline || [];
      renderTimeline(timeline);
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
