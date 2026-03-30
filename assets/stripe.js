(function () {
  const cfg = window.RiftSkinConfig || {};
  const authStorage = window.localStorage || window.sessionStorage;
  const pageStorage = window.sessionStorage;
  const alertEls = document.querySelectorAll('[data-checkout-alert]');
  const subscribeBtns = Array.from(document.querySelectorAll('[data-subscribe], [data-premium-cta]'));
  const portalBtns = Array.from(document.querySelectorAll('[data-open-billing-portal]'));
  const PENDING_CHECKOUT_KEY = 'riftskin_stripe_checkout_pending';

  function t(key, fallback) {
    if (window.RiftSkinI18n && typeof window.RiftSkinI18n.t === 'function') {
      const translated = window.RiftSkinI18n.t(key);
      return translated === key && typeof fallback === 'string' ? fallback : translated;
    }
    return typeof fallback === 'string' ? fallback : key;
  }

  function setAlert(text, kind) {
    alertEls.forEach(function (el) {
      el.textContent = text || '';
      el.className = 'alert msg ' + (kind || '');
      el.style.display = text ? 'block' : 'none';
    });
  }

  function markCheckoutPending() {
    if (!pageStorage) return;
    pageStorage.setItem(PENDING_CHECKOUT_KEY, '1');
  }

  function clearCheckoutPending() {
    if (!pageStorage) return;
    pageStorage.removeItem(PENDING_CHECKOUT_KEY);
  }

  function createSupabaseClient() {
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  }

  const supabaseClient = createSupabaseClient();

  async function getSession() {
    if (!supabaseClient) return null;
    const result = await supabaseClient.auth.getSession();
    return result && result.data ? result.data.session : null;
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function waitForSession(maxAttempts, waitMs) {
    let attempt = 0;
    while (attempt < maxAttempts) {
      const session = await getSession();
      if (session && session.user) return session;
      attempt += 1;
      if (attempt < maxAttempts) {
        await delay(waitMs);
      }
    }
    return null;
  }

  function absoluteUrl(path, fallbackPath) {
    const target = path || fallbackPath || '/account.html';
    return new URL(target, window.location.origin).toString();
  }

  function redirectToAccountSignIn() {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = '/account.html?checkout=signin&next=' + next;
  }

  async function invokeFunction(name, body) {
    if (!supabaseClient) {
      throw new Error(t('msg_status_supabase_missing', 'Supabase is not configured.'));
    }
    const result = await supabaseClient.functions.invoke(name, {
      body: body || {}
    });
    if (result.error) throw result.error;
    return result.data || {};
  }

  async function openCheckout() {
    if (cfg.billingProvider !== 'stripe') {
      setAlert(t('msg_checkout_not_configured'), 'error');
      return;
    }

    const session = await getSession();
    if (!session || !session.user) {
      redirectToAccountSignIn();
      return;
    }

    setAlert('');
    try {
      const data = await invokeFunction('create-stripe-checkout-session', {
        successUrl: absoluteUrl(cfg.stripeCheckoutSuccessUrl, '/account.html?checkout=success'),
        cancelUrl: absoluteUrl(cfg.stripeCheckoutCancelUrl, '/pricing.html?checkout=canceled')
      });

      if (!data.url) {
        throw new Error(t('msg_checkout_open_failed', 'Unable to open checkout.'));
      }

      markCheckoutPending();
      window.location.href = data.url;
    } catch (err) {
      const message = (err && err.message) ? err.message : t('msg_checkout_open_failed', 'Unable to open checkout.');
      if (/not_authenticated/i.test(message)) {
        redirectToAccountSignIn();
        return;
      }
      setAlert(message, 'error');
    }
  }

  async function openPortal() {
    if (cfg.billingProvider !== 'stripe') {
      setAlert(t('msg_portal_missing'), 'error');
      return;
    }

    const session = await getSession();
    if (!session || !session.user) {
      redirectToAccountSignIn();
      return;
    }

    setAlert('');
    try {
      const data = await invokeFunction('create-stripe-portal-session', {
        returnUrl: absoluteUrl(cfg.stripeBillingReturnUrl, '/account.html')
      });

      if (!data.url) {
        throw new Error(t('msg_portal_missing', 'Customer portal URL is not configured yet.'));
      }

      window.location.href = data.url;
    } catch (err) {
      const message = (err && err.message) ? err.message : t('msg_portal_missing', 'Customer portal URL is not configured yet.');
      if (/not_authenticated/i.test(message)) {
        redirectToAccountSignIn();
        return;
      }
      setAlert(message, 'error');
    }
  }

  async function reconcileSubscription() {
    if (!supabaseClient) return false;
    const session = await waitForSession(6, 1000);
    if (!session || !session.user) return false;

    let attempt = 0;
    while (attempt < 6) {
      try {
        const data = await invokeFunction('stripe-reconcile-subscription', {});
        if (data && data.ok) {
          clearCheckoutPending();
          const url = new URL(window.location.href);
          url.searchParams.delete('checkout');
          window.location.replace(url.toString());
          return true;
        }
      } catch (_err) {
        // Leave the processing message visible while retries are still in progress.
      }

      attempt += 1;
      if (attempt < 6) {
        await delay(5000);
      }
    }

    setAlert('Payment received but premium activation is still pending. Refresh the page in a few seconds. If it still does not appear, contact support.', 'warning');
    return false;
  }

  subscribeBtns.forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      event.preventDefault();

      const currentKey = btn.getAttribute('data-i18n');
      if (
        currentKey === 'site_home_manage_cta' ||
        currentKey === 'site_pricing_manage_cta' ||
        currentKey === 'account_manage_sub'
      ) {
        openPortal();
        return;
      }

      openCheckout();
    });
  });

  portalBtns.forEach(function (btn) {
    btn.addEventListener('click', function (event) {
      if (event.defaultPrevented) return;
      event.preventDefault();
      openPortal();
    });
  });

  const params = new URLSearchParams(window.location.search);
  const checkoutState = params.get('checkout');
  if (checkoutState === 'success') {
    markCheckoutPending();
    setAlert('Payment received. Your premium access is being activated. If the key does not appear within a minute, refresh the page.', 'ok');
    reconcileSubscription();
  } else if (checkoutState === 'canceled') {
    clearCheckoutPending();
    setAlert('Checkout canceled.', '');
  } else if (checkoutState === 'signin') {
    setAlert('Sign in or create your account first to continue with Stripe checkout.', '');
  }
})();
