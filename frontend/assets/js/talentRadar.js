// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/talentRadar.js — Employer Talent Radar UI
// ═══════════════════════════════════════════════════════════════
// IIFE module — exposes window.YawmiaTalentRadar
// Renders worker cards grid + filter panel + auto-refresh.
// ═══════════════════════════════════════════════════════════════

var YawmiaTalentRadar = (function () {
  'use strict';

  var mountEl = null;
  var refreshTimer = null;
  var currentFilters = {
    categories: [],
    radiusKm: 30,
    minWage: null,
    maxWage: null,
    governorate: '',
    sortBy: 'composite',
  };

  function escapeHtml(str) {
    return (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(str) : (str || '');
  }

  function getIcon(name, size) {
    if (typeof YawmiaIcons !== 'undefined') {
      return YawmiaIcons.get(name, { size: size || 16 });
    }
    return '';
  }

  /**
   * Initialize Talent Radar in the given mount element.
   * @param {string} mountId — DOM element ID
   */
  function init(mountId) {
    mountEl = document.getElementById(mountId);
    if (!mountEl) return;

    // Use employer's stored location as default
    var user = Yawmia.getUser();
    if (user && user.governorate) {
      currentFilters.governorate = user.governorate;
    }

    renderShell();
    populateFilterDropdowns();
    loadWorkers();

    // Auto-refresh every 30 seconds
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadWorkers, 30000);

    window.dispatchEvent(new CustomEvent('yawmia:talent-radar-loaded'));
  }

  /**
   * Stop auto-refresh and clean up.
   */
  function destroy() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    if (mountEl) {
      mountEl.innerHTML = '';
    }
  }

  /**
   * Render the static shell (filter panel + workers container).
   */
  function renderShell() {
    var html =
      '<section class="card talent-radar">' +
        '<div class="talent-radar__header">' +
          '<h2 class="card__title">👀 اكتشف الصنايعية المتاحين</h2>' +
          '<button class="btn btn--ghost btn--sm" id="trRefreshBtn" aria-label="تحديث">' + getIcon('refresh', 16) + ' تحديث</button>' +
        '</div>' +
        '<p class="card__desc">شوف الصنايعية المتاحين دلوقتي في منطقتك. اضغط على أي بطاقة عشان تشوف التفاصيل.</p>' +

        '<div class="radar-filter-panel" id="trFilters">' +
          '<div class="radar-filter__row">' +
            '<label class="form-label">المحافظة</label>' +
            '<select class="form-input form-input--sm" id="trGov"><option value="">كل المحافظات</option></select>' +
          '</div>' +

          '<div class="radar-filter__row">' +
            '<label class="form-label">التخصصات (اختار واحد أو أكثر)</label>' +
            '<div class="radar-filter__categories" id="trCategories"></div>' +
          '</div>' +

          '<div class="radar-filter__row radar-filter__row--inline">' +
            '<div class="form-group" style="flex:1;">' +
              '<label class="form-label" for="trRadius">النطاق (كم): <span id="trRadiusValue">30</span></label>' +
              '<input type="range" id="trRadius" min="5" max="100" step="5" value="30" class="radar-filter__slider">' +
            '</div>' +
          '</div>' +

          '<div class="radar-filter__row radar-filter__row--inline">' +
            '<div class="form-group" style="flex:1;">' +
              '<label class="form-label" for="trMinWage">الأجر من</label>' +
              '<input type="number" id="trMinWage" class="form-input form-input--sm" placeholder="150" min="150" max="1000">' +
            '</div>' +
            '<div class="form-group" style="flex:1;">' +
              '<label class="form-label" for="trMaxWage">إلى</label>' +
              '<input type="number" id="trMaxWage" class="form-input form-input--sm" placeholder="1000" min="150" max="1000">' +
            '</div>' +
          '</div>' +

          '<button class="btn btn--primary btn--sm" id="trApplyFilters">تطبيق الفلاتر</button>' +
        '</div>' +

        '<div class="talent-radar__results" id="trResults" aria-live="polite">' +
          '<p class="empty-state">جاري التحميل...</p>' +
        '</div>' +
      '</section>';

    mountEl.innerHTML = html;

    // Wire events
    var applyBtn = document.getElementById('trApplyFilters');
    if (applyBtn) applyBtn.addEventListener('click', applyFiltersFromForm);

    var refreshBtn = document.getElementById('trRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { loadWorkers(); });

    var radiusSlider = document.getElementById('trRadius');
    var radiusValue = document.getElementById('trRadiusValue');
    if (radiusSlider && radiusValue) {
      radiusSlider.addEventListener('input', function () {
        radiusValue.textContent = radiusSlider.value;
      });
    }
  }

  /**
   * Populate governorate + categories from config.
   */
  function populateFilterDropdowns() {
    Yawmia.loadConfig().then(function (cfg) {
      if (!cfg) return;

      // Governorates
      var govSelect = document.getElementById('trGov');
      if (govSelect && cfg.REGIONS && cfg.REGIONS.governorates) {
        cfg.REGIONS.governorates.forEach(function (g) {
          var opt = document.createElement('option');
          opt.value = g.id;
          opt.textContent = g.label;
          if (currentFilters.governorate === g.id) opt.selected = true;
          govSelect.appendChild(opt);
        });
      }

      // Categories as pills
      var catContainer = document.getElementById('trCategories');
      if (catContainer && cfg.LABOR_CATEGORIES) {
        catContainer.innerHTML = '';
        cfg.LABOR_CATEGORIES.forEach(function (cat) {
          var label = document.createElement('label');
          label.className = 'radar-filter__category-pill';
          var input = document.createElement('input');
          input.type = 'checkbox';
          input.name = 'trCategory';
          input.value = cat.id;
          var span = document.createElement('span');
          span.textContent = cat.icon + ' ' + cat.label;
          label.appendChild(input);
          label.appendChild(span);
          catContainer.appendChild(label);
        });
      }
    }).catch(function () {});
  }

  /**
   * Read filters from form and reload.
   */
  function applyFiltersFromForm() {
    var govEl = document.getElementById('trGov');
    var radiusEl = document.getElementById('trRadius');
    var minWageEl = document.getElementById('trMinWage');
    var maxWageEl = document.getElementById('trMaxWage');

    currentFilters.governorate = govEl ? govEl.value : '';
    currentFilters.radiusKm = radiusEl ? parseInt(radiusEl.value, 10) : 30;

    var minVal = minWageEl ? minWageEl.value.trim() : '';
    var maxVal = maxWageEl ? maxWageEl.value.trim() : '';
    currentFilters.minWage = minVal ? parseInt(minVal, 10) : null;
    currentFilters.maxWage = maxVal ? parseInt(maxVal, 10) : null;

    var checkedCats = document.querySelectorAll('input[name="trCategory"]:checked');
    currentFilters.categories = Array.from(checkedCats).map(function (el) { return el.value; });

    loadWorkers();
  }

  /**
   * Load workers from API.
   */
  async function loadWorkers() {
    var resultsEl = document.getElementById('trResults');
    if (!resultsEl) return;

    // Show skeleton on first load only
    if (!resultsEl.querySelector('.worker-card')) {
      resultsEl.innerHTML = renderSkeleton(4);
    }

    var query = '?';
    if (currentFilters.governorate) query += 'governorate=' + encodeURIComponent(currentFilters.governorate) + '&';
    if (currentFilters.categories.length > 0) {
      query += 'categories=' + encodeURIComponent(currentFilters.categories.join(',')) + '&';
    }
    if (currentFilters.radiusKm) query += 'radius=' + encodeURIComponent(currentFilters.radiusKm) + '&';
    if (currentFilters.minWage !== null) query += 'minWage=' + encodeURIComponent(currentFilters.minWage) + '&';
    if (currentFilters.maxWage !== null) query += 'maxWage=' + encodeURIComponent(currentFilters.maxWage) + '&';
    if (currentFilters.sortBy) query += 'sortBy=' + encodeURIComponent(currentFilters.sortBy) + '&';
    query += 'limit=20';

    try {
      var res = await Yawmia.api('GET', '/api/workers/discover' + query);
      if (!res || !res.data || !res.data.ok) {
        renderError(res && res.data && res.data.error);
        return;
      }
      renderWorkers(res.data.workers || [], res.data.total || 0);
    } catch (err) {
      renderError('خطأ في الاتصال');
    }
  }

  /**
   * Render skeleton cards.
   */
  function renderSkeleton(count) {
    var html = '<div class="worker-cards-grid">';
    for (var i = 0; i < count; i++) {
      html +=
        '<div class="skeleton-card worker-card-skeleton">' +
          '<div class="skeleton skeleton-circle" style="width:48px;height:48px;"></div>' +
          '<div class="skeleton skeleton-text--lg" style="width:60%;margin-block-start:0.75rem;"></div>' +
          '<div class="skeleton skeleton-text" style="width:40%;"></div>' +
          '<div class="skeleton skeleton-text" style="width:80%;"></div>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  /**
   * Render workers list.
   */
  function renderWorkers(workers, total) {
    var resultsEl = document.getElementById('trResults');
    if (!resultsEl) return;

    if (!workers || workers.length === 0) {
      resultsEl.innerHTML =
        '<div class="empty-state radar-empty-state">' +
          '<span class="empty-state__icon">🔍</span>' +
          '<p class="empty-state__text">مفيش صنايعية متاحين دلوقتي في منطقتك</p>' +
          '<p class="empty-state__hint">جرّب توسّع النطاق أو غيّر الفلاتر</p>' +
        '</div>';
      return;
    }

    var html = '<div class="talent-radar__count">عرض ' + workers.length + ' من ' + total + '</div>';
    html += '<div class="worker-cards-grid">';
    for (var i = 0; i < workers.length; i++) {
      html += buildWorkerCardHtml(workers[i]);
    }
    html += '</div>';

    resultsEl.innerHTML = html;

    // Wire quick offer buttons
    resultsEl.querySelectorAll('.btn-quick-offer').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var workerId = btn.getAttribute('data-worker-id');
        handleQuickOfferClick(workerId, btn);
      });
    });

    // Wire view profile buttons
    resultsEl.querySelectorAll('.btn-view-card').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var workerId = btn.getAttribute('data-worker-id');
        showWorkerCardModal(workerId);
      });
    });
  }

  /**
   * Build single worker card HTML.
   */
  function buildWorkerCardHtml(w) {
    var onlineBadge = w.isOnline
      ? '<span class="worker-card__online-pulse" title="متصل دلوقتي" aria-label="متصل"></span>'
      : '';

    var verifiedBadge = w.verificationStatus === 'verified'
      ? '<span class="verification-badge verification-badge--verified" style="font-size:0.7rem;">✓ محقق</span>'
      : '';

    var adBadge = w.hasActiveAd
      ? '<span class="worker-card__ad-badge">📢 متاح الآن</span>'
      : '';

    var ratingHtml = '';
    if (w.rating && w.rating.count > 0) {
      ratingHtml = '⭐ ' + w.rating.avg + ' (' + w.rating.count + ')';
    } else {
      ratingHtml = '<span style="color:var(--color-text-muted);">بدون تقييم</span>';
    }

    var distanceHtml = (typeof w.distanceKm === 'number')
      ? '<span class="worker-card__distance">📍 ' + w.distanceKm + ' كم</span>'
      : (w.governorate ? '<span class="worker-card__distance">📍 ' + escapeHtml(w.governorate) + '</span>' : '');

    var categoriesHtml = '';
    if (w.categories && w.categories.length > 0) {
      categoriesHtml = '<div class="worker-card__categories">';
      w.categories.slice(0, 3).forEach(function (cat) {
        categoriesHtml += '<span class="worker-card__cat-pill">' + escapeHtml(cat) + '</span>';
      });
      categoriesHtml += '</div>';
    }

    var wageHtml = '';
    if (w.adSummary && w.adSummary.minDailyWage) {
      wageHtml = '<div class="worker-card__wage">💰 ' + w.adSummary.minDailyWage + '–' + w.adSummary.maxDailyWage + ' جنيه/يوم</div>';
    }

    var scoreHtml = '';
    if (typeof w._score === 'number') {
      var scorePercent = Math.round(w._score * 100);
      scoreHtml = '<div class="worker-card__score-badge" title="درجة المطابقة">' + scorePercent + '</div>';
    }

    return '' +
      '<div class="worker-card" data-worker-id="' + escapeHtml(w.id) + '">' +
        '<div class="worker-card__header">' +
          '<div class="worker-card__avatar">' +
            '<span class="worker-card__avatar-icon">👷</span>' +
            onlineBadge +
          '</div>' +
          '<div class="worker-card__name-block">' +
            '<div class="worker-card__name">' + escapeHtml(w.displayName || 'مستخدم') + '</div>' +
            '<div class="worker-card__meta">' + verifiedBadge + ' ' + adBadge + '</div>' +
          '</div>' +
          scoreHtml +
        '</div>' +

        categoriesHtml +

        '<div class="worker-card__info-row">' +
          distanceHtml +
          '<span class="worker-card__rating">' + ratingHtml + '</span>' +
        '</div>' +

        wageHtml +

        '<div class="worker-card__actions">' +
          '<button class="btn btn--primary btn--sm btn-quick-offer" data-worker-id="' + escapeHtml(w.id) + '" aria-label="إرسال عرض لـ ' + escapeHtml(w.displayName) + '">📩 عرض سريع</button>' +
          '<button class="btn btn--ghost btn--sm btn-view-card" data-worker-id="' + escapeHtml(w.id) + '" aria-label="عرض تفاصيل ' + escapeHtml(w.displayName) + '">عرض</button>' +
        '</div>' +
      '</div>';
  }

  /**
   * Handle quick offer click — Phase 41 stub.
   */
  function handleQuickOfferClick(workerId, btn) {
    if (typeof YawmiaToast !== 'undefined') {
      YawmiaToast.info('إرسال العروض المباشرة هتكون متاحة في التحديث القادم 🚀');
    }
  }

  /**
   * Show worker card details in modal.
   */
  async function showWorkerCardModal(workerId) {
    if (!workerId) return;
    try {
      var res = await Yawmia.api('GET', '/api/workers/' + workerId + '/card');
      if (!res || !res.data || !res.data.ok || !res.data.card) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('تعذّر جلب البيانات');
        return;
      }
      var card = res.data.card;

      var existing = document.querySelector('.ym-modal-overlay.worker-card-overlay');
      if (existing) existing.remove();

      var overlay = document.createElement('div');
      overlay.className = 'ym-modal-overlay worker-card-overlay';

      var ratingLine = (card.rating && card.rating.count > 0)
        ? '⭐ ' + card.rating.avg + ' (' + card.rating.count + ' تقييم)'
        : 'بدون تقييم';

      var trustLine = (typeof card.trustScore === 'number')
        ? 'ثقة: ' + Math.round(card.trustScore * 100) + '/100'
        : 'ثقة غير متاحة';

      var adLine = '';
      if (card.adSummary) {
        adLine =
          '<div class="worker-card-modal__ad">' +
            '<strong>📢 إعلان متاح:</strong><br>' +
            '💰 ' + card.adSummary.minDailyWage + '–' + card.adSummary.maxDailyWage + ' جنيه/يوم<br>' +
            '📅 من ' + new Date(card.adSummary.availableFrom).toLocaleString('ar-EG') + '<br>' +
            '📅 إلى ' + new Date(card.adSummary.availableUntil).toLocaleString('ar-EG') + '<br>' +
            '📍 نطاق ' + card.adSummary.radiusKm + ' كم' +
          '</div>';
      }

      overlay.innerHTML =
        '<div class="ym-modal-card worker-card-modal">' +
          '<h3 class="ym-modal-title">' + escapeHtml(card.displayName) + '</h3>' +
          '<div class="ym-modal-message">' +
            (card.verificationStatus === 'verified' ? '<div>✓ هوية محققة</div>' : '') +
            '<div>📍 ' + escapeHtml(card.governorate || '') + '</div>' +
            '<div>' + escapeHtml(ratingLine) + '</div>' +
            '<div>' + escapeHtml(trustLine) + '</div>' +
            (card.categories && card.categories.length > 0
              ? '<div>التخصصات: ' + escapeHtml(card.categories.join('، ')) + '</div>'
              : '') +
            adLine +
            '<p style="margin-block-start:1rem;font-size:0.8rem;color:var(--color-text-muted);">' +
            'الاسم الكامل ورقم الموبايل هيظهروا بعد قبول العرض.' +
            '</p>' +
          '</div>' +
          '<div class="ym-modal-actions">' +
            '<button class="btn btn--primary btn--sm" id="modalQuickOffer">📩 عرض سريع</button>' +
            '<button class="btn btn--ghost btn--sm" id="modalCloseBtn">إغلاق</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);

      var closeBtn = document.getElementById('modalCloseBtn');
      if (closeBtn) closeBtn.addEventListener('click', function () { overlay.remove(); });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.remove();
      });

      var modalOfferBtn = document.getElementById('modalQuickOffer');
      if (modalOfferBtn) {
        modalOfferBtn.addEventListener('click', function () {
          handleQuickOfferClick(workerId);
        });
      }
    } catch (err) {
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('خطأ في الاتصال');
    }
  }

  /**
   * Render error state.
   */
  function renderError(msg) {
    var resultsEl = document.getElementById('trResults');
    if (!resultsEl) return;
    resultsEl.innerHTML =
      '<div class="empty-state radar-empty-state">' +
        '<span class="empty-state__icon">⚠️</span>' +
        '<p class="empty-state__text">' + escapeHtml(msg || 'خطأ في تحميل العمال') + '</p>' +
        '<button class="btn btn--primary btn--sm" id="trRetryBtn" style="margin-top:0.75rem;">🔄 حاول مرة تانية</button>' +
      '</div>';
    var retryBtn = document.getElementById('trRetryBtn');
    if (retryBtn) retryBtn.addEventListener('click', function () { loadWorkers(); });
  }

  return {
    init: init,
    destroy: destroy,
    refresh: loadWorkers,
  };
})();
