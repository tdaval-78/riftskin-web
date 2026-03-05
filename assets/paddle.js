(function () {
  const cfg = window.RiftSkinConfig || {};
  const alertEls = document.querySelectorAll('[data-checkout-alert]');

  function t(key) {
    return window.RiftSkinI18n ? window.RiftSkinI18n.t(key) : key;
  }

  function setAlert(text, kind) {
    alertEls.forEach(function (el) {
      el.textContent = text;
      el.className = 'alert msg ' + (kind || '');
      el.style.display = text ? 'block' : 'none';
    });
  }

  function getEmailInputValue() {
    const emailInput = document.querySelector('[data-account-email]');
    if (!emailInput) return undefined;
    const val = emailInput.value.trim();
    return val || undefined;
  }

  async function ensurePaddleLoaded() {
    if (window.Paddle) return true;
    return new Promise(function (resolve) {
      const s = document.createElement('script');
      s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js';
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
  }

  async function openPaddleCheckout() {
    if (cfg.paddleCheckoutUrl) {
      window.location.href = cfg.paddleCheckoutUrl;
      return;
    }

    if (!cfg.paddleClientToken || !cfg.paddlePriceId) {
      setAlert(t('msg_checkout_not_configured'), 'error');
      return;
    }

    const loaded = await ensurePaddleLoaded();
    if (!loaded || !window.Paddle) {
      setAlert(t('msg_checkout_script_failed'), 'error');
      return;
    }

    try {
      if (cfg.paddleEnvironment === 'sandbox' && window.Paddle.Environment) {
        window.Paddle.Environment.set('sandbox');
      }
      window.Paddle.Initialize({ token: cfg.paddleClientToken });
      window.Paddle.Checkout.open({
        items: [{ priceId: cfg.paddlePriceId, quantity: 1 }],
        customer: { email: getEmailInputValue() },
        customData: { source: 'riftskin-web' }
      });
      setAlert('');
    } catch (err) {
      setAlert((err && err.message) ? err.message : t('msg_checkout_open_failed'), 'error');
    }
  }

  document.querySelectorAll('[data-subscribe]').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      openPaddleCheckout();
    });
  });
})();
