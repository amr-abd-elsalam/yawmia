// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/user.js — Public Profile Page Module (IIFE)
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var minRatingsToShow = 3;

  // Get userId from URL
  var params = new URLSearchParams(window.location.search);
  var userId = params.get('id');

  if (!userId) {
    showError();
    return;
  }

  loadPublicProfile(userId);

  async function loadPublicProfile(uid) {
    try {
      // Load config
      var cfg = await Yawmia.loadConfig();
      if (cfg && cfg.RATINGS && typeof cfg.RATINGS.minRatingsToShow === 'number') {
        minRatingsToShow = cfg.RATINGS.minRatingsToShow;
      }

      var res = await Yawmia.api('GET', '/api/users/' + uid + '/public-profile');
      if (!res.data.ok || !res.data.profile) {
        showError();
        return;
      }

      var profile = res.data.profile;
      renderProfile(profile);

      // Load ratings
      loadRatings(uid);

      Yawmia.hide('profileLoading');
      Yawmia.show('profileContent');

    } catch (err) {
      showError();
    }
  }

  function renderProfile(p) {
    var avatarEl = Yawmia.$id('pubAvatar');
    var nameEl = Yawmia.$id('pubName');
    var govEl = Yawmia.$id('pubGov');
    var roleBadgeEl = Yawmia.$id('pubRoleBadge');
    var verBadgeEl = Yawmia.$id('pubVerificationBadge');
    var ratingEl = Yawmia.$id('pubRatingSummary');
    var categoriesEl = Yawmia.$id('pubCategories');
    var trustSection = Yawmia.$id('pubTrustSection');
    var trustScoreEl = Yawmia.$id('pubTrustScore');
    var memberEl = Yawmia.$id('pubMemberSince');

    if (avatarEl) avatarEl.textContent = p.role === 'worker' ? '👷' : '🏢';
    if (nameEl) nameEl.textContent = p.name || 'بدون اسم';
    if (govEl) govEl.textContent = p.governorate ? '📍 ' + p.governorate : '';

    // Role badge
    if (roleBadgeEl) {
      var roleText = p.role === 'worker' ? 'عامل' : (p.role === 'employer' ? 'صاحب عمل' : p.role);
      roleBadgeEl.innerHTML = '<span class="badge badge--' + escapeHtml(p.role) + '">' + escapeHtml(roleText) + '</span>';
    }

    // Verification badge
    if (verBadgeEl) {
      var verLabels = {
        verified: '✓ هوية محققة',
        pending: '⏳ قيد التحقق',
        rejected: '',
        unverified: '',
      };
      var verClasses = {
        verified: 'verification-badge--verified',
        pending: 'verification-badge--pending',
        rejected: '',
        unverified: '',
      };
      var vStatus = p.verificationStatus || 'unverified';
      if (verLabels[vStatus]) {
        verBadgeEl.innerHTML = '<span class="verification-badge ' + verClasses[vStatus] + '">' + escapeHtml(verLabels[vStatus]) + '</span>';
      }
    }

    // Rating
    if (ratingEl) {
      var rating = p.rating || { avg: 0, count: 0 };
      if (rating.count >= minRatingsToShow) {
        ratingEl.innerHTML =
          '<div class="rating-summary-avg">' + rating.avg + '</div>' +
          '<div class="rating-summary-stars">' + starsDisplay(rating.avg) + '</div>' +
          '<div class="rating-summary-count">' + rating.count + ' تقييم</div>';
      } else if (rating.count > 0) {
        ratingEl.innerHTML = '<div class="rating-summary-msg">تقييمات غير كافية لعرض المتوسط</div>';
      } else {
        ratingEl.innerHTML = '<div class="rating-summary-msg">لا توجد تقييمات</div>';
      }
    }

    // Categories
    if (categoriesEl && p.categories && p.categories.length > 0) {
      Yawmia.show('pubCategories');
      categoriesEl.innerHTML = '';
      p.categories.forEach(function (catId) {
        var span = document.createElement('span');
        span.className = 'badge badge--worker';
        span.textContent = catId;
        categoriesEl.appendChild(span);
      });
    }

    // Trust score
    if (trustSection && trustScoreEl && typeof p.trustScore === 'number') {
      var trustClass = p.trustScore >= 0.7 ? 'trust-high' : (p.trustScore >= 0.4 ? 'trust-medium' : 'trust-low');
      trustScoreEl.innerHTML =
        '<div class="trust-score-display ' + trustClass + '">' +
          '<span class="trust-score-value">' + Math.round(p.trustScore * 100) + '</span>' +
          '<span class="trust-score-label">/ 100</span>' +
        '</div>';
      trustSection.classList.remove('hidden');
    } else if (trustSection) {
      trustSection.classList.add('hidden');
    }

    // Member since
    if (memberEl && p.memberSince) {
      memberEl.textContent = 'عضو منذ ' + new Date(p.memberSince).toLocaleDateString('ar-EG');
    }
  }

  async function loadRatings(uid) {
    var summaryArea = Yawmia.$id('pubRatingSummaryArea');
    var listArea = Yawmia.$id('pubRatingsListArea');

    try {
      var summaryRes = await Yawmia.api('GET', '/api/users/' + uid + '/rating-summary');
      if (summaryRes.data) {
        renderRatingSummary(summaryArea, summaryRes.data);
      }
    } catch (err) {
      if (summaryArea) summaryArea.innerHTML = '';
    }

    try {
      var ratingsRes = await Yawmia.api('GET', '/api/users/' + uid + '/ratings?limit=10&offset=0');
      if (ratingsRes.data && ratingsRes.data.items && ratingsRes.data.items.length > 0) {
        renderRatingsList(listArea, ratingsRes.data.items);
      } else {
        if (listArea) listArea.innerHTML = '<p class="empty-state">لا توجد تقييمات تفصيلية</p>';
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
      html += '<div class="rating-summary-msg">تقييمات غير كافية لعرض المتوسط</div>';
    } else {
      html += '<div class="rating-summary-msg">لا توجد تقييمات</div>';
    }
    html += '</div>';

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
      item.innerHTML =
        '<div class="rating-item__header">' +
          '<span class="rating-item__stars">' + starsDisplay(r.stars) + '</span>' +
          '<span class="rating-item__date">' + new Date(r.createdAt).toLocaleDateString('ar-EG') + '</span>' +
        '</div>' +
        (r.comment ? '<div class="rating-item__comment">' + escapeHtml(r.comment) + '</div>' : '') +
        '<div class="rating-item__from">من: ' + (r.fromRole === 'worker' ? 'عامل' : 'صاحب عمل') + '</div>';
      list.appendChild(item);
    });
    container.appendChild(list);
  }

  function showError() {
    Yawmia.hide('profileLoading');
    Yawmia.show('profileError');
  }

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
