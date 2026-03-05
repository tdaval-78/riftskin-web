(function () {
  const cfg = window.RiftSkinConfig || {};
  const alertEls = document.querySelectorAll('[data-checkout-alert]');

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
      setAlert('Checkout is not configured yet. Add your Paddle token/price in assets/config.js.', 'error');
      return;
    }

    const loaded = await ensurePaddleLoaded();
    if (!loaded || !window.Paddle) {
      setAlert('Unable to load Paddle checkout script.', 'error');
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
      setAlert((err && err.message) ? err.message : 'Unable to open checkout.', 'error');
    }
  }

  document.querySelectorAll('[data-subscribe]').forEach(function (btn) {
    btn.addEventListener('click', function (ev) {
      ev.preventDefault();
      openPaddleCheckout();
    });
  });
})();
