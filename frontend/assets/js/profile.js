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

        // Role-specific sections
        if (user.role === 'worker') {
          Yawmia.show('myApplicationsSection');
          loadMyApplications();
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
      listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الطلبات</p>';
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
        if (!confirm('متأكد إنك عايز تسحب الطلب؟')) return;
        Yawmia.setLoading(withdrawBtn, true);
        try {
          var res = await Yawmia.api('POST', '/api/applications/' + app.id + '/withdraw');
          if (res.data.ok) {
            loadMyApplications(); // Reload list
          } else {
            alert(res.data.error || 'خطأ في سحب الطلب');
          }
        } catch (err) {
          alert('خطأ في الاتصال');
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
      listEl.innerHTML = '<p class="empty-state">خطأ في تحميل الفرص</p>';
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
      if (summaryArea) summaryArea.innerHTML = '';
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
      if (listArea) listArea.innerHTML = '<p class="empty-state">خطأ في تحميل التقييمات</p>';
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

  // ── Helpers ───────────────────────────────────────────────
  function starsDisplay(rating) {
    var full = Math.floor(rating);
    var half = (rating - full) >= 0.5 ? 1 : 0;
    var empty = 5 - full - half;
    var str = '';
    for (var i = 0; i < full; i++) str += '★';
    if (half) str += '☆';
    for (var j = 0; j < empty; j++) str += '☆';
    return str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

})();
