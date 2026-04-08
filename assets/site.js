(function () {
  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reducedMotion) {
    document.body.classList.add('motion-ready');
  }

  const burger = document.querySelector('[data-burger]');
  const nav = document.querySelector('[data-nav]');
  if (burger && nav) {
    burger.setAttribute('aria-expanded', 'false');
    burger.addEventListener('click', function () {
      nav.classList.toggle('open');
      burger.setAttribute('aria-expanded', nav.classList.contains('open') ? 'true' : 'false');
    });
  }

  const yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  const cfg = window.RiftSkinConfig || {};
  const authStorage = window.localStorage || window.sessionStorage;
  window.dataLayer = window.dataLayer || [];

  function getSharedSupabaseClient() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    if (window.__riftskinSupabaseClient) {
      return window.__riftskinSupabaseClient;
    }
    window.__riftskinSupabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    return window.__riftskinSupabaseClient;
  }

  function loadSupabaseLibrary() {
    if (window.supabase) return Promise.resolve(window.supabase);
    if (window.__riftskinSupabaseLoader) return window.__riftskinSupabaseLoader;

    window.__riftskinSupabaseLoader = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-riftskin-supabase]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.supabase); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.async = true;
      script.setAttribute('data-riftskin-supabase', '1');
      script.addEventListener('load', function () { resolve(window.supabase); }, { once: true });
      script.addEventListener('error', reject, { once: true });
      document.head.appendChild(script);
    });

    return window.__riftskinSupabaseLoader;
  }

  function getMaintenanceAllowedEmails() {
    return Array.isArray(cfg.siteMaintenanceAllowedEmails)
      ? cfg.siteMaintenanceAllowedEmails.map(function (value) {
        return String(value || '').trim().toLowerCase();
      }).filter(Boolean)
      : [];
  }

  function isMaintenanceAllowedSession(session) {
    const email = session && session.user && session.user.email
      ? String(session.user.email).trim().toLowerCase()
      : '';
    return !!email && getMaintenanceAllowedEmails().indexOf(email) !== -1;
  }

  function redirectToMaintenanceAccount() {
    const next = window.location.pathname + window.location.search + window.location.hash;
    const target = '/account.html?maintenance=1&next=' + encodeURIComponent(next);
    if (window.location.pathname === '/account.html') return;
    window.location.replace(target);
  }

  async function enforceSiteMaintenanceGate() {
    if (!cfg.siteMaintenanceEnabled) return;

    const page = document.body.getAttribute('data-page') || '';
    if (page === 'account') return;

    try {
      await loadSupabaseLibrary();
      const supabaseClient = getSharedSupabaseClient();
      if (!supabaseClient) {
        redirectToMaintenanceAccount();
        return;
      }
      const sessionResult = await supabaseClient.auth.getSession();
      const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      if (session && isMaintenanceAllowedSession(session)) {
        return;
      }
    } catch (_err) {
      // Fall through to the account page when auth state cannot be verified.
    }

    redirectToMaintenanceAccount();
  }

  enforceSiteMaintenanceGate();

  function pushAnalyticsEvent(eventName, params) {
    if (!eventName) return;
    window.dataLayer.push(Object.assign({
      event: eventName,
      page_type: document.body.getAttribute('data-page') || 'unknown',
      page_path: window.location.pathname
    }, params || {}));
  }

  document.querySelectorAll('[data-download-installer]').forEach(function (el) {
    el.setAttribute('href', cfg.downloadInstallerUrl || 'https://github.com/tdaval-78/riftskin-updates/releases/latest');
  });
  document.querySelectorAll('[data-download-windows]').forEach(function (el) {
    el.setAttribute('href', cfg.downloadWindowsUrl || cfg.publicReleasesUrl || 'https://github.com/tdaval-78/riftskin-updates/releases/latest');
  });
  document.querySelectorAll('[data-download-direct]').forEach(function (el) {
    el.setAttribute('href', cfg.downloadDirectAppUrl || 'https://github.com/tdaval-78/riftskin-updates/releases/latest');
  });
  document.querySelectorAll('[data-public-releases]').forEach(function (el) {
    el.setAttribute('href', cfg.publicReleasesUrl || 'https://github.com/tdaval-78/riftskin-updates/releases');
  });

  document.querySelectorAll('[data-nav]').forEach(function (nav) {
    if (nav.querySelector('[data-link="get-skins"]')) return;

    const link = document.createElement('a');
    link.setAttribute('data-link', 'get-skins');
    link.setAttribute('href', '/get-skins.html');
    link.setAttribute('data-i18n', 'nav_get_skins');
    link.textContent = 'Obtenir skin';

    const downloadLink = nav.querySelector('[data-link="download"]');
    if (downloadLink && downloadLink.nextSibling) {
      nav.insertBefore(link, downloadLink.nextSibling);
    } else if (downloadLink) {
      nav.appendChild(link);
    } else {
      nav.insertBefore(link, nav.firstChild || null);
    }
  });

  if (window.RiftSkinI18n && typeof window.RiftSkinI18n.apply === 'function') {
    window.RiftSkinI18n.apply(document);
  }

  const active = document.body.getAttribute('data-page');
  if (active) {
    document.querySelectorAll('[data-link]').forEach(function (el) {
      if (el.getAttribute('data-link') === active) {
        el.classList.add('active');
      }
    });
  }

  document.querySelectorAll('[data-download-installer]').forEach(function (el) {
    el.addEventListener('click', function () {
      pushAnalyticsEvent('riftskin_download_click', {
        link_text: (el.textContent || '').trim(),
        link_href: el.getAttribute('href') || ''
      });
    });
  });

  document.querySelectorAll('[data-home-premium-cta], [data-premium-cta]').forEach(function (el) {
    el.addEventListener('click', function () {
      pushAnalyticsEvent('riftskin_pricing_click', {
        cta_location: el.hasAttribute('data-home-premium-cta') ? 'home' : 'pricing',
        link_text: (el.textContent || '').trim(),
        link_href: el.getAttribute('href') || ''
      });
    });
  });

  document.querySelectorAll('a[href="/support.html"]').forEach(function (el) {
    el.addEventListener('click', function () {
      pushAnalyticsEvent('riftskin_support_click', {
        link_text: (el.textContent || '').trim(),
        link_href: el.getAttribute('href') || ''
      });
    });
  });

  document.querySelectorAll('a[href="/account.html"]').forEach(function (el) {
    el.addEventListener('click', function () {
      pushAnalyticsEvent('riftskin_account_click', {
        link_text: (el.textContent || '').trim(),
        link_href: el.getAttribute('href') || ''
      });
    });
  });

  function getVideoContext(iframe) {
    if (!iframe) return 'unknown';
    if (iframe.closest('.home-demo-frame')) return 'home_demo';
    if (iframe.closest('.download-guide-video-frame')) {
      return document.body.getAttribute('data-page') === 'download' ? 'download_guide' : 'install_guide';
    }
    return 'unknown';
  }

  function withYouTubeApiParams(src) {
    if (!src) return src;
    try {
      const url = new URL(src, window.location.origin);
      url.searchParams.set('enablejsapi', '1');
      url.searchParams.set('origin', window.location.origin);
      return url.toString();
    } catch (_err) {
      return src;
    }
  }

  function loadYouTubeIframeApi() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve(window.YT);
    }

    if (window.__riftskinYoutubeApiPromise) {
      return window.__riftskinYoutubeApiPromise;
    }

    window.__riftskinYoutubeApiPromise = new Promise(function (resolve) {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousReady === 'function') {
          previousReady();
        }
        resolve(window.YT);
      };

      const existingScript = document.querySelector('script[data-youtube-iframe-api]');
      if (existingScript) return;

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.setAttribute('data-youtube-iframe-api', '1');
      document.head.appendChild(script);
    });

    return window.__riftskinYoutubeApiPromise;
  }

  const youtubeEmbeds = Array.from(document.querySelectorAll('.home-demo-frame iframe, .download-guide-video-frame iframe'));
  if (youtubeEmbeds.length) {
    youtubeEmbeds.forEach(function (iframe, index) {
      iframe.setAttribute('data-riftskin-video-id', 'riftskin-video-' + index);
      iframe.src = withYouTubeApiParams(iframe.getAttribute('src'));
    });

    loadYouTubeIframeApi().then(function (YT) {
      if (!YT || !YT.Player) return;

      youtubeEmbeds.forEach(function (iframe) {
        let lastTrackedState = null;
        const context = getVideoContext(iframe);

        // Listen to real YouTube player state changes instead of fake wrapper clicks.
        new YT.Player(iframe, {
          events: {
            onStateChange: function (event) {
              if (event.data !== YT.PlayerState.PLAYING || lastTrackedState === YT.PlayerState.PLAYING) {
                lastTrackedState = event.data;
                return;
              }

              lastTrackedState = event.data;
              pushAnalyticsEvent('riftskin_video_play', {
                video_context: context,
                video_title: iframe.getAttribute('title') || 'RIFTSKIN video'
              });
            }
          }
        });
      });
    }).catch(function () {
      // Ignore YouTube API load failures silently; they should not break the page.
    });
  }

  const navStatusDots = Array.from(document.querySelectorAll('[data-site-status-dot]'));
  const publicServiceBadge = document.querySelector('[data-public-service-badge]');
  const publicServicePublished = document.querySelector('[data-public-service-published]');
  const publicServiceMessage = document.querySelector('[data-public-service-message]');
  let lastPublicStatusRow = null;
  let lastPublicRelease = null;
  let publicStatusLoadFailed = false;

  function t(key, fallback) {
    if (window.RiftSkinI18n && typeof window.RiftSkinI18n.t === 'function') {
      const translated = window.RiftSkinI18n.t(key);
      return translated === key && typeof fallback === 'string' ? fallback : translated;
    }
    return typeof fallback === 'string' ? fallback : key;
  }

  function getPublicServiceStateInfo(state) {
    if (state === 'ok') {
      return {
        label: t('site_status_badge_ok', 'INJECTION & SOFTWARE FUNCTIONAL'),
        kind: 'ok',
        dot: 'ok'
      };
    }

    return {
      label: t('site_status_badge_warning', 'INJECTION CURRENTLY BEING PATCHED BY OUR TEAM'),
      kind: 'warning',
      dot: 'warning'
    };
  }

  function getDefaultPublicServiceMessage(state) {
    if (state === 'ok') {
      return t('site_status_default_ok', 'Skin injection is currently functional.');
    }
    return t('site_status_default_warning', 'Skin injection is currently unavailable. Our team is actively working on a compatibility update.');
  }

  function formatPublicTimestamp(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  async function fetchLatestPublicRelease() {
    const apiUrl = cfg.publicReleasesApiUrl || 'https://api.github.com/repos/tdaval-78/riftskin-updates/releases/latest';
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'RIFTSKIN-site'
      },
      cache: 'no-store'
    });

    const payload = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      const errorText = payload && payload.message ? payload.message : ('Request failed with status ' + response.status);
      throw new Error(errorText);
    }

    if (!payload || typeof payload !== 'object') {
      return null;
    }

    return {
      tagName: payload.tag_name || '',
      publishedAt: payload.published_at || ''
    };
  }

  function getLatestPublicReleaseLabel(release, row) {
    const publishedAt = release && release.publishedAt ? release.publishedAt : (row && row.published_at ? row.published_at : '');
    const publishedLabel = publishedAt
      ? (t('site_status_live_since', 'Published on') + ' ' + formatPublicTimestamp(publishedAt))
      : t('site_status_published_empty', 'No public status published yet.');

    if (release && release.tagName) {
      return publishedLabel + ' • ' + release.tagName;
    }

    return publishedLabel;
  }

  function setNavStatusState(state, message) {
    const info = getPublicServiceStateInfo(state);
    navStatusDots.forEach(function (dot) {
      dot.classList.remove('ok', 'warning');
      dot.classList.add(info.dot);
      const link = dot.closest('a');
      if (link) {
        link.setAttribute('title', message || info.label);
      }
    });
  }

  async function fetchPublicServiceStatus() {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('Supabase config missing.');
    }

    const response = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/get_public_service_status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseAnonKey
      },
      cache: 'no-store',
      body: JSON.stringify({ p_channel: 'stable' })
    });

    const payload = await response.json().catch(function () {
      return null;
    });

    if (!response.ok) {
      const errorText = payload && payload.message ? payload.message : ('Request failed with status ' + response.status);
      throw new Error(errorText);
    }

    return Array.isArray(payload) ? (payload[0] || null) : null;
  }

  function renderPublicStatusPage(row, release) {
    if (!publicServiceBadge && !publicServicePublished && !publicServiceMessage) return;

    const normalizedState = row && row.injection_state === 'ok' ? 'ok' : 'maintenance';
    const info = getPublicServiceStateInfo(normalizedState);
    const publishedValue = getLatestPublicReleaseLabel(release, row);
    const messageValue = (row && row.service_message) || getDefaultPublicServiceMessage(normalizedState);

    if (publicServiceBadge) {
      publicServiceBadge.textContent = info.label;
      publicServiceBadge.className = 'status-badge ' + info.kind;
    }
    if (publicServicePublished) {
      publicServicePublished.textContent = publishedValue;
    }
    if (publicServiceMessage) {
      publicServiceMessage.textContent = messageValue;
    }
  }

  function renderPublicStatusUnavailable() {
    if (publicServiceBadge) {
      publicServiceBadge.textContent = t('site_status_unavailable', 'Status unavailable');
      publicServiceBadge.className = 'status-badge error';
    }
    if (publicServicePublished) {
      publicServicePublished.textContent = t('site_status_unavailable_desc', 'The public service status could not be loaded right now.');
    }
    if (publicServiceMessage) {
      publicServiceMessage.textContent = t('site_status_message_fallback', 'The public service message could not be loaded right now.');
    }
  }

  async function syncPublicServiceStatus() {
    if (!navStatusDots.length && !publicServiceBadge && !publicServicePublished && !publicServiceMessage) {
      return;
    }

    try {
      const results = await Promise.allSettled([
        fetchPublicServiceStatus(),
        fetchLatestPublicRelease()
      ]);
      const statusRow = results[0].status === 'fulfilled' ? results[0].value : null;
      const release = results[1].status === 'fulfilled' ? results[1].value : null;

      if (!statusRow) {
        throw results[0].reason || new Error('Unable to load public service status.');
      }
      const normalizedState = statusRow && statusRow.injection_state === 'ok' ? 'ok' : 'maintenance';
      const message = (statusRow && statusRow.service_message) || getDefaultPublicServiceMessage(normalizedState);
      publicStatusLoadFailed = false;
      lastPublicStatusRow = statusRow;
      lastPublicRelease = release;

      setNavStatusState(normalizedState, message);

      if (publicServiceBadge || publicServicePublished || publicServiceMessage) {
        renderPublicStatusPage(statusRow, release);
      }
    } catch (_err) {
      publicStatusLoadFailed = true;
      setNavStatusState('maintenance', t('site_status_unavailable', 'Status unavailable'));
      renderPublicStatusUnavailable();
    }
  }

  syncPublicServiceStatus();

  document.addEventListener('riftskin:language-changed', function () {
    if (publicStatusLoadFailed) {
      renderPublicStatusUnavailable();
      return;
    }
    if (publicServiceBadge || publicServicePublished || publicServiceMessage) {
      renderPublicStatusPage(lastPublicStatusRow, lastPublicRelease);
    }
  });

  const premiumCtas = Array.from(document.querySelectorAll('[data-home-premium-cta], [data-premium-cta]'));
  const pricingAck = document.querySelector('[data-pricing-ack]');
  const pricingAckRow = document.querySelector('[data-pricing-ack-row]');
  const pricingPremiumCta = document.querySelector('[data-premium-cta]');

  function setPremiumCtaState(state) {
    if (!premiumCtas.length) return;
    premiumCtas.forEach(function (premiumCta) {
      let key = 'site_pricing_premium_cta';
      if (premiumCta.hasAttribute('data-home-premium-cta')) {
        key = state === 'premium' ? 'site_home_manage_cta' : 'site_pricing_premium_cta';
      } else if (state === 'premium') {
        key = 'site_pricing_manage_cta';
      } else if (state === 'guest') {
        key = 'site_pricing_signin_cta';
      }
      if (window.RiftSkinI18n && typeof window.RiftSkinI18n.t === 'function') {
        premiumCta.textContent = window.RiftSkinI18n.t(key);
      }
      premiumCta.setAttribute('data-i18n', key);
    });
  }

  function setPricingAckVisibility(visible) {
    if (!pricingAckRow || !pricingAck) return;
    pricingAckRow.style.display = visible ? '' : 'none';
    if (!visible) {
      pricingAck.checked = false;
    }
  }

  function syncPricingAckState(forceEnabled) {
    if (!pricingAck || !pricingPremiumCta) return;
    const enabled = forceEnabled === true || !!pricingAck.checked;
    pricingPremiumCta.classList.toggle('is-disabled', !enabled);
    pricingPremiumCta.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    pricingPremiumCta.tabIndex = enabled ? 0 : -1;
  }

  async function syncHomePremiumCta() {
    if (!premiumCtas.length || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      setPremiumCtaState('guest');
      setPricingAckVisibility(true);
      syncPricingAckState(false);
      return;
    }

    try {
      const supabaseClient = getSharedSupabaseClient();
      if (!supabaseClient) {
        setPremiumCtaState('guest');
        setPricingAckVisibility(true);
        syncPricingAckState(false);
        return;
      }
      const sessionResult = await supabaseClient.auth.getSession();
      const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;

      if (!session || !session.user) {
        setPremiumCtaState('guest');
        setPricingAckVisibility(true);
        syncPricingAckState(false);
        return;
      }

      const accessResult = await supabaseClient.rpc('get_client_access_state', {
        p_trial_days: cfg.trialDays || 7
      });

      const rows = accessResult && accessResult.data;
      const row = Array.isArray(rows) ? rows[0] : null;
      const accessSource = row && row.access_source ? String(row.access_source).trim().toLowerCase() : '';
      const hasPremium = !!(row && (row.is_admin || (row.access_granted && (
        accessSource === 'activation_key' ||
        accessSource === 'admin_grant' ||
        accessSource === 'subscription_canceled'
      ))));
      setPremiumCtaState(hasPremium ? 'premium' : 'no_subscription');
      setPricingAckVisibility(!hasPremium);
      syncPricingAckState(hasPremium);
    } catch (_err) {
      setPremiumCtaState('guest');
      setPricingAckVisibility(true);
      syncPricingAckState(false);
    }
  }

  setPremiumCtaState('guest');
  setPricingAckVisibility(true);
  syncPricingAckState(false);
  syncHomePremiumCta();

  premiumCtas.forEach(function (premiumCta) {
    premiumCta.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      if (
        premiumCta === pricingPremiumCta &&
        pricingAck &&
        pricingAckRow &&
        pricingAckRow.style.display !== 'none' &&
        !pricingAck.checked
      ) return;
    });
  });

  if (pricingAck && pricingPremiumCta) {
    pricingAck.addEventListener('change', function () {
      syncPricingAckState(false);
    });
    pricingPremiumCta.addEventListener('click', function (event) {
      if (pricingAckRow && pricingAckRow.style.display === 'none') return;
      if (pricingAck.checked) return;
      event.preventDefault();
      pricingAck.focus();
    });
  }

  const productTour = document.querySelector('[data-product-tour]');
  const productVideo = document.querySelector('[data-product-video]');
  const productProgressFill = document.querySelector('[data-product-progress-fill]');
  const productProgressTrack = document.querySelector('[data-product-progress-track]');

  if (productTour && productVideo && productProgressTrack) {
    let rafId = 0;
    let isDraggingProgress = false;
    let pendingProgress = null;
    let isPrimingVideo = false;
    let hasPrimedVideo = false;
    const initialTourRect = productTour.getBoundingClientRect();
    let isTourVisible = !('IntersectionObserver' in window)
      || (initialTourRect.bottom > 0 && initialTourRect.top < window.innerHeight);

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function formatTime(seconds) {
      const safeSeconds = Math.max(0, Math.floor(seconds || 0));
      const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
      const remainder = String(safeSeconds % 60).padStart(2, '0');
      return minutes + ':' + remainder;
    }

    function getCurrentProgress() {
      if (!productVideo.duration) return 0;
      return clamp((productVideo.currentTime || 0) / productVideo.duration, 0, 1);
    }

    function setTourUi(progress) {
      const safeProgress = clamp(progress || 0, 0, 1);
      if (productProgressFill) {
        productProgressFill.style.transform = 'scaleX(' + safeProgress + ')';
      }
      productProgressTrack.setAttribute('aria-valuenow', String(Math.round(safeProgress * 100)));
    }

    function isScrollScrubMode() {
      return !reducedMotion && window.innerWidth > 860;
    }

    function getTourProgressFromScroll() {
      const rect = productTour.getBoundingClientRect();
      const travel = Math.max(productTour.offsetHeight - window.innerHeight, 1);
      return clamp(-rect.top / travel, 0, 1);
    }

    function canScrubVideo() {
      return !!(productVideo.duration && Number.isFinite(productVideo.duration) && productVideo.readyState >= 2);
    }

    function setTourProgress(progress) {
      const safeProgress = clamp(progress, 0, 1);
      if (!canScrubVideo()) {
        pendingProgress = safeProgress;
        setTourUi(safeProgress);
        return;
      }
      pendingProgress = null;
      const targetTime = safeProgress >= 1
        ? Math.max(productVideo.duration - 0.016, 0)
        : safeProgress * productVideo.duration;
      if (Math.abs((productVideo.currentTime || 0) - targetTime) > 0.033) {
        try {
          productVideo.currentTime = targetTime;
        } catch (_err) {
          setTourUi(safeProgress);
          return safeProgress;
        }
      }
      setTourUi(safeProgress);
      return safeProgress;
    }

    function syncTourFromScroll() {
      if (!isScrollScrubMode() || isDraggingProgress || !isTourVisible) return;
      if (!canScrubVideo()) {
        pendingProgress = getTourProgressFromScroll();
        setTourUi(pendingProgress);
        primeVideoForScrub();
        return;
      }
      setTourProgress(getTourProgressFromScroll());
    }

    function requestTourSync() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(function () {
        rafId = 0;
        syncTourFromScroll();
      });
    }

    function setTourProgressFromPointer(clientX) {
      const rect = productProgressTrack.getBoundingClientRect();
      if (!rect.width) return;
      const progress = (clientX - rect.left) / rect.width;
      setTourProgress(progress);
    }

    async function primeVideoForScrub(force) {
      if (document.hidden || isPrimingVideo) return;
      if (!force && hasPrimedVideo && canScrubVideo()) return;
      isPrimingVideo = true;
      let warmedUp = false;
      try {
        if (canScrubVideo() && productVideo.duration && (productVideo.currentTime || 0) >= productVideo.duration - 0.016) {
          productVideo.currentTime = Math.max(productVideo.duration - 0.032, 0);
        }
        const playResult = productVideo.play();
        if (playResult && typeof playResult.then === 'function') {
          await playResult;
        }
        warmedUp = true;
      } catch (_err) {
        // Ignore autoplay warm-up failures and keep the fallback scrub path.
      } finally {
        productVideo.pause();
        isPrimingVideo = false;
        hasPrimedVideo = warmedUp || canScrubVideo();
      }
    }

    function applyProductTourMode() {
      productVideo.muted = true;
      productVideo.playsInline = true;
      if (!canScrubVideo()) {
        setTourUi(pendingProgress !== null ? pendingProgress : 0);
        if (isScrollScrubMode()) {
          primeVideoForScrub();
        }
        return;
      }
      if (pendingProgress !== null) {
        setTourProgress(pendingProgress);
      }
      if (isScrollScrubMode()) {
        productVideo.loop = false;
        primeVideoForScrub();
        productVideo.pause();
        if (isTourVisible) {
          requestTourSync();
        }
        return;
      }

      productVideo.loop = true;
      setTourUi((productVideo.currentTime || 0) / productVideo.duration);
      productVideo.play().catch(function () {});
    }

    function syncTourWhenReady() {
      applyProductTourMode();
      requestTourSync();
    }

    productVideo.addEventListener('loadedmetadata', syncTourWhenReady);
    productVideo.addEventListener('loadeddata', syncTourWhenReady);
    productVideo.addEventListener('canplay', syncTourWhenReady);
    productVideo.addEventListener('canplaythrough', syncTourWhenReady);
    productVideo.addEventListener('durationchange', syncTourWhenReady);

    productVideo.addEventListener('timeupdate', function () {
      if (isScrollScrubMode() || !productVideo.duration) return;
      setTourUi((productVideo.currentTime || 0) / productVideo.duration);
    });

    productVideo.addEventListener('ended', function () {
      if (!isScrollScrubMode() || !productVideo.duration) return;
      setTourProgress(getTourProgressFromScroll());
    });

    productProgressTrack.addEventListener('pointerdown', function (event) {
      isDraggingProgress = true;
      productProgressTrack.setPointerCapture(event.pointerId);
      setTourProgressFromPointer(event.clientX);
    });

    productProgressTrack.addEventListener('pointermove', function (event) {
      if (!isDraggingProgress) return;
      setTourProgressFromPointer(event.clientX);
    });

    productProgressTrack.addEventListener('pointerup', function (event) {
      isDraggingProgress = false;
      if (productProgressTrack.hasPointerCapture(event.pointerId)) {
        productProgressTrack.releasePointerCapture(event.pointerId);
      }
    });

    productProgressTrack.addEventListener('pointercancel', function (event) {
      isDraggingProgress = false;
      if (productProgressTrack.hasPointerCapture(event.pointerId)) {
        productProgressTrack.releasePointerCapture(event.pointerId);
      }
    });

    productProgressTrack.addEventListener('keydown', function (event) {
      if (!productVideo.duration) return;
      let handled = true;
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        setTourProgress(getCurrentProgress() + 0.03);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        setTourProgress(getCurrentProgress() - 0.03);
      } else if (event.key === 'Home') {
        setTourProgress(0);
      } else if (event.key === 'End') {
        setTourProgress(1);
      } else {
        handled = false;
      }
      if (handled) event.preventDefault();
    });

    window.addEventListener('scroll', requestTourSync, { passive: true });
    window.addEventListener('resize', function () {
      applyProductTourMode();
      requestTourSync();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        productVideo.pause();
        return;
      }
      hasPrimedVideo = canScrubVideo();
      if (!hasPrimedVideo) {
        try {
          productVideo.load();
        } catch (_err) {}
      }
      applyProductTourMode();
    });

    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        hasPrimedVideo = canScrubVideo();
        if (!hasPrimedVideo) {
          try {
            productVideo.load();
          } catch (_err) {}
        }
      }
      applyProductTourMode();
      requestTourSync();
    });

    if (productVideo.readyState >= 1) {
      syncTourWhenReady();
    } else {
      try {
        productVideo.load();
      } catch (_err) {}
    }

    if ('IntersectionObserver' in window) {
      const productTourObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          const becameVisible = entry.isIntersecting && entry.intersectionRatio > 0.12;
          isTourVisible = becameVisible;

          if (!becameVisible) {
            if (isScrollScrubMode()) {
              productVideo.pause();
            }
            return;
          }

          if (isScrollScrubMode()) {
            if (canScrubVideo()) {
              setTourProgress(getTourProgressFromScroll());
            } else {
              pendingProgress = getTourProgressFromScroll();
              setTourUi(pendingProgress);
            }
            primeVideoForScrub(true);
            requestTourSync();
            return;
          }

          applyProductTourMode();
        });
      }, {
        threshold: [0, 0.12, 0.35]
      });

      productTourObserver.observe(productTour);
    }
  }

  if (!reducedMotion && 'IntersectionObserver' in window) {
    const revealed = document.querySelectorAll('[data-reveal]');
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.18,
      rootMargin: '0px 0px -8% 0px'
    });

    revealed.forEach(function (el, index) {
      el.style.transitionDelay = Math.min(index * 35, 280) + 'ms';
      observer.observe(el);
    });
  } else {
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      el.classList.add('is-visible');
    });
  }

})();
