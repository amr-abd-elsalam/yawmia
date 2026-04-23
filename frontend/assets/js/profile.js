// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/profile.js — Profile UI Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Auth check — redirect if not logged in
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

  // ── Logout ────────────────────────────────────────────────
  var btnLogout = Yawmia.$id('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      Yawmia.logout();
    });
  }

  // ── minRatingsToShow from config ──────────────────────────
  var minRatingsToShow = 3; // default fallback

  // ── Load Profile ──────────────────────────────────────────
  loadProfile();

  async function loadProfile() {
    try {
      // Load config for minRatingsToShow
      var cfg = await Yawmia.loadConfig();
      if (cfg && cfg.RATINGS && typeof cfg.RATINGS.minRatingsToShow === 'number') {
        minRatingsToShow = cfg.RATINGS.minRatingsToShow;
      }

      // Fetch fresh user data
      var res = await Yawmia.api('GET', '/api/auth/me');
      if (res.data.ok) {
        user = res.data.user;
        // Update stored user
        Yawmia.setAuth(Yawmia.getToken(), user);
        renderProfile(user);
        renderEditForm(user);
        renderNotificationPreferences(user);
        renderVerificationSection(user);

        // Availability toggle (worker only)
        if (user.role === 'worker') {
          renderAvailabilityToggle(user);
        }

        // Job alerts management (all roles)
        loadMyAlerts();

        // Role-specific sections
        if (user.role === 'worker') {
          Yawmia.show('myApplicationsSection');
          loadMyApplications();
          loadAttendanceHistory();
        } else if (user.role === 'employer') {
          Yawmia.show('myJobsSection');
          loadMyJobs();
        }

        // Load ratings
        loadRatings(user.id);
      }
    } catch (err) {
      // Ignore — will show cached data
    }
  }

  // ── Render Profile Card ───────────────────────────────────
  function renderProfile(u) {
    var avatarEl = Yawmia.$id('profileAvatar');
    var nameEl = Yawmia.$id('profileName');
    var phoneEl = Yawmia.$id('profilePhone');
    var govEl = Yawmia.$id('profileGov');
    var ratingSummaryEl = Yawmia.$id('profileRatingSummary');
    var categoriesEl = Yawmia.$id('profileCategories');

    if (avatarEl) avatarEl.textContent = u.role === 'worker' ? '👷' : '🏢';
    if (nameEl) nameEl.textContent = u.name || 'بدون اسم';
    if (phoneEl) phoneEl.textContent = u.phone;
    if (govEl) govEl.textContent = u.governorate ? '📍 ' + u.governorate : '';

    // Rating summary in profile header
    if (ratingSummaryEl) {
      var rating = u.rating || { avg: 0, count: 0 };
      if (rating.count >= minRatingsToShow) {
        ratingSummaryEl.innerHTML =
          '<div class="rating-summary-avg">' + rating.avg + '</div>' +
          '<div class="rating-summary-stars">' + starsDisplay(rating.avg) + '</div>' +
          '<div class="rating-summary-count">' + rating.count + ' تقييم</div>';
      } else if (rating.count > 0) {
        var needed = minRatingsToShow - rating.count;
        ratingSummaryEl.innerHTML =
          '<div class="rating-summary-msg">محتاج ' + needed + ' تقييمات كمان لعرض المتوسط</div>';
      } else {
        ratingSummaryEl.innerHTML =
          '<div class="rating-summary-msg">لا توجد تقييمات بعد</div>';
      }
    }

    // Categories (worker only)
    if (categoriesEl && u.categories && u.categories.length > 0) {
      Yawmia.show('profileCategories');
      categoriesEl.innerHTML = '';
      u.categories.forEach(function (catId) {
        var span = document.createElement('span');
        span.className = 'badge badge--worker';
        span.textContent = catId;
        categoriesEl.appendChild(span);
      });
    }
  }

  // ── Render Edit Form ──────────────────────────────────────
  async function renderEditForm(u) {
    var nameInput = Yawmia.$id('editName');
    var govSelect = Yawmia.$id('editGov');

    if (nameInput) nameInput.value = u.name || '';

    // Populate governorates
    await Yawmia.populateGovernorates('editGov');
    if (govSelect && u.governorate) govSelect.value = u.governorate;

    // Categories for workers
    if (u.role === 'worker') {
      Yawmia.show('editCategoriesGroup');
      await Yawmia.populateCategoriesCheckboxes('editCategoriesGrid');
      // Pre-check existing categories
      if (u.categories && u.categories.length > 0) {
        u.categories.forEach(function (catId) {
          var cb = document.querySelector('#editCategoriesGrid input[value="' + catId + '"]');
          if (cb) cb.checked = true;
        });
      }
    }

    // Location fields (lat/lng) — inject after governorate
    var editForm = govSelect ? govSelect.closest('.card') : null;
    if (editForm) {
      var existingLocGroup = editForm.querySelector('.location-group');
      if (!existingLocGroup) {
        var locGroup = document.createElement('div');
        locGroup.className = 'form-group';
        locGroup.innerHTML =
          '<label class="form-label">الموقع الجغرافي</label>' +
          '<div class="location-group">' +
            '<div class="form-group">' +
              '<input type="number" step="any" id="editLat" class="form-input form-input--sm" placeholder="خط العرض (مثال: 30.04)" value="' + (u.lat || '') + '">' +
            '</div>' +
            '<div class="form-group">' +
              '<input type="number" step="any" id="editLng" class="form-input form-input--sm" placeholder="خط الطول (مثال: 31.23)" value="' + (u.lng || '') + '">' +
            '</div>' +
          '</div>' +
          '<button type="button" class="btn-detect-location" id="btnDetectLocation">📍 استخدم موقعي الحالي</button>';

        // Insert before the save button or at end of form
        var btnUpdateEl = editForm.querySelector('#btnUpdateProfile');
        if (btnUpdateEl) {
          btnUpdateEl.parentNode.insertBefore(locGroup, btnUpdateEl);
        } else {
          editForm.appendChild(locGroup);
        }

        // Detect location button handler
        var btnDetect = editForm.querySelector('#btnDetectLocation');
        if (btnDetect) {
          btnDetect.addEventListener('click', function () {
            if (!navigator.geolocation) {
              YawmiaToast.error('المتصفح لا يدعم تحديد الموقع');
              return;
            }
            btnDetect.textContent = '⏳ جاري تحديد الموقع...';
            btnDetect.disabled = true;
            navigator.geolocation.getCurrentPosition(
              function (pos) {
                var latInput = Yawmia.$id('editLat');
                var lngInput = Yawmia.$id('editLng');
                if (latInput) latInput.value = pos.coords.latitude.toFixed(6);
                if (lngInput) lngInput.value = pos.coords.longitude.toFixed(6);
                btnDetect.textContent = '📍 تم تحديد الموقع ✓';
                btnDetect.disabled = false;
              },
              function (err) {
                YawmiaToast.error('تعذّر تحديد الموقع: ' + (err.message || 'خطأ غير معروف'));
                btnDetect.textContent = '📍 استخدم موقعي الحالي';
                btnDetect.disabled = false;
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          });
        }
      }
    }
  }

  // ── Update Profile Handler ────────────────────────────────
  var btnUpdate = Yawmia.$id('btnUpdateProfile');
  if (btnUpdate) {
    btnUpdate.addEventListener('click', async function () {
      Yawmia.clearMessage('editProfileMsg');

      var name = (Yawmia.$id('editName') || {}).value || '';
      var governorate = (Yawmia.$id('editGov') || {}).value || '';

      if (!name.trim()) {
        return Yawmia.showMessage('editProfileMsg', 'أدخل اسمك', 'error');
      }
      if (!governorate) {
        return Yawmia.showMessage('editProfileMsg', 'اختار المحافظة', 'error');
      }

      var body = { name: name.trim(), governorate: governorate };

      // Include lat/lng if provided
      var latVal = (Yawmia.$id('editLat') || {}).value;
      var lngVal = (Yawmia.$id('editLng') || {}).value;
      if (latVal !== undefined && latVal !== '') body.lat = parseFloat(latVal);
      if (lngVal !== undefined && lngVal !== '') body.lng = parseFloat(lngVal);

      if (user.role === 'worker') {
        var checked = document.querySelectorAll('#editCategoriesGrid input[name="categories"]:checked');
        var categories = Array.from(checked).map(function (el) { return el.value; });
        if (categories.length === 0) {
          return Yawmia.showMessage('editProfileMsg', 'اختار تخصص واحد على الأقل', 'error');
        }
        body.categories = categories;
      }

      Yawmia.setLoading(btnUpdate, true);

      try {
        var res = await Yawmia.api('PUT', '/api/auth/profile', body);
        if (res.data.ok) {
          user = res.data.user;
          Yawmia.setAuth(Yawmia.getToken(), user);
          renderProfile(user);
          // Update header
          if (headerName) headerName.textContent = user.name || user.phone;
          Yawmia.showMessage('editProfileMsg', 'تم حفظ التعديلات بنجاح', 'success');
        } else {
          Yawmia.showMessage('editProfileMsg', res.data.error || 'خطأ في الحفظ', 'error');
        }
      } catch (err) {
        Yawmia.showMessage('editProfileMsg', 'خطأ في الاتصال بالسيرفر', 'error');
      } finally {
        Yawmia.setLoading(btnUpdate, false);
      }
    });
  }

  // ── Load My Applications (Worker) ─────────────────────────
  async function loadMyApplications() {
    var listEl = Yawmia.$id('myApplicationsList');
    if (!listEl) return;

    try {
      var res = await Yawmia.api('GET', '/api/applications/mine');
      if (res.data.ok && res.data.applications.length > 0) {
        listEl.innerHTML = '';
        res.data.applications.forEach(function (app) {
          listEl.appendChild(createApplicationCard(app));
        });
      } else {
        listEl.innerHTML = '<p class="empty-state">لا توجد طلبات بعد</p>';
      }
    } catch (err) {
      listEl.innerHTML = '<div class="empty-state"><p>خطأ في تحميل الطلبات</p><button class="btn btn--primary btn--sm" id="retryMyApps" style="margin-top:0.75rem;">🔄 حاول مرة تانية</button></div>';
      var retryBtn = Yawmia.$id('retryMyApps');
      if (retryBtn) retryBtn.addEventListener('click', function () { loadMyApplications(); });
    }
  }

  function createApplicationCard(app) {
    var card = document.createElement('div');
    card.className = 'app-card';

    var statusLabels = {
      pending: 'في الانتظار',
      accepted: 'مقبول ✓',
      rejected: 'مرفوض ✗',
      withdrawn: 'تم السحب'
    };
    var statusClasses = {
      pending: 'badge--filled',
      accepted: 'badge--completed',
      rejected: 'badge--cancelled',
      withdrawn: 'badge--expired'
    };

    var statusLabel = statusLabels[app.status] || app.status;
    var statusClass = statusClasses[app.status] || '';

    var jobTitle = app.job ? escapeHtml(app.job.title) : 'فرصة محذوفة';
    var jobWage = app.job ? app.job.dailyWage + ' جنيه/يوم' : '';
    var jobGov = app.job ? app.job.governorate : '';

    var infoHtml =
      '<div class="app-card__info">' +
        '<div class="app-card__title">' + jobTitle + '</div>' +
        '<div class="app-card__meta">' +
          (jobWage ? jobWage + ' • ' : '') +
          (jobGov ? '📍 ' + escapeHtml(jobGov) + ' • ' : '') +
          new Date(app.appliedAt).toLocaleDateString('ar-EG') +
        '</div>' +
      '</div>';

    var actionsHtml =
      '<div class="app-card__actions">' +
        '<span class="badge badge--status ' + statusClass + '">' + statusLabel + '</span>';

    if (app.status === 'pending') {
      actionsHtml += ' <button class="btn btn--ghost btn--sm btn-withdraw" data-app-id="' + app.id + '">سحب الطلب</button>';
    }

    actionsHtml += '</div>';

    card.innerHTML = infoHtml + actionsHtml;

    // Withdraw handler
    var withdrawBtn = card.querySelector('.btn-withdraw');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', async function () {
        var confirmed = await YawmiaModal.confirm({ title: 'سحب الطلب', message: 'متأكد إنك عايز تسحب الطلب؟', confirmText: 'سحب الطلب', cancelText: 'رجوع', danger: true });
        if (!confirmed) return;
        Yawmia.setLoading(withdrawBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/applications/' + app.id + '/withdraw');
          if (res.data.ok) {
            loadMyApplications(); // Reload list
          } else {
            YawmiaToast.error(res.data.error || 'خطأ في سحب الطلب');
          }
        } catch (err) {
          YawmiaToast.error('خطأ في الاتصال');
        } finally {
          Yawmia.setLoading(withdrawBtn, false);
        }
      });
    }

    return card;
  }

  // ── Load My Jobs (Employer) ───────────────────────────────
  async function loadMyJobs() {
    var listEl = Yawmia.$id('myJobsList');
    if (!listEl) return;

    try {
      var res = await Yawmia.api('GET', '/api/jobs/mine');
      if (res.data.ok && res.data.jobs.length > 0) {
        listEl.innerHTML = '';
        res.data.jobs.forEach(function (job) {
          listEl.appendChild(createMyJobCard(job));
        });
      } else {
        listEl.innerHTML = '<p class="empty-state">لا توجد فرص منشورة بعد</p>';
      }
    } catch (err) {
      listEl.innerHTML = '<div class="empty-state"><p>خطأ في تحميل الفرص</p><button class="btn btn--primary btn--sm" id="retryMyJobs" style="margin-top:0.75rem;">🔄 حاول مرة تانية</button></div>';
      var retryBtn = Yawmia.$id('retryMyJobs');
      if (retryBtn) retryBtn.addEventListener('click', function () { loadMyJobs(); });
    }
  }

  function createMyJobCard(job) {
    var card = document.createElement('div');
    card.className = 'myjob-card';

    var statusLabels = {
      open: 'متاحة',
      filled: 'مكتملة العدد',
      in_progress: 'جاري التنفيذ',
      completed: 'مكتملة ✓',
      expired: 'منتهية',
      cancelled: 'ملغية'
    };
    var statusLabel = statusLabels[job.status] || job.status;

    card.innerHTML =
      '<div class="myjob-card__info">' +
        '<div class="myjob-card__title">' + escapeHtml(job.title) + '</div>' +
        '<div class="myjob-card__meta">' +
          job.dailyWage + ' جنيه/يوم • ' +
          '👷 ' + job.workersAccepted + '/' + job.workersNeeded + ' عامل • ' +
          new Date(job.createdAt).toLocaleDateString('ar-EG') +
        '</div>' +
      '</div>' +
      '<span class="badge badge--status badge--' + job.status + '">' + statusLabel + '</span>';

    return card;
  }

  // ── Load Ratings ──────────────────────────────────────────
  async function loadRatings(userId) {
    var summaryArea = Yawmia.$id('ratingSummaryArea');
    var listArea = Yawmia.$id('ratingsListArea');

    // Load summary + distribution
    try {
      var summaryRes = await Yawmia.api('GET', '/api/users/' + userId + '/rating-summary');
      if (summaryRes.data) {
        renderRatingSummary(summaryArea, summaryRes.data);
      }
    } catch (err) {
      if (summaryArea) summaryArea.innerHTML = '<div class="empty-state"><p>خطأ في تحميل ملخص التقييمات</p><button class="btn btn--ghost btn--sm" id="retryRatingSummary" style="margin-top:0.5rem;">🔄 حاول مرة تانية</button></div>';
      var retrySBtn = Yawmia.$id('retryRatingSummary');
      if (retrySBtn) retrySBtn.addEventListener('click', function () { loadRatings(userId); });
    }

    // Load individual ratings
    try {
      var ratingsRes = await Yawmia.api('GET', '/api/users/' + userId + '/ratings?limit=10&offset=0');
      if (ratingsRes.data && ratingsRes.data.items && ratingsRes.data.items.length > 0) {
        renderRatingsList(listArea, ratingsRes.data.items);
      } else {
        if (listArea) listArea.innerHTML = '<p class="empty-state">لا توجد تقييمات تفصيلية بعد</p>';
      }
    } catch (err) {
      if (listArea) listArea.innerHTML = '<div class="empty-state"><p>خطأ في تحميل التقييمات</p><button class="btn btn--primary btn--sm" id="retryRatingsList" style="margin-top:0.75rem;">🔄 حاول مرة تانية</button></div>';
      var retryRBtn = Yawmia.$id('retryRatingsList');
      if (retryRBtn) retryRBtn.addEventListener('click', function () { loadRatings(userId); });
    }
  }

  function renderRatingSummary(container, summary) {
    if (!container) return;

    var html = '<div class="rating-summary-card">';

    if (summary.count >= minRatingsToShow) {
      html +=
        '<div class="rating-summary-avg">' + summary.avg + '</div>' +
        '<div class="rating-summary-stars">' + starsDisplay(summary.avg) + '</div>' +
        '<div class="rating-summary-count">' + summary.count + ' تقييم</div>';
    } else if (summary.count > 0) {
      var needed = minRatingsToShow - summary.count;
      html += '<div class="rating-summary-msg">محتاج ' + needed + ' تقييمات كمان لعرض المتوسط</div>';
    } else {
      html += '<div class="rating-summary-msg">لا توجد تقييمات بعد</div>';
    }

    html += '</div>';

    // Distribution bars (always show if there are any ratings)
    if (summary.count > 0 && summary.distribution) {
      html += '<div class="rating-dist">';
      for (var star = 5; star >= 1; star--) {
        var count = summary.distribution[star] || 0;
        var pct = summary.count > 0 ? Math.round((count / summary.count) * 100) : 0;
        html +=
          '<div class="rating-dist-row">' +
            '<span class="rating-dist-label">' + star + ' ★</span>' +
            '<div class="rating-dist-bar"><div class="rating-dist-fill" style="width:' + pct + '%"></div></div>' +
            '<span class="rating-dist-count">' + count + '</span>' +
          '</div>';
      }
      html += '</div>';
    }

    container.innerHTML = html;
  }

  function renderRatingsList(container, items) {
    if (!container) return;
    container.innerHTML = '';

    var list = document.createElement('div');
    list.className = 'ratings-list';

    items.forEach(function (r) {
      var item = document.createElement('div');
      item.className = 'rating-item';

      var headerHtml =
        '<div class="rating-item__header">' +
          '<span class="rating-item__stars">' + starsDisplay(r.stars) + '</span>' +
          '<span class="rating-item__date">' + new Date(r.createdAt).toLocaleDateString('ar-EG') + '</span>' +
        '</div>';

      var commentHtml = r.comment
        ? '<div class="rating-item__comment">' + escapeHtml(r.comment) + '</div>'
        : '';

      var fromHtml = '<div class="rating-item__from">من: ' + (r.fromRole === 'worker' ? 'عامل' : 'صاحب عمل') + '</div>';

      item.innerHTML = headerHtml + commentHtml + fromHtml;
      list.appendChild(item);
    });

    container.appendChild(list);
  }

  // ── Notification Preferences ──────────────────────────────
  function renderNotificationPreferences(u) {
    var container = Yawmia.$id('notification-prefs');
    if (!container) return;

    var prefs = u.notificationPreferences || { inApp: true, whatsapp: true, sms: false };

    container.innerHTML =
      '<section class="card">' +
        '<h2 class="card__title">إعدادات الإشعارات</h2>' +
        '<div class="pref-group">' +
          '<label class="pref-item">' +
            '<input type="checkbox" checked disabled />' +
            '<span>إشعارات داخل التطبيق (دايماً مفعّلة)</span>' +
          '</label>' +
          '<label class="pref-item">' +
            '<input type="checkbox" id="pref-whatsapp" ' + (prefs.whatsapp ? 'checked' : '') + ' />' +
            '<span>إشعارات واتساب للأحداث المهمة</span>' +
          '</label>' +
          '<label class="pref-item">' +
            '<input type="checkbox" id="pref-sms" ' + (prefs.sms ? 'checked' : '') + ' />' +
            '<span>إشعارات SMS للأحداث المهمة</span>' +
          '</label>' +
          '<label class="pref-item">' +
            '<input type="checkbox" id="pref-push" checked />' +
            '<span>إشعارات Push (حتى لو التطبيق مقفول)</span>' +
          '</label>' +
          '<button class="btn btn--ghost" id="save-prefs-btn">حفظ إعدادات الإشعارات</button>' +
        '</div>' +
      '</section>';

    var saveBtn = Yawmia.$id('save-prefs-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var whatsapp = Yawmia.$id('pref-whatsapp').checked;
        var sms = Yawmia.$id('pref-sms').checked;
        saveBtn.disabled = true;
        saveBtn.textContent = 'جاري الحفظ...';

        try {
          var res = await Yawmia.api('PUT', '/api/auth/profile', {
            notificationPreferences: { whatsapp: whatsapp, sms: sms }
          });
          if (res.data.ok) {
            saveBtn.textContent = 'تم الحفظ ✓';
            setTimeout(function () { saveBtn.textContent = 'حفظ إعدادات الإشعارات'; saveBtn.disabled = false; }, 2000);
          } else {
            saveBtn.textContent = 'خطأ — حاول مرة تانية';
            saveBtn.disabled = false;
          }
        } catch (err) {
          saveBtn.textContent = 'خطأ — حاول مرة تانية';
          saveBtn.disabled = false;
        }
      });
    }
  }

  // ── Availability Toggle (Worker Only) ─────────────────────
  function renderAvailabilityToggle(u) {
    var container = Yawmia.$id('availability-section');
    if (!container) return;

    var availability = u.availability || {};
    var isAvailable = availability.available !== false;

    container.innerHTML =
      '<section class="card">' +
        '<h2 class="card__title">حالة الإتاحة</h2>' +
        '<p class="card__desc">حدد إذا كنت متاح للعمل حالياً. صاحب العمل هيشوف حالتك والمنصة هتبعتلك فرص مناسبة لما تكون متاح.</p>' +
        '<label class="pref-item" style="cursor:pointer;font-size:1.1rem;padding:0.75rem 0;">' +
          '<input type="checkbox" id="availabilityToggle" ' + (isAvailable ? 'checked' : '') +
          ' style="width:1.4rem;height:1.4rem;accent-color:var(--color-success);">' +
          '<span id="availabilityLabel">' + (isAvailable ? '🟢 متاح للعمل' : '🔴 غير متاح حالياً') + '</span>' +
        '</label>' +
      '</section>';

    var toggle = Yawmia.$id('availabilityToggle');
    var label = Yawmia.$id('availabilityLabel');
    if (toggle) {
      toggle.addEventListener('change', async function () {
        var newState = toggle.checked;
        label.textContent = newState ? '🟢 متاح للعمل' : '🔴 غير متاح حالياً';
        toggle.disabled = true;

        try {
          var res = await Yawmia.api('PUT', '/api/auth/profile', {
            availability: { available: newState },
          });
          if (res.data.ok) {
            // Update stored user
            var storedUser = Yawmia.getUser();
            if (storedUser) {
              if (!storedUser.availability) storedUser.availability = {};
              storedUser.availability.available = newState;
              Yawmia.setAuth(Yawmia.getToken(), storedUser);
            }
            if (typeof YawmiaToast !== 'undefined') {
              YawmiaToast.success(newState ? 'أنت متاح للعمل الآن' : 'تم تعطيل الإتاحة');
            }
          } else {
            // Revert on failure
            toggle.checked = !newState;
            label.textContent = !newState ? '🟢 متاح للعمل' : '🔴 غير متاح حالياً';
            if (typeof YawmiaToast !== 'undefined') {
              YawmiaToast.error(res.data.error || 'خطأ في تحديث الحالة');
            }
          }
        } catch (err) {
          // Revert on error
          toggle.checked = !newState;
          label.textContent = !newState ? '🟢 متاح للعمل' : '🔴 غير متاح حالياً';
          if (typeof YawmiaToast !== 'undefined') {
            YawmiaToast.error('خطأ في الاتصال بالسيرفر');
          }
        } finally {
          toggle.disabled = false;
        }
      });
    }
  }

  // ── Verification Section ──────────────────────────────────
  function renderVerificationSection(u) {
    var container = Yawmia.$id('verification-section');
    if (!container) return;

    var status = u.verificationStatus || 'unverified';
    var html = '<section class="card">' +
      '<h2 class="card__title">🔐 التحقق من الهوية</h2>';

    if (status === 'verified') {
      html += '<div class="verification-status verification-status--verified">' +
        '<span class="verification-badge verification-badge--verified">✓ تم التحقق من هويتك</span>' +
        '</div>';
    } else if (status === 'pending') {
      html += '<div class="verification-status verification-status--pending">' +
        '<span class="verification-badge verification-badge--pending">⏳ طلب التحقق قيد المراجعة</span>' +
        '</div>';
    } else {
      if (status === 'rejected') {
        html += '<div class="verification-status verification-status--rejected">' +
          '<span class="verification-badge verification-badge--rejected">✗ تم رفض طلب التحقق — يمكنك إعادة المحاولة</span>' +
          '</div>';
      }
      html += '<p class="card__desc">ارفع صورة البطاقة الشخصية للتحقق من هويتك والحصول على علامة "محقق"</p>' +
        '<div class="form-group">' +
          '<label class="form-label">صورة البطاقة الشخصية</label>' +
          '<input type="file" id="nationalIdInput" accept="image/*" class="form-input">' +
        '</div>' +
        '<button class="btn btn--primary" id="btnSubmitVerification">إرسال طلب التحقق</button>' +
        '<div class="message" id="verificationMsg"></div>';
    }

    html += '</section>';
    container.innerHTML = html;

    var submitBtn = Yawmia.$id('btnSubmitVerification');
    if (submitBtn) {
      submitBtn.addEventListener('click', handleVerificationSubmit);
    }
  }

  async function handleVerificationSubmit() {
    Yawmia.clearMessage('verificationMsg');
    var fileInput = Yawmia.$id('nationalIdInput');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) {
      return Yawmia.showMessage('verificationMsg', 'اختار صورة البطاقة', 'error');
    }

    var file = fileInput.files[0];
    if (file.size > 2 * 1024 * 1024) {
      return Yawmia.showMessage('verificationMsg', 'حجم الصورة أكبر من 2MB', 'error');
    }

    var submitBtn = Yawmia.$id('btnSubmitVerification');
    Yawmia.setLoading(submitBtn, true);

    try {
      var base64 = await fileToBase64(file);
      var res = await Yawmia.api('POST', '/api/auth/verify-identity', {
        nationalIdImage: base64
      });
      if (res.data.ok) {
        Yawmia.showMessage('verificationMsg', 'تم إرسال طلب التحقق بنجاح — سيتم مراجعته قريباً', 'success');
        setTimeout(function() { location.reload(); }, 2000);
      } else {
        Yawmia.showMessage('verificationMsg', res.data.error || 'خطأ في إرسال الطلب', 'error');
      }
    } catch (err) {
      Yawmia.showMessage('verificationMsg', 'خطأ في الاتصال بالسيرفر', 'error');
    } finally {
      Yawmia.setLoading(submitBtn, false);
    }
  }

  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() { resolve(reader.result); };
      reader.onerror = function() { reject(new Error('فشل قراءة الملف')); };
      reader.readAsDataURL(file);
    });
  }

  // ── Attendance History (Worker) ───────────────────────────
  async function loadAttendanceHistory() {
    var section = Yawmia.$id('attendanceHistorySection');
    var summaryArea = Yawmia.$id('attendanceSummaryArea');
    var listArea = Yawmia.$id('attendanceHistoryList');
    if (!section || !listArea) return;

    Yawmia.show('attendanceHistorySection');

    try {
      // Get accepted applications (last 10)
      var appsRes = await Yawmia.api('GET', '/api/applications/mine');
      if (!appsRes.data.ok || !appsRes.data.applications) {
        listArea.innerHTML = '<p class="empty-state">لا يوجد سجل حضور بعد</p>';
        return;
      }

      var acceptedApps = appsRes.data.applications
        .filter(function (a) { return a.status === 'accepted'; })
        .slice(0, 10);

      if (acceptedApps.length === 0) {
        listArea.innerHTML = '<p class="empty-state">لا يوجد سجل حضور بعد</p>';
        return;
      }

      var allRecords = [];
      var totalRecords = 0;
      var attendedRecords = 0;

      for (var i = 0; i < acceptedApps.length; i++) {
        var app = acceptedApps[i];
        try {
          var attRes = await Yawmia.api('GET', '/api/jobs/' + app.jobId + '/attendance');
          if (attRes.data.ok && attRes.data.records) {
            var myRecords = attRes.data.records.filter(function (r) { return r.workerId === user.id; });
            for (var j = 0; j < myRecords.length; j++) {
              myRecords[j]._jobTitle = app.job ? app.job.title : 'فرصة';
              allRecords.push(myRecords[j]);
              totalRecords++;
              if (myRecords[j].status === 'checked_in' || myRecords[j].status === 'checked_out' || myRecords[j].status === 'confirmed') {
                attendedRecords++;
              }
            }
          }
        } catch (e) {
          // Skip failed fetch
        }
      }

      // Render summary
      if (summaryArea && totalRecords > 0) {
        var rate = Math.round((attendedRecords / totalRecords) * 100);
        summaryArea.innerHTML =
          '<div class="attendance-summary">' +
            '<div class="attendance-summary__rate">' + rate + '%</div>' +
            '<div class="attendance-summary__label">نسبة الحضور</div>' +
            '<div class="attendance-summary__detail">' + attendedRecords + ' حضور من ' + totalRecords + ' سجل</div>' +
          '</div>';
      }

      // Render records
      if (allRecords.length === 0) {
        listArea.innerHTML = '<p class="empty-state">لا يوجد سجل حضور بعد</p>';
        return;
      }

      // Sort newest first
      allRecords.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });

      listArea.innerHTML = '';
      var statusLabels = {
        pending: 'في الانتظار',
        checked_in: 'حاضر ✓',
        checked_out: 'انصرف',
        confirmed: 'مؤكد ✓✓',
        no_show: 'غائب ✗'
      };
      var statusClasses = {
        pending: 'badge--filled',
        checked_in: 'badge--completed',
        checked_out: 'badge--expired',
        confirmed: 'badge--completed',
        no_show: 'badge--cancelled'
      };

      allRecords.forEach(function (record) {
        var card = document.createElement('div');
        card.className = 'app-card';
        var statusLabel = statusLabels[record.status] || record.status;
        var statusClass = statusClasses[record.status] || '';
        card.innerHTML =
          '<div class="app-card__info">' +
            '<div class="app-card__title">' + escapeHtml(record._jobTitle || '') + '</div>' +
            '<div class="app-card__meta">' +
              '📅 ' + (record.date || '') +
              (record.hoursWorked ? ' • ⏱ ' + record.hoursWorked + ' ساعة' : '') +
              (record.employerConfirmed ? ' • ✓ مؤكد من صاحب العمل' : '') +
            '</div>' +
          '</div>' +
          '<div class="app-card__actions">' +
            '<span class="badge badge--status ' + statusClass + '">' + statusLabel + '</span>' +
          '</div>';
        listArea.appendChild(card);
      });

    } catch (err) {
      listArea.innerHTML = '<div class="empty-state"><p>خطأ في تحميل سجل الحضور</p><button class="btn btn--primary btn--sm" id="retryAttendance" style="margin-top:0.75rem;">🔄 حاول مرة تانية</button></div>';
      var retryABtn = Yawmia.$id('retryAttendance');
      if (retryABtn) retryABtn.addEventListener('click', function () { loadAttendanceHistory(); });
    }
  }

  // ── Helpers ───────────────────────────────────────────────
  // ── Helpers — delegated to YawmiaUtils ────────────────────
  function starsDisplay(rating) {
    return YawmiaUtils.starsDisplay(rating);
  }

  function escapeHtml(str) {
    return YawmiaUtils.escapeHtml(str);
  }

  // ── Alerts Management ─────────────────────────────────────
  async function loadMyAlerts() {
    var container = Yawmia.$id('alerts-section');
    if (!container) return;

    try {
      var res = await Yawmia.api('GET', '/api/alerts');
      if (res.data.ok) {
        renderAlertsSection(container, res.data.alerts || []);
      } else {
        container.innerHTML = '';
      }
    } catch (err) {
      container.innerHTML = '';
    }
  }

  function renderAlertsSection(container, alerts) {
    var html = '<section class="card">' +
      '<h2 class="card__title">🔔 تنبيهات الفرص</h2>' +
      '<p class="card__desc">حدد معايير البحث وهنبعتلك إشعار لما فرصة مطابقة تتنشر.</p>';

    // Create alert form
    html += '<div class="alert-create-form" id="alertCreateForm">' +
      '<div class="form-group">' +
        '<label class="form-label" for="alertName">اسم التنبيه</label>' +
        '<input type="text" id="alertName" class="form-input form-input--sm" placeholder="مثال: زراعة في الجيزة">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">التخصصات (اختار واحد أو أكثر)</label>' +
        '<div class="checkbox-grid" id="alertCategoriesGrid"></div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label" for="alertGov">المحافظة (اختياري)</label>' +
        '<select id="alertGov" class="form-input form-input--sm"><option value="">كل المحافظات</option></select>' +
      '</div>' +
      '<div class="location-group">' +
        '<div class="form-group">' +
          '<label class="form-label" for="alertMinWage">أقل أجر (اختياري)</label>' +
          '<input type="number" id="alertMinWage" class="form-input form-input--sm" placeholder="150" min="0">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="alertMaxWage">أعلى أجر (اختياري)</label>' +
          '<input type="number" id="alertMaxWage" class="form-input form-input--sm" placeholder="1000" min="0">' +
        '</div>' +
      '</div>' +
      '<button class="btn btn--primary btn--sm" id="btnCreateAlert">إنشاء تنبيه</button>' +
      '<div class="message" id="alertCreateMsg"></div>' +
    '</div>';

    // Existing alerts list
    if (alerts.length > 0) {
      html += '<hr class="section-divider">';
      html += '<div class="alerts-list">';
      alerts.forEach(function (alt) {
        var criteria = alt.criteria || {};
        var catsText = (criteria.categories || []).join('، ');
        var govText = criteria.governorate || 'كل المحافظات';
        var wageText = '';
        if (criteria.minWage != null && criteria.maxWage != null) {
          wageText = criteria.minWage + '-' + criteria.maxWage + ' جنيه';
        } else if (criteria.minWage != null) {
          wageText = 'من ' + criteria.minWage + ' جنيه';
        } else if (criteria.maxWage != null) {
          wageText = 'حتى ' + criteria.maxWage + ' جنيه';
        }

        html += '<div class="alert-card" data-alert-id="' + escapeHtml(alt.id) + '">' +
          '<div class="alert-card__info">' +
            '<div class="alert-card__name">' + escapeHtml(alt.name) + '</div>' +
            '<div class="alert-criteria">' +
              '<span>📂 ' + escapeHtml(catsText) + '</span>' +
              '<span> • 📍 ' + escapeHtml(govText) + '</span>' +
              (wageText ? '<span> • 💰 ' + escapeHtml(wageText) + '</span>' : '') +
            '</div>' +
            '<div class="alert-card__meta">' +
              (alt.enabled ? '<span style="color:var(--color-success);">مفعّل</span>' : '<span style="color:var(--color-text-muted);">معطّل</span>') +
              ' • ' + (alt.matchCount || 0) + ' مطابقات' +
            '</div>' +
          '</div>' +
          '<div class="alert-card__actions">' +
            '<button class="btn btn--ghost btn--sm btn-toggle-alert" data-alert-id="' + escapeHtml(alt.id) + '" data-enabled="' + (alt.enabled ? 'true' : 'false') + '">' + (alt.enabled ? '⏸ تعطيل' : '▶ تفعيل') + '</button>' +
            '<button class="btn btn--ghost btn--sm btn-delete-alert" data-alert-id="' + escapeHtml(alt.id) + '" style="color:var(--color-error);border-color:var(--color-error);">🗑 حذف</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    } else {
      html += '<p class="empty-state" style="margin-top:1rem;">لا توجد تنبيهات بعد — أنشئ أول تنبيه!</p>';
    }

    html += '</section>';
    container.innerHTML = html;

    // Populate dropdowns
    Yawmia.populateCategoriesCheckboxes('alertCategoriesGrid');
    Yawmia.populateGovernorates('alertGov');

    // Create alert handler
    var btnCreate = Yawmia.$id('btnCreateAlert');
    if (btnCreate) {
      btnCreate.addEventListener('click', async function () {
        Yawmia.clearMessage('alertCreateMsg');
        var name = (Yawmia.$id('alertName') || {}).value || '';
        var govVal = (Yawmia.$id('alertGov') || {}).value || '';
        var minW = (Yawmia.$id('alertMinWage') || {}).value;
        var maxW = (Yawmia.$id('alertMaxWage') || {}).value;
        var checkedCats = document.querySelectorAll('#alertCategoriesGrid input[name="categories"]:checked');
        var categories = Array.from(checkedCats).map(function (el) { return el.value; });

        if (!name.trim()) {
          return Yawmia.showMessage('alertCreateMsg', 'اكتب اسم للتنبيه', 'error');
        }
        if (categories.length === 0) {
          return Yawmia.showMessage('alertCreateMsg', 'اختار تخصص واحد على الأقل', 'error');
        }

        var criteria = { categories: categories };
        if (govVal) criteria.governorate = govVal;
        if (minW && !isNaN(parseInt(minW))) criteria.minWage = parseInt(minW);
        if (maxW && !isNaN(parseInt(maxW))) criteria.maxWage = parseInt(maxW);

        Yawmia.setLoading(btnCreate, true);
        try {
          var res = await Yawmia.api('POST', '/api/alerts', { name: name.trim(), criteria: criteria });
          if (res.data.ok) {
            YawmiaToast.success('تم إنشاء التنبيه ✓');
            loadMyAlerts();
          } else {
            Yawmia.showMessage('alertCreateMsg', res.data.error || 'خطأ في إنشاء التنبيه', 'error');
          }
        } catch (err) {
          Yawmia.showMessage('alertCreateMsg', 'خطأ في الاتصال', 'error');
        } finally {
          Yawmia.setLoading(btnCreate, false);
        }
      });
    }

    // Toggle handlers
    container.querySelectorAll('.btn-toggle-alert').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var alertId = btn.getAttribute('data-alert-id');
        var currentEnabled = btn.getAttribute('data-enabled') === 'true';
        Yawmia.setLoading(btn, true);
        try {
          var res = await Yawmia.api('PUT', '/api/alerts/' + alertId, { enabled: !currentEnabled });
          if (res.data.ok) {
            loadMyAlerts();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ');
          }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(btn, false); }
      });
    });

    // Delete handlers
    container.querySelectorAll('.btn-delete-alert').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var alertId = btn.getAttribute('data-alert-id');
        var confirmed = await YawmiaModal.confirm({ title: 'حذف التنبيه', message: 'متأكد إنك عايز تحذف هذا التنبيه؟', confirmText: 'حذف', cancelText: 'إلغاء', danger: true });
        if (!confirmed) return;
        Yawmia.setLoading(btn, true);
        try {
          var res = await Yawmia.api('DELETE', '/api/alerts/' + alertId);
          if (res.data.ok) {
            YawmiaToast.success('تم حذف التنبيه');
            loadMyAlerts();
          } else {
            YawmiaToast.error(res.data.error || 'خطأ');
          }
        } catch (err) { YawmiaToast.error('خطأ في الاتصال'); }
        finally { Yawmia.setLoading(btn, false); }
      });
    });
  }

})();
