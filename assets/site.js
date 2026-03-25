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
      const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
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

  const productTour = document.querySelector('[data-product-tour]');
  const productVideo = document.querySelector('[data-product-video]');
  const productScrub = document.querySelector('[data-product-scrub]');
  const productProgressFill = document.querySelector('[data-product-progress-fill]');
  const productProgressValue = document.querySelector('[data-product-progress-value]');
  const productProgressTime = document.querySelector('[data-product-progress-time]');
  const productProgressTrack = document.querySelector('[data-product-progress-track]');

  if (productTour && productVideo && productScrub && productProgressTrack) {
    let isDraggingProgress = false;
    let touchStartY = 0;
    let touchStartProgress = 0;

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
      if (productProgressValue) {
        productProgressValue.textContent = Math.round(safeProgress * 100) + '%';
      }
      if (productProgressTime) {
        productProgressTime.textContent = formatTime((productVideo.duration || 0) * safeProgress);
      }
      productProgressTrack.setAttribute('aria-valuenow', String(Math.round(safeProgress * 100)));
    }

    function isInteractiveScrubMode() {
      return !reducedMotion && window.innerWidth > 860;
    }

    function setTourProgress(progress) {
      const safeProgress = clamp(progress, 0, 1);
      if (!productVideo.duration) {
        setTourUi(safeProgress);
        return;
      }
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

    function setTourProgressFromPointer(clientX) {
      const rect = productProgressTrack.getBoundingClientRect();
      if (!rect.width) return;
      const progress = (clientX - rect.left) / rect.width;
      setTourProgress(progress);
    }

    function applyProductTourMode() {
      productVideo.muted = true;
      productVideo.playsInline = true;
      if (!productVideo.duration) {
        setTourUi(0);
        return;
      }
      if (isInteractiveScrubMode()) {
        productVideo.loop = false;
        productVideo.pause();
        setTourUi(getCurrentProgress());
        return;
      }

      productVideo.loop = true;
      setTourUi((productVideo.currentTime || 0) / productVideo.duration);
      productVideo.play().catch(function () {});
    }

    productVideo.addEventListener('loadedmetadata', function () {
      applyProductTourMode();
    });

    productVideo.addEventListener('timeupdate', function () {
      if (isInteractiveScrubMode() || !productVideo.duration) return;
      setTourUi((productVideo.currentTime || 0) / productVideo.duration);
    });

    productScrub.addEventListener('wheel', function (event) {
      if (!isInteractiveScrubMode() || !productVideo.duration) return;
      event.preventDefault();
      const delta = event.deltaY || event.deltaX || 0;
      const nextProgress = getCurrentProgress() + (delta / 1600);
      setTourProgress(nextProgress);
    }, { passive: false });

    productScrub.addEventListener('touchstart', function (event) {
      if (!isInteractiveScrubMode() || !productVideo.duration || !event.touches.length) return;
      touchStartY = event.touches[0].clientY;
      touchStartProgress = getCurrentProgress();
    }, { passive: true });

    productScrub.addEventListener('touchmove', function (event) {
      if (!isInteractiveScrubMode() || !productVideo.duration || !event.touches.length) return;
      event.preventDefault();
      const deltaY = touchStartY - event.touches[0].clientY;
      setTourProgress(touchStartProgress + (deltaY / 900));
    }, { passive: false });

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

    window.addEventListener('resize', function () {
      applyProductTourMode();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        productVideo.pause();
        return;
      }
      applyProductTourMode();
    });
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
