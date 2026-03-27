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

  const active = document.body.getAttribute('data-page');
  if (active) {
    document.querySelectorAll('[data-link]').forEach(function (el) {
      if (el.getAttribute('data-link') === active) {
        el.classList.add('active');
      }
    });
  }

  const navStatusDots = Array.from(document.querySelectorAll('[data-site-status-dot]'));
  const publicServiceBadge = document.querySelector('[data-public-service-badge]');
  const publicServicePublished = document.querySelector('[data-public-service-published]');
  const publicServiceMessage = document.querySelector('[data-public-service-message]');
  let lastPublicStatusRow = null;
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
        label: 'INJECTION & SOFTWARE FUNCTIONAL',
        kind: 'ok',
        dot: 'ok'
      };
    }

    return {
      label: 'INJECTION CURRENTLY BEING PATCHED BY OUR TEAM',
      kind: 'warning',
      dot: 'warning'
    };
  }

  function getDefaultPublicServiceMessage(state) {
    if (state === 'ok') {
      return 'Skin injection is currently functional.';
    }
    return 'Skin injection is currently unavailable. Our team is actively working on a compatibility update.';
  }

  function formatPublicTimestamp(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
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

  function renderPublicStatusPage(row) {
    if (!publicServiceBadge && !publicServicePublished && !publicServiceMessage) return;

    const normalizedState = row && row.injection_state === 'ok' ? 'ok' : 'maintenance';
    const info = getPublicServiceStateInfo(normalizedState);
    const publishedValue = row && row.published_at
      ? (t('site_status_live_since', 'Live since') + ' ' + formatPublicTimestamp(row.published_at))
      : t('site_status_published_empty', 'No public status published yet.');
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
      const statusRow = await fetchPublicServiceStatus();
      const normalizedState = statusRow && statusRow.injection_state === 'ok' ? 'ok' : 'maintenance';
      const message = (statusRow && statusRow.service_message) || getDefaultPublicServiceMessage(normalizedState);
      publicStatusLoadFailed = false;
      lastPublicStatusRow = statusRow;

      setNavStatusState(normalizedState, message);

      if (publicServiceBadge || publicServicePublished || publicServiceMessage) {
        renderPublicStatusPage(statusRow);
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
      renderPublicStatusPage(lastPublicStatusRow);
    }
  });

  const premiumCtas = Array.from(document.querySelectorAll('[data-home-premium-cta], [data-premium-cta]'));

  function setPremiumCtaState(isPremium) {
    if (!premiumCtas.length) return;
    premiumCtas.forEach(function (premiumCta) {
      const key = premiumCta.hasAttribute('data-home-premium-cta')
        ? (isPremium ? 'site_home_manage_cta' : 'site_pricing_premium_cta')
        : (isPremium ? 'site_pricing_manage_cta' : 'site_pricing_premium_cta');
      if (window.RiftSkinI18n && typeof window.RiftSkinI18n.t === 'function') {
        premiumCta.textContent = window.RiftSkinI18n.t(key);
      }
      premiumCta.setAttribute('data-i18n', key);
    });
  }

  async function syncHomePremiumCta() {
    if (!premiumCtas.length || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      setPremiumCtaState(false);
      return;
    }

    try {
      const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          storage: window.sessionStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
      const sessionResult = await supabaseClient.auth.getSession();
      const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;

      if (!session || !session.user) {
        setPremiumCtaState(false);
        return;
      }

      const accessResult = await supabaseClient.rpc('get_client_access_state', {
        p_trial_days: cfg.trialDays || 7
      });

      const rows = accessResult && accessResult.data;
      const row = Array.isArray(rows) ? rows[0] : null;
      const hasPremium = !!(row && (row.is_admin || (row.access_granted && (row.access_source === 'activation_key' || row.access_source === 'admin_grant'))));
      setPremiumCtaState(hasPremium);
    } catch (_err) {
      setPremiumCtaState(false);
    }
  }

  setPremiumCtaState(false);
  syncHomePremiumCta();

  const pricingAck = document.querySelector('[data-pricing-ack]');
  const pricingPremiumCta = document.querySelector('[data-premium-cta]');

  if (pricingAck && pricingPremiumCta) {
    function syncPricingAckState() {
      const checked = !!pricingAck.checked;
      pricingPremiumCta.classList.toggle('is-disabled', !checked);
      pricingPremiumCta.setAttribute('aria-disabled', checked ? 'false' : 'true');
      pricingPremiumCta.tabIndex = checked ? 0 : -1;
    }

    pricingAck.addEventListener('change', syncPricingAckState);
    pricingPremiumCta.addEventListener('click', function (event) {
      if (pricingAck.checked) return;
      event.preventDefault();
      pricingAck.focus();
    });

    syncPricingAckState();
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
      const targetTime = safeProgress * productVideo.duration;
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
      if (!isScrollScrubMode() || isDraggingProgress) return;
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

    async function primeVideoForScrub() {
      if (document.hidden || isPrimingVideo) return;
      if (hasPrimedVideo && canScrubVideo()) return;
      isPrimingVideo = true;
      let warmedUp = false;
      try {
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
        requestTourSync();
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
