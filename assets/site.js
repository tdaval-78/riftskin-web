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

  const premiumCta = document.querySelector('[data-home-premium-cta]');

  function setPremiumCtaState(isPremium) {
    if (!premiumCta) return;
    const key = isPremium ? 'site_home_manage_cta' : 'site_pricing_premium_cta';
    if (window.RiftSkinI18n && typeof window.RiftSkinI18n.t === 'function') {
      premiumCta.textContent = window.RiftSkinI18n.t(key);
    }
    premiumCta.setAttribute('data-i18n', key);
  }

  async function syncHomePremiumCta() {
    if (!premiumCta || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
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
