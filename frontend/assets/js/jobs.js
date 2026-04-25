// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/jobs.js — Jobs Orchestrator (IIFE)
// Phase 38 — Reduced from ~1050 LOC to ~400 LOC
// Delegates: YawmiaJobCard, YawmiaPanels, YawmiaRatingModal
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  if (!Yawmia.isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  var user = Yawmia.getUser();

  // ── Setup Header ──────────────────────────────────────────
  var headerName = Yawmia.$id('headerUserName');
  var headerRole = Yawmia.$id('headerUserRole');
  if (headerName) headerName.textContent = user.name || user.phone;
  if (headerRole) {
    headerRole.textContent = Yawmia.roleLabel(user.role);
    headerRole.classList.add('badge--' + user.role);
  }

  var btnLogout = Yawmia.$id('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () { Yawmia.logout(); });
  }

  // ── Welcome Card ──────────────────────────────────────────
  var welcomeTitle = Yawmia.$id('welcomeTitle');
  var welcomeDesc = Yawmia.$id('welcomeDesc');
  if (welcomeTitle) welcomeTitle.textContent = 'أهلاً ' + (user.name || 'بيك') + '!';
  if (welcomeDesc) {
    if (user.role === 'worker') welcomeDesc.textContent = 'شوف الفرص المتاحة قريب منك وتقدّم دلوقتي.';
    else if (user.role === 'employer') welcomeDesc.textContent = 'انشر فرصة عمل جديدة وأوصل لأفضل العمال.';
  }

  // ── First-Time User Hints ─────────────────────────────────
  (function showFirstTimeHints() {
    try { if (localStorage.getItem('yawmia_hints_seen') === '1') return; } catch (_) {}
    var welcomeCard = Yawmia.$id('welcomeCard');
    if (!welcomeCard) return;
    var hints = [];
    if (user.role === 'worker') {
      hints = ['📝 أكمل بياناتك في صفحة "ملفي" عشان أصحاب العمل يلاقوك بسهولة', '📍 فعّل الموقع الجغرافي عشان تشوف الفرص القريبة منك', '🔔 فعّل الإشعارات عشان توصلك الفرص الجديدة أول بأول'];
    } else if (user.role === 'employer') {
      hints = ['📋 انشر فرصة عمل من النموذج أدناه — حدد التخصص والمحافظة واليومية', '⭐ قيّم العمال بعد إنهاء الفرصة عشان تساعد أصحاب العمل التانيين', '🔔 فعّل الإشعارات عشان توصلك الطلبات الجديدة فوراً'];
    }
    if (hints.length === 0) return;
    var hintsDiv = document.createElement('div');
    hintsDiv.className = 'hints-list';
    hintsDiv.innerHTML = '<p class="hints-list__title">💡 نصائح للبداية:</p>';
    var ul = document.createElement('ul');
    ul.className = 'hints-list__items';
    hints.forEach(function (hint) { var li = document.createElement('li'); li.className = 'hints-list__item'; li.textContent = hint; ul.appendChild(li); });
    hintsDiv.appendChild(ul);
    var dismissBtn = document.createElement('button');
    dismissBtn.className = 'btn btn--ghost btn--sm';
    dismissBtn.textContent = 'فهمت ✓';
    dismissBtn.addEventListener('click', function () { hintsDiv.remove(); try { localStorage.setItem('yawmia_hints_seen', '1'); } catch (_) {} });
    hintsDiv.appendChild(dismissBtn);
    welcomeCard.appendChild(hintsDiv);
  })();

  // ── Show/Hide Sections ────────────────────────────────────
  if (user.role === 'employer') { Yawmia.show('createJobSection'); setupCreateJob(); }

  // ── Populate Filters ──────────────────────────────────────
  Yawmia.populateGovernorates('filterGov');
  Yawmia.populateCategories('filterCat');

  // ── Inject Search + Sort + Advanced Filters ───────────────
  (function injectFilterControls() {
    var filtersDiv = document.querySelector('.filters');
    if (!filtersDiv) return;
    var btnFilter = Yawmia.$id('btnFilterJobs');

    var searchLabel = document.createElement('label'); searchLabel.className = 'sr-only'; searchLabel.setAttribute('for', 'filterSearch'); searchLabel.textContent = 'بحث في الفرص';
    var searchInput = document.createElement('input'); searchInput.type = 'text'; searchInput.id = 'filterSearch'; searchInput.className = 'form-input form-input--sm'; searchInput.placeholder = 'بحث بالكلمة...';
    searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { currentPage = 1; loadJobs(); } });
    filtersDiv.insertBefore(searchLabel, btnFilter); filtersDiv.insertBefore(searchInput, btnFilter);

    var sortLabel = document.createElement('label'); sortLabel.className = 'sr-only'; sortLabel.setAttribute('for', 'filterSort'); sortLabel.textContent = 'ترتيب الفرص';
    var sortSelect = document.createElement('select'); sortSelect.id = 'filterSort'; sortSelect.className = 'form-input form-input--sm';
    sortSelect.innerHTML = '<option value="">ترتيب: الأحدث</option><option value="wage_high">الأجر الأعلى</option><option value="wage_low">الأجر الأقل</option>';
    filtersDiv.insertBefore(sortLabel, btnFilter); filtersDiv.insertBefore(sortSelect, btnFilter);

    var btnAdvanced = document.createElement('button'); btnAdvanced.className = 'btn btn--ghost btn--sm'; btnAdvanced.id = 'btnToggleAdvancedFilters'; btnAdvanced.textContent = 'فلاتر متقدمة ▾'; btnAdvanced.setAttribute('aria-expanded', 'false'); btnAdvanced.setAttribute('aria-controls', 'advancedFilters');
    filtersDiv.insertBefore(btnAdvanced, btnFilter);

    var advPanel = Yawmia.$id('advancedFilters');
    if (advPanel) {
      Yawmia.loadConfig().then(function (cfg) {
        if (!cfg) return;
        var html = '<div class="advanced-filters__inner">';
        html += '<div class="form-group"><label class="form-label">التخصصات (اختار أكثر من واحد)</label><div class="checkbox-grid" id="advCategoriesGrid">';
        if (cfg.LABOR_CATEGORIES) { cfg.LABOR_CATEGORIES.forEach(function (cat) { html += '<label class="checkbox-label"><input type="checkbox" name="advCategories" value="' + YawmiaUtils.escapeHtml(cat.id) + '"><span>' + YawmiaUtils.escapeHtml(cat.icon + ' ' + cat.label) + '</span></label>'; }); }
        html += '</div></div>';
        html += '<div class="form-group"><label class="form-label">نطاق الأجر اليومي (جنيه)</label><div class="location-group"><div class="form-group"><input type="number" id="advMinWage" class="form-input form-input--sm" placeholder="الحد الأدنى" min="0"></div><div class="form-group"><input type="number" id="advMaxWage" class="form-input form-input--sm" placeholder="الحد الأقصى" min="0"></div></div></div>';
        html += '<div class="form-group"><label class="form-label">نطاق تاريخ البدء</label><div class="location-group"><div class="form-group"><input type="date" id="advDateFrom" class="form-input form-input--sm" dir="ltr"></div><div class="form-group"><input type="date" id="advDateTo" class="form-input form-input--sm" dir="ltr"></div></div></div>';
        html += '</div>';
        advPanel.innerHTML = html;
        restoreAdvancedFilters();
      }).catch(function () {});
    }
    btnAdvanced.addEventListener('click', function () {
      if (!advPanel) return;
      var isHidden = advPanel.classList.contains('hidden');
      if (isHidden) { advPanel.classList.remove('hidden'); btnAdvanced.textContent = 'فلاتر متقدمة ▴'; btnAdvanced.setAttribute('aria-expanded', 'true'); }
      else { advPanel.classList.add('hidden'); btnAdvanced.textContent = 'فلاتر متقدمة ▾'; btnAdvanced.setAttribute('aria-expanded', 'false'); }
    });
  })();

  function saveAdvancedFilters() {
    try {
      var state = {};
      var checkedCats = document.querySelectorAll('input[name="advCategories"]:checked');
      state.categories = Array.from(checkedCats).map(function (el) { return el.value; });
      var minW = Yawmia.$id('advMinWage'); var maxW = Yawmia.$id('advMaxWage'); var dateFrom = Yawmia.$id('advDateFrom'); var dateTo = Yawmia.$id('advDateTo');
      if (minW && minW.value) state.minWage = minW.value; if (maxW && maxW.value) state.maxWage = maxW.value;
      if (dateFrom && dateFrom.value) state.startDateFrom = dateFrom.value; if (dateTo && dateTo.value) state.startDateTo = dateTo.value;
      var govSel = Yawmia.$id('filterGov'); var searchInp = Yawmia.$id('filterSearch'); var sortSel = Yawmia.$id('filterSort');
      if (govSel && govSel.value) state.governorate = govSel.value; if (searchInp && searchInp.value) state.search = searchInp.value; if (sortSel && sortSel.value) state.sort = sortSel.value;
      sessionStorage.setItem('yawmia_filters', JSON.stringify(state));
    } catch (_) {}
  }

  function restoreAdvancedFilters() {
    try {
      var raw = sessionStorage.getItem('yawmia_filters'); if (!raw) return; var state = JSON.parse(raw); if (!state) return;
      if (state.categories && Array.isArray(state.categories)) { state.categories.forEach(function (catId) { var cb = document.querySelector('input[name="advCategories"][value="' + catId + '"]'); if (cb) cb.checked = true; }); }
      var minW = Yawmia.$id('advMinWage'); var maxW = Yawmia.$id('advMaxWage'); var dateFrom = Yawmia.$id('advDateFrom'); var dateTo = Yawmia.$id('advDateTo');
      if (minW && state.minWage) minW.value = state.minWage; if (maxW && state.maxWage) maxW.value = state.maxWage;
      if (dateFrom && state.startDateFrom) dateFrom.value = state.startDateFrom; if (dateTo && state.startDateTo) dateTo.value = state.startDateTo;
      var govSel = Yawmia.$id('filterGov'); var searchInp = Yawmia.$id('filterSearch'); var sortSel = Yawmia.$id('filterSort');
      if (govSel && state.governorate) govSel.value = state.governorate; if (searchInp && state.search) searchInp.value = state.search; if (sortSel && state.sort) sortSel.value = state.sort;
      if (state.categories && state.categories.length > 0 || state.minWage || state.maxWage || state.startDateFrom || state.startDateTo) {
        var advPanel = Yawmia.$id('advancedFilters'); var btnAdv = Yawmia.$id('btnToggleAdvancedFilters');
        if (advPanel) advPanel.classList.remove('hidden'); if (btnAdv) { btnAdv.textContent = 'فلاتر متقدمة ▴'; btnAdv.setAttribute('aria-expanded', 'true'); }
      }
    } catch (_) {}
  }

  // ── SSE + Push ────────────────────────────────────────────
  if (Yawmia.connectSSE) Yawmia.connectSSE();
  if (Yawmia.subscribeToPush) Yawmia.subscribeToPush();

  window.addEventListener('yawmia:notification', function (e) {
    loadNotifications();
    if (e.detail && e.detail.type === 'new_application') loadJobs();
  });

  window.addEventListener('yawmia:sse-init', function (e) {
    var countBadge = Yawmia.$id('notificationCount');
    if (countBadge && e.detail && e.detail.unreadCount > 0) { countBadge.textContent = e.detail.unreadCount; countBadge.classList.remove('hidden'); countBadge.classList.add('notification-badge-live'); }
    var bottomBadge = Yawmia.$id('bottomNavBadge');
    if (bottomBadge && e.detail && e.detail.unreadCount > 0) { bottomBadge.textContent = e.detail.unreadCount; bottomBadge.classList.remove('hidden'); } else if (bottomBadge) { bottomBadge.classList.add('hidden'); }
  });

  // ── Notifications Drawer ──────────────────────────────────
  loadNotifications();
  var notificationBell = Yawmia.$id('notificationBell');
  var notificationPanel = Yawmia.$id('notificationPanel');
  var notificationOverlay = Yawmia.$id('notificationOverlay');
  var btnCloseNotifPanel = Yawmia.$id('btnCloseNotifPanel');

  function openNotifPanel() { if (!notificationPanel || !notificationOverlay) return; notificationOverlay.classList.add('notification-overlay--visible'); notificationPanel.classList.add('notification-panel--open'); document.body.style.overflow = 'hidden'; loadNotifications(); if (btnCloseNotifPanel) btnCloseNotifPanel.focus(); }
  function closeNotifPanel() { if (!notificationPanel || !notificationOverlay) return; notificationPanel.classList.remove('notification-panel--open'); notificationOverlay.classList.remove('notification-overlay--visible'); document.body.style.overflow = ''; if (notificationBell) notificationBell.focus(); }

  if (notificationBell) { notificationBell.addEventListener('click', function () { if (notificationPanel && notificationPanel.classList.contains('notification-panel--open')) closeNotifPanel(); else openNotifPanel(); }); }
  if (notificationOverlay) notificationOverlay.addEventListener('click', closeNotifPanel);
  if (btnCloseNotifPanel) btnCloseNotifPanel.addEventListener('click', closeNotifPanel);
  document.addEventListener('keydown', function (e) { if ((e.key === 'Escape' || e.keyCode === 27) && notificationPanel && notificationPanel.classList.contains('notification-panel--open')) closeNotifPanel(); });
  var bottomNavNotifBtn = Yawmia.$id('bottomNavNotif');
  if (bottomNavNotifBtn) bottomNavNotifBtn.addEventListener('click', function () { openNotifPanel(); });

  var btnMarkAllRead = Yawmia.$id('btnMarkAllRead');
  if (btnMarkAllRead) { btnMarkAllRead.addEventListener('click', async function () { try { await Yawmia.api('POST', '/api/notifications/read-all'); loadNotifications(); } catch (err) {} }); }

  async function loadNotifications() {
    try {
      var res = await Yawmia.api('GET', '/api/notifications?limit=20&offset=0');
      if (res.data.ok) {
        var countBadge = Yawmia.$id('notificationCount');
        if (countBadge) { if (res.data.unread > 0) { countBadge.textContent = res.data.unread; countBadge.classList.remove('hidden'); } else { countBadge.classList.add('hidden'); } var bottomBadge2 = Yawmia.$id('bottomNavBadge'); if (bottomBadge2) { if (res.data.unread > 0) { bottomBadge2.textContent = res.data.unread; bottomBadge2.classList.remove('hidden'); } else { bottomBadge2.classList.add('hidden'); } } }
        var ntfList = Yawmia.$id('notificationList');
        if (ntfList && res.data.items.length > 0) {
          ntfList.innerHTML = '';
          res.data.items.forEach(function (ntf) {
            var item = document.createElement('div'); item.className = 'notification-item' + (ntf.read ? '' : ' notification-item--unread'); item.setAttribute('aria-label', (ntf.read ? '' : 'غير مقروء: ') + ntf.message);
            item.innerHTML = '<p class="notification-item__msg">' + YawmiaUtils.escapeHtml(ntf.message) + '</p><span class="notification-item__time">' + new Date(ntf.createdAt).toLocaleString('ar-EG') + '</span>';
            if (!ntf.read) { item.addEventListener('click', async function () { try { await Yawmia.api('POST', '/api/notifications/' + ntf.id + '/read'); item.classList.remove('notification-item--unread'); loadNotifications(); } catch (e) {} }); }
            ntfList.appendChild(item);
          });
        } else if (ntfList) { ntfList.innerHTML = '<div class="notification-panel__empty"><span class="notification-panel__empty-icon">🔔</span><p>لا توجد إشعارات</p></div>'; }
      }
    } catch (err) {
      var ntfListErr = Yawmia.$id('notificationList');
      if (ntfListErr) { ntfListErr.innerHTML = '<div class="notification-panel__empty"><span class="notification-panel__empty-icon">⚠️</span><p>خطأ في تحميل الإشعارات</p><button class="btn btn--ghost btn--sm" id="retryLoadNotifs" style="margin-top:0.5rem;">🔄 حاول مرة تانية</button></div>'; var retryNBtn = Yawmia.$id('retryLoadNotifs'); if (retryNBtn) retryNBtn.addEventListener('click', function () { loadNotifications(); }); }
    }
  }

  // ── Pagination ────────────────────────────────────────────
  var currentPage = 1;
  var pageLimit = 20;

  loadJobs();
  if (user.role === 'worker') loadRecentJobs();
  checkPendingRatings();

  var btnFilterJobs = Yawmia.$id('btnFilterJobs');
  if (btnFilterJobs) btnFilterJobs.addEventListener('click', function () { currentPage = 1; loadJobs(); });

  var quickFilterBtns = document.querySelectorAll('.quick-filter');
  quickFilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      quickFilterBtns.forEach(function (b) { b.classList.remove('active', 'btn--primary'); b.classList.add('btn--ghost'); });
      btn.classList.add('active', 'btn--primary'); btn.classList.remove('btn--ghost');
      currentPage = 1; loadJobs();
    });
  });

  var btnPrevPage = Yawmia.$id('btnPrevPage');
  var btnNextPage = Yawmia.$id('btnNextPage');
  if (btnPrevPage) btnPrevPage.addEventListener('click', function () { if (currentPage > 1) { currentPage--; loadJobs(); } });
  if (btnNextPage) btnNextPage.addEventListener('click', function () { currentPage++; loadJobs(); });

  // ── Load Jobs — Orchestrates card creation via YawmiaJobCard ──
  async function loadJobs() {
    var jobsList = Yawmia.$id('jobsList');
    if (!jobsList) return;
    jobsList.innerHTML = YawmiaUtils.skeletonJobCards(3);

    if (user.role === 'employer') {
      Yawmia.api('GET', '/api/jobs/mine?enrich=applications&limit=100').then(function (mineRes) {
        if (mineRes.data.ok && mineRes.data.jobs) { window._enrichedMyJobs = {}; mineRes.data.jobs.forEach(function (j) { if (typeof j.pendingApplicationsCount === 'number') window._enrichedMyJobs[j.id] = j.pendingApplicationsCount; }); }
      }).catch(function () {});
    }

    var gov = Yawmia.$id('filterGov') ? Yawmia.$id('filterGov').value : '';
    var cat = Yawmia.$id('filterCat') ? Yawmia.$id('filterCat').value : '';
    var search = Yawmia.$id('filterSearch') ? Yawmia.$id('filterSearch').value.trim() : '';
    var sort = Yawmia.$id('filterSort') ? Yawmia.$id('filterSort').value : '';
    var advCategories = []; document.querySelectorAll('input[name="advCategories"]:checked').forEach(function (el) { advCategories.push(el.value); });
    var advMinWage = Yawmia.$id('advMinWage') ? Yawmia.$id('advMinWage').value.trim() : '';
    var advMaxWage = Yawmia.$id('advMaxWage') ? Yawmia.$id('advMaxWage').value.trim() : '';
    var advDateFrom = Yawmia.$id('advDateFrom') ? Yawmia.$id('advDateFrom').value : '';
    var advDateTo = Yawmia.$id('advDateTo') ? Yawmia.$id('advDateTo').value : '';
    saveAdvancedFilters();

    var query = '/api/jobs?page=' + currentPage + '&limit=' + pageLimit + '&';
    if (gov) query += 'governorate=' + encodeURIComponent(gov) + '&';
    if (advCategories.length > 0) query += 'categories=' + encodeURIComponent(advCategories.join(',')) + '&';
    else if (cat) query += 'category=' + encodeURIComponent(cat) + '&';
    if (search) query += 'search=' + encodeURIComponent(search) + '&';
    if (sort) query += 'sort=' + encodeURIComponent(sort) + '&';
    if (advMinWage) query += 'minWage=' + encodeURIComponent(advMinWage) + '&';
    if (advMaxWage) query += 'maxWage=' + encodeURIComponent(advMaxWage) + '&';
    if (advDateFrom) query += 'startDateFrom=' + encodeURIComponent(advDateFrom) + '&';
    if (advDateTo) query += 'startDateTo=' + encodeURIComponent(advDateTo) + '&';
    var activeQuickFilter = document.querySelector('.quick-filter.active');
    var urgencyFilter = activeQuickFilter ? activeQuickFilter.getAttribute('data-urgency') : '';
    if (urgencyFilter) query += 'urgency=' + encodeURIComponent(urgencyFilter) + '&';

    try {
      var res = await Yawmia.api('GET', query);
      if (res.data.ok && res.data.jobs.length > 0) {
        jobsList.innerHTML = '';
        var callbacks = {
          onReload: loadJobs,
          onToggleApps: function (card, job) { YawmiaPanels.toggleApplications(card, job, { onReload: loadJobs }); },
          onToggleAttendance: function (card, job) { YawmiaPanels.toggleAttendance(card, job, { onReload: loadJobs }); },
          onToggleMessaging: function (card, job) { YawmiaPanels.toggleMessaging(card, job, user, {}); },
          onShowRating: function (job, targetId) { YawmiaRatingModal.showRating(job, targetId, user, loadJobs); },
          onShowReceipt: function (receipt) { YawmiaRatingModal.showReceipt(receipt); },
        };
        res.data.jobs.forEach(function (job) {
          jobsList.appendChild(YawmiaJobCard.create(job, user, callbacks));
        });
        updatePagination(res.data);
        var liveRegion = Yawmia.$id('jobsLiveRegion');
        if (liveRegion) liveRegion.textContent = 'تم تحميل ' + res.data.total + ' فرصة';
      } else {
        jobsList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">📋</span><p class="empty-state__text">لا توجد فرص متاحة حالياً</p><p class="empty-state__hint">جرّب تغيير الفلاتر أو المحافظة</p></div>';
        Yawmia.hide('paginationControls');
      }
    } catch (err) {
      jobsList.innerHTML = '<div class="empty-state"><span class="empty-state__icon">⚠️</span><p class="empty-state__text">خطأ في تحميل الفرص</p><p class="empty-state__hint">تأكد من اتصالك بالإنترنت وحاول مرة تانية</p><button class="btn btn--primary btn--sm" id="retryLoadJobs" style="margin-top:0.75rem;">🔄 حاول مرة تانية</button></div>';
      Yawmia.hide('paginationControls');
      var retryBtn = Yawmia.$id('retryLoadJobs');
      if (retryBtn) retryBtn.addEventListener('click', function () { loadJobs(); });
    }
  }

  function updatePagination(data) {
    var controls = Yawmia.$id('paginationControls'); var info = Yawmia.$id('paginationInfo');
    if (!controls) return;
    if (data.totalPages > 1) { Yawmia.show('paginationControls'); if (info) info.textContent = 'صفحة ' + data.page + ' من ' + data.totalPages + ' (' + data.total + ' فرصة)'; if (btnPrevPage) btnPrevPage.disabled = (data.page <= 1); if (btnNextPage) btnNextPage.disabled = (data.page >= data.totalPages); }
    else { Yawmia.hide('paginationControls'); }
  }

  // ── Create Job Form ───────────────────────────────────────
  function setupCreateJob() {
    Yawmia.populateCategories('jobCategory');
    Yawmia.populateGovernorates('jobGovernorate');

    (async function checkFirstJob() {
      try { var mineRes = await Yawmia.api('GET', '/api/jobs/mine?limit=1'); if (mineRes.data.ok && mineRes.data.total === 0) { var formSection = Yawmia.$id('createJobSection'); if (formSection) { formSection.classList.add('first-job-highlight'); formSection.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } } catch (_) {}
    })();

    var workerInput = Yawmia.$id('jobWorkers'); var wageInput = Yawmia.$id('jobWage'); var durationInput = Yawmia.$id('jobDuration'); var feePercent = 15;
    Yawmia.loadConfig().then(function (cfg) { if (cfg && cfg.FINANCIALS && typeof cfg.FINANCIALS.platformFeePercent === 'number') feePercent = cfg.FINANCIALS.platformFeePercent; }).catch(function () {});

    function updateCost() {
      var workers = parseInt(workerInput ? workerInput.value : 0) || 0; var wage = parseInt(wageInput ? wageInput.value : 0) || 0; var duration = parseInt(durationInput ? durationInput.value : 0) || 0;
      if (workers > 0 && wage > 0 && duration > 0) { var total = workers * wage * duration; var fee = Math.round(total * (feePercent / 100)); Yawmia.$id('costTotal').textContent = total.toLocaleString('ar-EG') + ' جنيه'; Yawmia.$id('costFee').textContent = fee.toLocaleString('ar-EG') + ' جنيه'; Yawmia.show('costPreview'); }
      else { Yawmia.hide('costPreview'); }
    }
    if (workerInput) workerInput.addEventListener('input', updateCost); if (wageInput) wageInput.addEventListener('input', updateCost); if (durationInput) durationInput.addEventListener('input', updateCost);

    var urgencyRadios = document.querySelectorAll('input[name="jobUrgency"]');
    urgencyRadios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        var startDateGroup = Yawmia.$id('jobStartDate') ? Yawmia.$id('jobStartDate').closest('.form-group') : null; var dur = Yawmia.$id('jobDuration');
        if (radio.value === 'immediate') { if (startDateGroup) startDateGroup.style.display = 'none'; if (dur) dur.value = '1'; } else { if (startDateGroup) startDateGroup.style.display = ''; }
      });
    });

    var btnCreateJob = Yawmia.$id('btnCreateJob');
    if (btnCreateJob) {
      btnCreateJob.addEventListener('click', async function () {
        Yawmia.clearMessage('createJobError');
        var urgencyEl = document.querySelector('input[name="jobUrgency"]:checked'); var urgency = urgencyEl ? urgencyEl.value : 'normal';
        var body = { title: (Yawmia.$id('jobTitle') || {}).value || '', category: (Yawmia.$id('jobCategory') || {}).value || '', governorate: (Yawmia.$id('jobGovernorate') || {}).value || '', workersNeeded: parseInt((Yawmia.$id('jobWorkers') || {}).value) || 0, dailyWage: parseInt((Yawmia.$id('jobWage') || {}).value) || 0, startDate: (Yawmia.$id('jobStartDate') || {}).value || '', durationDays: parseInt((Yawmia.$id('jobDuration') || {}).value) || 0, description: (Yawmia.$id('jobDescription') || {}).value || '', urgency: urgency };
        Yawmia.setLoading(btnCreateJob, true);
        try {
          var res = await Yawmia.api('POST', '/api/jobs', body);
          if (res.data.ok) { Yawmia.showMessage('createJobError', 'تم نشر الفرصة بنجاح!', 'success'); Yawmia.$id('jobTitle').value = ''; Yawmia.$id('jobCategory').value = ''; Yawmia.$id('jobGovernorate').value = ''; Yawmia.$id('jobWorkers').value = ''; Yawmia.$id('jobWage').value = ''; Yawmia.$id('jobStartDate').value = ''; Yawmia.$id('jobDuration').value = ''; Yawmia.$id('jobDescription').value = ''; Yawmia.hide('costPreview'); loadJobs(); }
          else { Yawmia.showMessage('createJobError', res.data.error || 'خطأ في نشر الفرصة', 'error'); }
        } catch (err) { Yawmia.showMessage('createJobError', 'خطأ في الاتصال بالسيرفر', 'error'); }
        finally { Yawmia.setLoading(btnCreateJob, false); }
      });
    }
  }

  // ── Recent Jobs (Worker) ──────────────────────────────────
  async function loadRecentJobs() {
    var section = Yawmia.$id('recentJobsSection'); if (!section) return;
    try {
      var res = await Yawmia.api('GET', '/api/applications/mine');
      if (!res.data.ok || !res.data.applications) return;
      var accepted = res.data.applications.filter(function (a) { return a.status === 'accepted' && a.job; }).slice(0, 5);
      if (accepted.length === 0) return;
      Yawmia.show('recentJobsSection');
      var listEl = Yawmia.$id('recentJobsList'); if (!listEl) return; listEl.innerHTML = '';
      var statusLabels = { open: 'متاحة', filled: 'مكتملة العدد', in_progress: 'جاري التنفيذ', completed: 'مكتملة ✓', expired: 'منتهية', cancelled: 'ملغية' };
      accepted.forEach(function (app) {
        var j = app.job; var card = document.createElement('div'); card.className = 'app-card';
        card.innerHTML = '<div class="app-card__info"><div class="app-card__title"><a href="/job.html?id=' + YawmiaUtils.escapeHtml(j.id) + '" class="worker-link">' + YawmiaUtils.escapeHtml(j.title) + '</a></div><div class="app-card__meta">' + (j.dailyWage || 0) + ' جنيه/يوم • 📍 ' + YawmiaUtils.escapeHtml(j.governorate || '') + '</div></div><span class="badge badge--status badge--' + (j.status || 'open') + '">' + YawmiaUtils.escapeHtml(statusLabels[j.status] || j.status || '') + '</span>';
        listEl.appendChild(card);
      });
    } catch (err) {}
  }

  // ── Smart Rating Prompt ───────────────────────────────────
  async function checkPendingRatings() {
    try {
      var res = await Yawmia.api('GET', '/api/ratings/pending');
      if (!res.data.ok || !res.data.pending || res.data.pending.length === 0) return;
      var first = res.data.pending[0];
      setTimeout(function () { YawmiaRatingModal.showRating({ id: first.jobId, title: first.jobTitle, employerId: first.targetRole === 'employer' ? first.targetUserId : null }, first.targetUserId, user, loadJobs); }, 2000);
    } catch (err) {}
  }

})();
