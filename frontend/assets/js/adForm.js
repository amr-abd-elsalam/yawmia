// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/adForm.js — Worker Availability Ad Form
// ═══════════════════════════════════════════════════════════════
// IIFE module — exposes window.YawmiaAdForm
// Renders ad creation form (4 sections) OR active ad summary.
// ═══════════════════════════════════════════════════════════════

var YawmiaAdForm = (function () {
  'use strict';

  var mountEl = null;

  function escapeHtml(str) {
    return (typeof YawmiaUtils !== 'undefined') ? YawmiaUtils.escapeHtml(str) : (str || '');
  }

  /**
   * Initialize Ad Form in the given mount element.
   */
  function init(mountId) {
    mountEl = document.getElementById(mountId);
    if (!mountEl) return;
    loadAndRender();
  }

  /**
   * Load worker's ads and render either active ad summary or creation form.
   */
  async function loadAndRender() {
    if (!mountEl) return;

    mountEl.innerHTML = '<section class="card"><h2 class="card__title">📢 إعلان الإتاحة</h2><p class="empty-state">جاري التحميل...</p></section>';

    try {
      var res = await Yawmia.api('GET', '/api/availability-ads/mine');
      if (!res || !res.data || !res.data.ok) {
        renderCreateForm();
        return;
      }
      var ads = res.data.ads || [];
      var activeAd = ads.find(function (a) { return a.status === 'active'; });
      if (activeAd) {
        renderActiveAd(activeAd);
      } else {
        renderCreateForm();
      }
    } catch (err) {
      renderCreateForm();
    }
  }

  /**
   * Render the active ad summary + withdraw button.
   */
  function renderActiveAd(ad) {
    var fromDt = new Date(ad.availableFrom).toLocaleString('ar-EG');
    var untilDt = new Date(ad.availableUntil).toLocaleString('ar-EG');

    var html =
      '<section class="card ad-form ad-form--active">' +
        '<h2 class="card__title">📢 إعلانك النشط</h2>' +
        '<p class="card__desc">إعلانك ظاهر لأصحاب العمل في منطقتك. يقدر يتسحب في أي وقت.</p>' +

        '<div class="ad-form__active-summary">' +
          '<div class="ad-form__summary-row">' +
            '<strong>التخصصات:</strong> ' + escapeHtml(ad.categories.join('، ')) +
          '</div>' +
          '<div class="ad-form__summary-row">' +
            '<strong>المحافظة:</strong> ' + escapeHtml(ad.governorate) +
          '</div>' +
          '<div class="ad-form__summary-row">' +
            '<strong>النطاق:</strong> ' + ad.radiusKm + ' كم' +
          '</div>' +
          '<div class="ad-form__summary-row">' +
            '<strong>الأجر:</strong> ' + ad.minDailyWage + '–' + ad.maxDailyWage + ' جنيه/يوم' +
          '</div>' +
          '<div class="ad-form__summary-row">' +
            '<strong>متاح من:</strong> ' + escapeHtml(fromDt) +
          '</div>' +
          '<div class="ad-form__summary-row">' +
            '<strong>إلى:</strong> ' + escapeHtml(untilDt) +
          '</div>' +
          (ad.notes ? '<div class="ad-form__summary-row"><strong>ملاحظات:</strong> ' + escapeHtml(ad.notes) + '</div>' : '') +
        '</div>' +

        '<div class="ad-form__active-stats">' +
          '<span class="ad-form__stat">👁 ' + (ad.viewCount || 0) + ' مشاهدة</span>' +
          '<span class="ad-form__stat">📩 ' + (ad.offerCount || 0) + ' عرض</span>' +
        '</div>' +

        '<button class="btn btn--ghost btn--sm" id="adWithdrawBtn" style="color:var(--color-error);border-color:var(--color-error);">سحب الإعلان</button>' +
        '<div class="message" id="adFormMsg"></div>' +
      '</section>';

    mountEl.innerHTML = html;

    var withdrawBtn = document.getElementById('adWithdrawBtn');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', function () { handleWithdraw(ad.id); });
    }
  }

  /**
   * Render the ad creation form (4 sections).
   */
  function renderCreateForm() {
    var html =
      '<section class="card ad-form">' +
        '<h2 class="card__title">📢 انشر إعلان إتاحة</h2>' +
        '<p class="card__desc">قول أنا متاح للشغل! أصحاب العمل في منطقتك هيلاقوك ويبعتولك عروض مباشرة.</p>' +

        // Section 1 — Categories
        '<div class="ad-form__section">' +
          '<h3 class="ad-form__step">1. التخصصات (1-3 تخصصات)</h3>' +
          '<div class="checkbox-grid" id="adCategoriesGrid"></div>' +
        '</div>' +

        // Section 2 — Time window
        '<div class="ad-form__section">' +
          '<h3 class="ad-form__step">2. متى تكون متاح؟</h3>' +
          '<div class="ad-form__time-presets">' +
            '<button type="button" class="btn btn--ghost btn--sm ad-time-preset" data-preset="today_morning">اليوم 8 ص - 5 م</button>' +
            '<button type="button" class="btn btn--ghost btn--sm ad-time-preset" data-preset="tomorrow_morning">بكرة 8 ص - 5 م</button>' +
            '<button type="button" class="btn btn--ghost btn--sm ad-time-preset" data-preset="custom">مخصص</button>' +
          '</div>' +
          '<div class="form-row" style="margin-block-start:0.75rem;">' +
            '<div class="form-group">' +
              '<label class="form-label" for="adFromDt">من</label>' +
              '<input type="datetime-local" id="adFromDt" class="form-input form-input--sm" dir="ltr">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="adUntilDt">إلى</label>' +
              '<input type="datetime-local" id="adUntilDt" class="form-input form-input--sm" dir="ltr">' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section 3 — Wage range
        '<div class="ad-form__section">' +
          '<h3 class="ad-form__step">3. مدى الأجر اليومي</h3>' +
          '<div class="form-row">' +
            '<div class="form-group">' +
              '<label class="form-label" for="adMinWage">الأقل (جنيه)</label>' +
              '<input type="number" id="adMinWage" class="form-input form-input--sm" min="150" max="1000" placeholder="250">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="adMaxWage">الأقصى (جنيه)</label>' +
              '<input type="number" id="adMaxWage" class="form-input form-input--sm" min="150" max="1000" placeholder="350">' +
            '</div>' +
          '</div>' +
        '</div>' +

        // Section 4 — Geo radius
        '<div class="ad-form__section">' +
          '<h3 class="ad-form__step">4. نطاق التنقل</h3>' +
          '<div class="form-group">' +
            '<label class="form-label" for="adGov">المحافظة</label>' +
            '<select id="adGov" class="form-input form-input--sm"><option value="">اختار المحافظة</option></select>' +
          '</div>' +
          '<div class="location-group">' +
            '<div class="form-group">' +
              '<label class="form-label" for="adLat">خط العرض</label>' +
              '<input type="number" step="any" id="adLat" class="form-input form-input--sm" placeholder="30.04">' +
            '</div>' +
            '<div class="form-group">' +
              '<label class="form-label" for="adLng">خط الطول</label>' +
              '<input type="number" step="any" id="adLng" class="form-input form-input--sm" placeholder="31.23">' +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn-detect-location" id="adDetectLoc">📍 استخدم موقعي الحالي</button>' +
          '<div class="form-group" style="margin-block-start:0.75rem;">' +
            '<label class="form-label" for="adRadius">النطاق (كم): <span id="adRadiusValue">20</span></label>' +
            '<input type="range" id="adRadius" min="1" max="50" step="1" value="20">' +
          '</div>' +
        '</div>' +

        // Optional notes
        '<div class="ad-form__section">' +
          '<div class="form-group">' +
            '<label class="form-label" for="adNotes">ملاحظات (اختياري)</label>' +
            '<textarea id="adNotes" class="form-input form-textarea" rows="2" maxlength="200" placeholder="مثال: عندي عربية، خبرة 5 سنين..."></textarea>' +
          '</div>' +
        '</div>' +

        '<button class="btn btn--primary btn--full" id="adSubmitBtn">انشر الإعلان</button>' +
        '<div class="message" id="adFormMsg"></div>' +
      '</section>';

    mountEl.innerHTML = html;

    populateFormDropdowns();
    wireFormEvents();
    prefillFromUser();
  }

  /**
   * Populate categories grid + governorates dropdown.
   */
  function populateFormDropdowns() {
    Yawmia.populateCategoriesCheckboxes('adCategoriesGrid');
    Yawmia.populateGovernorates('adGov');
  }

  /**
   * Pre-fill governorate + lat/lng from user profile.
   */
  function prefillFromUser() {
    var user = Yawmia.getUser();
    if (!user) return;
    var govEl = document.getElementById('adGov');
    if (govEl && user.governorate) {
      // Wait for options to populate (populateGovernorates is async)
      setTimeout(function () {
        govEl.value = user.governorate;
      }, 100);
    }
    var latEl = document.getElementById('adLat');
    var lngEl = document.getElementById('adLng');
    if (latEl && typeof user.lat === 'number') latEl.value = user.lat;
    if (lngEl && typeof user.lng === 'number') lngEl.value = user.lng;
  }

  /**
   * Wire form interaction handlers.
   */
  function wireFormEvents() {
    // Time presets
    document.querySelectorAll('.ad-time-preset').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyTimePreset(btn.getAttribute('data-preset'));
      });
    });

    // Radius slider
    var radiusEl = document.getElementById('adRadius');
    var radiusValue = document.getElementById('adRadiusValue');
    if (radiusEl && radiusValue) {
      radiusEl.addEventListener('input', function () {
        radiusValue.textContent = radiusEl.value;
      });
    }

    // Detect location
    var detectBtn = document.getElementById('adDetectLoc');
    if (detectBtn) {
      detectBtn.addEventListener('click', detectLocation);
    }

    // Submit
    var submitBtn = document.getElementById('adSubmitBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleSubmit);
    }
  }

  /**
   * Apply a time preset to the datetime inputs.
   */
  function applyTimePreset(preset) {
    var fromEl = document.getElementById('adFromDt');
    var untilEl = document.getElementById('adUntilDt');
    if (!fromEl || !untilEl) return;

    var now = new Date();
    var from, until;

    if (preset === 'today_morning') {
      // Today 8 AM - 5 PM (Egypt local)
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0, 0);
      until = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 17, 0, 0);
      // If "today 8 AM" already passed, switch to tomorrow
      if (from.getTime() <= now.getTime()) {
        from.setDate(from.getDate() + 1);
        until.setDate(until.getDate() + 1);
      }
    } else if (preset === 'tomorrow_morning') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0);
      until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 17, 0, 0);
    } else {
      // custom — leave fields for user
      return;
    }

    fromEl.value = formatLocalDateTime(from);
    untilEl.value = formatLocalDateTime(until);
  }

  /**
   * Format Date as YYYY-MM-DDTHH:MM (local) for datetime-local input.
   */
  function formatLocalDateTime(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var mn = String(d.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + 'T' + h + ':' + mn;
  }

  /**
   * Use Geolocation API.
   */
  function detectLocation() {
    if (!navigator.geolocation) {
      if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    var btn = document.getElementById('adDetectLoc');
    if (btn) {
      btn.textContent = '⏳ جاري تحديد الموقع...';
      btn.disabled = true;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var latEl = document.getElementById('adLat');
        var lngEl = document.getElementById('adLng');
        if (latEl) latEl.value = pos.coords.latitude.toFixed(6);
        if (lngEl) lngEl.value = pos.coords.longitude.toFixed(6);
        if (btn) {
          btn.textContent = '📍 تم تحديد الموقع ✓';
          btn.disabled = false;
        }
      },
      function (err) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.error('تعذّر تحديد الموقع: ' + (err.message || ''));
        if (btn) {
          btn.textContent = '📍 استخدم موقعي الحالي';
          btn.disabled = false;
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /**
   * Submit handler.
   */
  async function handleSubmit() {
    Yawmia.clearMessage('adFormMsg');

    var checkedCats = document.querySelectorAll('#adCategoriesGrid input[name="categories"]:checked');
    var categories = Array.from(checkedCats).map(function (el) { return el.value; });
    if (categories.length === 0) {
      return Yawmia.showMessage('adFormMsg', 'اختار تخصص واحد على الأقل', 'error');
    }
    if (categories.length > 3) {
      return Yawmia.showMessage('adFormMsg', 'أقصى 3 تخصصات', 'error');
    }

    var govEl = document.getElementById('adGov');
    var governorate = govEl ? govEl.value : '';
    if (!governorate) {
      return Yawmia.showMessage('adFormMsg', 'اختار المحافظة', 'error');
    }

    var latEl = document.getElementById('adLat');
    var lngEl = document.getElementById('adLng');
    var lat = latEl && latEl.value ? parseFloat(latEl.value) : NaN;
    var lng = lngEl && lngEl.value ? parseFloat(lngEl.value) : NaN;
    if (isNaN(lat) || isNaN(lng)) {
      return Yawmia.showMessage('adFormMsg', 'حدّد موقعك على الخريطة (lat / lng)', 'error');
    }

    var radiusEl = document.getElementById('adRadius');
    var radiusKm = radiusEl ? parseInt(radiusEl.value, 10) : 20;

    var minWageEl = document.getElementById('adMinWage');
    var maxWageEl = document.getElementById('adMaxWage');
    var minDailyWage = minWageEl && minWageEl.value ? parseInt(minWageEl.value, 10) : NaN;
    var maxDailyWage = maxWageEl && maxWageEl.value ? parseInt(maxWageEl.value, 10) : NaN;
    if (isNaN(minDailyWage) || isNaN(maxDailyWage)) {
      return Yawmia.showMessage('adFormMsg', 'حدّد مدى الأجر', 'error');
    }
    if (minDailyWage > maxDailyWage) {
      return Yawmia.showMessage('adFormMsg', 'الأجر الأدنى لازم يكون أقل من الأقصى', 'error');
    }

    var fromEl = document.getElementById('adFromDt');
    var untilEl = document.getElementById('adUntilDt');
    if (!fromEl || !fromEl.value || !untilEl || !untilEl.value) {
      return Yawmia.showMessage('adFormMsg', 'حدّد وقت البدء والانتهاء', 'error');
    }
    var availableFrom = new Date(fromEl.value).toISOString();
    var availableUntil = new Date(untilEl.value).toISOString();

    var notesEl = document.getElementById('adNotes');
    var notes = notesEl && notesEl.value ? notesEl.value.trim() : '';

    var body = {
      categories: categories,
      governorate: governorate,
      lat: lat,
      lng: lng,
      radiusKm: radiusKm,
      minDailyWage: minDailyWage,
      maxDailyWage: maxDailyWage,
      availableFrom: availableFrom,
      availableUntil: availableUntil,
    };
    if (notes) body.notes = notes;

    var submitBtn = document.getElementById('adSubmitBtn');
    Yawmia.setLoading(submitBtn, true);

    try {
      var res = await Yawmia.api('POST', '/api/availability-ads', body);
      if (res.data && res.data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم نشر الإعلان ✓');
        loadAndRender();
      } else {
        Yawmia.showMessage('adFormMsg', (res.data && res.data.error) || 'خطأ في نشر الإعلان', 'error');
      }
    } catch (err) {
      Yawmia.showMessage('adFormMsg', 'خطأ في الاتصال', 'error');
    } finally {
      Yawmia.setLoading(submitBtn, false);
    }
  }

  /**
   * Withdraw active ad.
   */
  async function handleWithdraw(adId) {
    var confirmed = await YawmiaModal.confirm({
      title: 'سحب الإعلان',
      message: 'متأكد إنك عايز تسحب الإعلان؟ ما هتظهرش لأصحاب العمل بعد كده.',
      confirmText: 'سحب',
      cancelText: 'رجوع',
      danger: true,
    });
    if (!confirmed) return;

    var btn = document.getElementById('adWithdrawBtn');
    Yawmia.setLoading(btn, true);

    try {
      var res = await Yawmia.api('DELETE', '/api/availability-ads/' + adId);
      if (res.data && res.data.ok) {
        if (typeof YawmiaToast !== 'undefined') YawmiaToast.success('تم سحب الإعلان');
        loadAndRender();
      } else {
        Yawmia.showMessage('adFormMsg', (res.data && res.data.error) || 'خطأ في السحب', 'error');
      }
    } catch (err) {
      Yawmia.showMessage('adFormMsg', 'خطأ في الاتصال', 'error');
    } finally {
      Yawmia.setLoading(btn, false);
    }
  }

  return {
    init: init,
    refresh: loadAndRender,
  };
})();
