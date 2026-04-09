(function () {
  window.dataLayer = window.dataLayer || [];
  const cfg = window.RiftSkinConfig || {};
  const supabaseUrl = cfg.supabaseUrl || '';
  const supabaseAnonKey = cfg.supabaseAnonKey || '';
  const authStorage = window.localStorage || window.sessionStorage;
  const pageStorage = window.sessionStorage;
  const PENDING_CHECKOUT_KEY = 'riftskin_stripe_checkout_pending';

  const statusEl = document.querySelector('[data-order-status]');
  const licenseCodeEl = document.querySelector('[data-license-code]');
  const licenseMetaEl = document.querySelector('[data-license-meta]');
  const i18n = window.RiftSkinI18n;
  let checkoutSuccessTracked = false;

  function pushAnalyticsEvent(eventName, params) {
    if (!eventName) return;
    const payload = Object.assign({
      event: eventName,
      page_type: 'checkout_success',
      page_path: window.location.pathname
    }, params || {});
    window.dataLayer.push(payload);
    if (typeof window.gtag === 'function') {
      const gaPayload = Object.assign({}, payload);
      delete gaPayload.event;
      try {
        window.gtag('event', eventName, gaPayload);
      } catch (_err) {
        // Keep dataLayer tracking even if the global gtag helper is unavailable or fails.
      }
    }
  }

  function trackCheckoutSuccess(meta) {
    if (checkoutSuccessTracked) return;
    checkoutSuccessTracked = true;
    pushAnalyticsEvent('riftskin_checkout_success', meta || {});
  }

  function normalizeLanguage(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'fr' || normalized === 'en' || normalized === 'es' || normalized === 'pt') return normalized;
    return '';
  }

  function requestedLanguageFromUrl() {
    const query = new URLSearchParams(window.location.search);
    const queryLang = normalizeLanguage(query.get('lang'));
    if (queryLang) return queryLang;
    return '';
  }

  const requestedLanguage = requestedLanguageFromUrl();
  if (requestedLanguage && i18n && typeof i18n.setLanguage === 'function') {
    i18n.setLanguage(requestedLanguage, true);
  }

  function t(key, fallback) {
    if (!i18n || typeof i18n.t !== 'function') return fallback || key;
    const translated = i18n.t(key);
    return translated === key ? (fallback || key) : translated;
  }

  function setStatus(type, text) {
    if (!statusEl) return;
    statusEl.className = 'msg ' + (type || '');
    statusEl.textContent = text || '';
  }

  function setLicense(code, meta) {
    if (licenseCodeEl) licenseCodeEl.textContent = code || t('order_confirm_license_pending', 'Searching for your license...');
    if (licenseMetaEl) licenseMetaEl.textContent = meta || '';
  }

  function clearPendingCheckout() {
    if (!pageStorage) return;
    pageStorage.removeItem(PENDING_CHECKOUT_KEY);
  }

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  async function invokeFunction(name, body, session) {
    const headers = {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey
    };

    if (session && session.access_token) {
      headers.Authorization = 'Bearer ' + session.access_token;
    }

    const response = await fetch(supabaseUrl.replace(/\/+$/, '') + '/functions/v1/' + name, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body || {})
    });

    const payload = await response.json().catch(function () { return null; });
    if (!response.ok) {
      throw new Error((payload && (payload.detail || payload.message || payload.error)) || ('Edge Function returned status ' + response.status));
    }

    return payload || {};
  }

  async function waitForSession(supabaseClient, maxAttempts, waitMs) {
    let attempt = 0;
    while (attempt < maxAttempts) {
      const result = await supabaseClient.auth.getSession();
      const session = result && result.data ? result.data.session : null;
      if (session && session.user) return session;
      attempt += 1;
      if (attempt < maxAttempts) {
        await new Promise(function (resolve) {
          window.setTimeout(resolve, waitMs);
        });
      }
    }
    return null;
  }

  async function loadSummary(session) {
    return invokeFunction('account-subscription-summary', {}, session);
  }

  async function reconcileSubscription(session) {
    return invokeFunction('stripe-reconcile-subscription', {}, session);
  }

  async function init() {
    if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
      setStatus('error', t('order_confirm_status_error', 'Unable to confirm your order automatically right now. Open your account to refresh the subscription status.'));
      setLicense(t('order_confirm_license_missing', 'Your license is still being prepared. If it does not appear within a minute, open your account and it will refresh automatically.'), '');
      return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });

    setStatus('', t('order_confirm_status_processing', 'Confirming your order and synchronizing your Premium access...'));
    setLicense(t('order_confirm_license_pending', 'Searching for your license...'), '');

    const session = await waitForSession(supabaseClient, 8, 1000);
    if (!session || !session.user) {
      setStatus('warning', t('order_confirm_status_signin', 'Sign in to your account to display your order confirmation and Premium license.'));
      setLicense(t('order_confirm_license_missing', 'Your license is still being prepared. If it does not appear within a minute, open your account and it will refresh automatically.'), '');
      return;
    }

    let attempt = 0;
    while (attempt < 8) {
      try {
        const reconcile = await reconcileSubscription(session);
        if (reconcile && reconcile.ok && reconcile.activationKeyCode) {
          clearPendingCheckout();
          const summaryResponse = await loadSummary(session);
          const summary = summaryResponse && summaryResponse.subscription ? summaryResponse.subscription : null;
          trackCheckoutSuccess({
            access_source: 'reconcile',
            has_license: true
          });
          setLicense(
            reconcile.activationKeyCode,
            summary && summary.currentPeriodEndsAt ? formatDate(summary.currentPeriodEndsAt) : ''
          );
          setStatus('ok', t('order_confirm_status_ready', 'Order confirmed. Your Premium license is active.'));
          return;
        }

        const summaryResponse = await loadSummary(session);
        const summary = summaryResponse && summaryResponse.subscription ? summaryResponse.subscription : null;
        if (summary && summary.activationKeyCode) {
          clearPendingCheckout();
          trackCheckoutSuccess({
            access_source: 'summary',
            has_license: true
          });
          setLicense(
            summary.activationKeyCode,
            summary.currentPeriodEndsAt ? formatDate(summary.currentPeriodEndsAt) : ''
          );
          setStatus('ok', t('order_confirm_status_ready', 'Order confirmed. Your Premium license is active.'));
          return;
        }
      } catch (_err) {
        // Continue polling while Stripe/webhook propagation finishes.
      }

      attempt += 1;
      if (attempt < 8) {
        setStatus('warning', t('order_confirm_status_waiting', 'Payment received. Your Premium access is still being activated. Please wait a few seconds.'));
        await new Promise(function (resolve) {
          window.setTimeout(resolve, 4000);
        });
      }
    }

    setLicense(t('order_confirm_license_missing', 'Your license is still being prepared. If it does not appear within a minute, open your account and it will refresh automatically.'), '');
    setStatus('warning', t('order_confirm_status_error', 'Unable to confirm your order automatically right now. Open your account to refresh the subscription status.'));
  }

  init();
})();
