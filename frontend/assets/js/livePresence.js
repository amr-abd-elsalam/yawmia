// ═══════════════════════════════════════════════════════════════
// frontend/assets/js/livePresence.js — Worker Presence + Heartbeat
// Phase 40 — Battery-aware heartbeat sender + status indicator UI
// ═══════════════════════════════════════════════════════════════

var YawmiaLivePresence = (function () {
  'use strict';

  var heartbeatTimer = null;
  var currentInterval = null;
  var FOREGROUND_INTERVAL = 30000;
  var BACKGROUND_INTERVAL = 60000;
  var acceptingJobs = true;
  var sessionId = null;
  var lastStatus = 'offline';
  var started = false;
  var liveFeedSource = null;

  function getSessionId() {
    if (sessionId) return sessionId;
    try {
      sessionId = sessionStorage.getItem('yawmia_session_id');
      if (!sessionId) {
        sessionId = 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        sessionStorage.setItem('yawmia_session_id', sessionId);
      }
    } catch (_) {
      sessionId = 'sid_' + Date.now();
    }
    return sessionId;
  }

  function getStoredAccepting() {
    try {
      var v = localStorage.getItem('yawmia_accepting_jobs');
      if (v === 'false') return false;
    } catch (_) {}
    return true;
  }

  function storeAccepting(val) {
    try { localStorage.setItem('yawmia_accepting_jobs', val ? 'true' : 'false'); } catch (_) {}
  }

  /**
   * Send a single heartbeat to the server.
   */
  async function sendHeartbeat() {
    if (!Yawmia.isLoggedIn()) return;
    var user = Yawmia.getUser();
    if (!user || user.role !== 'worker') return;

    var body = { sessionId: getSessionId(), acceptingJobs: acceptingJobs };

    // Try to include current location (non-blocking)
    if (typeof user.lat === 'number') body.lat = user.lat;
    if (typeof user.lng === 'number') body.lng = user.lng;

    try {
      var res = await Yawmia.api('POST', '/api/presence/heartbeat', body);
      if (res.data && res.data.ok) {
        var newStatus = res.data.status || 'online';
        if (newStatus !== lastStatus) {
          lastStatus = newStatus;
          window.dispatchEvent(new CustomEvent('yawmia:presence-status-changed', { detail: { status: newStatus } }));
        }
        updateIndicator(newStatus);
      }
    } catch (_) {
      // Network error — degrade gracefully
      updateIndicator('offline');
    }
  }

  /**
   * Compute the appropriate heartbeat interval based on tab visibility.
   */
  function computeInterval() {
    if (typeof document === 'undefined') return FOREGROUND_INTERVAL;
    return document.visibilityState === 'hidden' ? BACKGROUND_INTERVAL : FOREGROUND_INTERVAL;
  }

  /**
   * Restart heartbeat timer with the current interval.
   */
  function restartTimer() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    var interval = computeInterval();
    currentInterval = interval;
    heartbeatTimer = setInterval(sendHeartbeat, interval);
  }

  /**
   * Update the visual status indicator (dot + label).
   */
  function updateIndicator(status) {
    var dot = document.getElementById('presenceStatusDot');
    var label = document.getElementById('presenceStatusLabel');
    if (dot) {
      dot.classList.remove('presence-dot--online', 'presence-dot--away', 'presence-dot--offline');
      dot.classList.add('presence-dot--' + status);
    }
    if (label) {
      var labels = { online: '🟢 متاح للشغل', away: '🟡 بعيد', offline: '⚫ غير متصل' };
      label.textContent = labels[status] || labels.offline;
    }
  }

  /**
   * Start the live feed EventSource connection.
   */
  function startLiveFeed() {
    if (liveFeedSource) return;
    if (!Yawmia.isLoggedIn()) return;
    var user = Yawmia.getUser();
    if (!user || user.role !== 'worker') return;

    try {
      var token = Yawmia.getToken();
      var url = '/api/jobs/live-feed?token=' + encodeURIComponent(token);
      liveFeedSource = new EventSource(url);

      liveFeedSource.addEventListener('init', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:live-feed-init', { detail: data }));
        } catch (_) {}
      });

      liveFeedSource.addEventListener('job_created', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:live-feed-job-created', { detail: data }));
        } catch (_) {}
      });

      liveFeedSource.addEventListener('job_updated', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:live-feed-job-updated', { detail: data }));
        } catch (_) {}
      });

      liveFeedSource.addEventListener('instant_match_offer', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:instant-match-offer', { detail: data }));
        } catch (_) {}
      });

      liveFeedSource.addEventListener('instant_match_taken', function (e) {
        try {
          var data = JSON.parse(e.data);
          window.dispatchEvent(new CustomEvent('yawmia:instant-match-taken', { detail: data }));
        } catch (_) {}
      });

      liveFeedSource.onerror = function () { /* auto-reconnects */ };
    } catch (_) {
      liveFeedSource = null;
    }
  }

  function stopLiveFeed() {
    if (liveFeedSource) {
      liveFeedSource.close();
      liveFeedSource = null;
    }
  }

  /**
   * Toggle acceptingJobs flag.
   */
  function setAcceptingJobs(val) {
    acceptingJobs = !!val;
    storeAccepting(acceptingJobs);
    var toggle = document.getElementById('acceptingJobsToggle');
    if (toggle) toggle.checked = acceptingJobs;
    sendHeartbeat();
  }

  /**
   * Render the presence toggle UI.
   */
  function renderToggleUI(container) {
    if (!container) return;
    container.innerHTML =
      '<section class="card live-presence-section">' +
        '<div class="live-presence-row">' +
          '<div class="live-presence-status">' +
            '<span id="presenceStatusDot" class="presence-dot presence-dot--offline"></span>' +
            '<span id="presenceStatusLabel" class="presence-status-label">⚫ غير متصل</span>' +
          '</div>' +
          '<label class="live-presence-toggle">' +
            '<input type="checkbox" id="acceptingJobsToggle" ' + (acceptingJobs ? 'checked' : '') + '>' +
            '<span>متاح للشغل دلوقتي</span>' +
          '</label>' +
        '</div>' +
        '<p class="card__desc" style="margin-block-start:0.5rem;font-size:0.8rem;">لما تكون online، أصحاب العمل يقدروا يبعتولك فرص فورية مباشرة.</p>' +
      '</section>';

    var toggle = document.getElementById('acceptingJobsToggle');
    if (toggle) {
      toggle.addEventListener('change', function () {
        setAcceptingJobs(toggle.checked);
        if (typeof YawmiaToast !== 'undefined') {
          YawmiaToast.success(toggle.checked ? 'متاح للشغل دلوقتي ⚡' : 'تم إيقاف استلام الفرص الفورية');
        }
      });
    }
  }

  /**
   * Initialize for a worker user.
   */
  function start() {
    if (started) return;
    if (!Yawmia.isLoggedIn()) return;
    var user = Yawmia.getUser();
    if (!user || user.role !== 'worker') return;

    started = true;
    acceptingJobs = getStoredAccepting();

    // Visibility change handler — adapt heartbeat frequency
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        var newInterval = computeInterval();
        if (newInterval !== currentInterval) {
          restartTimer();
        }
        if (document.visibilityState === 'visible') {
          // Send immediate heartbeat when coming back
          sendHeartbeat();
        }
      });
    }

    // Send initial heartbeat
    sendHeartbeat();

    // Start interval timer
    restartTimer();

    // Start live feed SSE
    startLiveFeed();

    // Render toggle UI if mount point exists
    var mount = document.getElementById('livePresenceMount');
    if (mount) renderToggleUI(mount);
  }

  function stop() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    stopLiveFeed();
    started = false;
  }

  // Auto-start when DOM ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      // Defer to allow other modules to initialize
      setTimeout(start, 100);
    }
  }

  return {
    start: start,
    stop: stop,
    sendHeartbeat: sendHeartbeat,
    setAcceptingJobs: setAcceptingJobs,
    isAccepting: function () { return acceptingJobs; },
    getStatus: function () { return lastStatus; },
  };
})();
