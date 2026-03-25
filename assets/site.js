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
  const productProgressFill = document.querySelector('[data-product-progress-fill]');
  const productProgressValue = document.querySelector('[data-product-progress-value]');
  const productProgressTime = document.querySelector('[data-product-progress-time]');

  if (productTour && productVideo) {
    let rafId = 0;

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    function formatTime(seconds) {
      const safeSeconds = Math.max(0, Math.floor(seconds || 0));
      const minutes = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
      const remainder = String(safeSeconds % 60).padStart(2, '0');
      return minutes + ':' + remainder;
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
    }

    function isScrollScrubMode() {
      return !reducedMotion && window.innerWidth > 860;
    }

    function getTourProgressFromScroll() {
      const rect = productTour.getBoundingClientRect();
      const travel = Math.max(productTour.offsetHeight - window.innerHeight, 1);
      return clamp(-rect.top / travel, 0, 1);
    }

    function syncTourFromScroll() {
      if (!isScrollScrubMode() || !productVideo.duration) return;
      const progress = getTourProgressFromScroll();
      const targetTime = progress * productVideo.duration;
      if (Math.abs((productVideo.currentTime || 0) - targetTime) > 0.033) {
        try {
          productVideo.currentTime = targetTime;
        } catch (_err) {
          return;
        }
      }
      setTourUi(progress);
    }

    function requestTourSync() {
      if (rafId) return;
      rafId = window.requestAnimationFrame(function () {
        rafId = 0;
        syncTourFromScroll();
      });
    }

    function applyProductTourMode() {
      if (!productVideo.duration) return;
      productVideo.muted = true;
      productVideo.playsInline = true;
      if (isScrollScrubMode()) {
        productVideo.loop = false;
        productVideo.pause();
        requestTourSync();
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
      if (isScrollScrubMode() || !productVideo.duration) return;
      setTourUi((productVideo.currentTime || 0) / productVideo.duration);
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
