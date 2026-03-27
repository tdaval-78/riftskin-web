(function () {
  const cfg = window.RiftSkinConfig || {};
  const supabaseUrl = cfg.supabaseUrl || '';
  const supabaseAnonKey = cfg.supabaseAnonKey || '';

  const confirmView = document.getElementById('confirm-view');
  const recoveryView = document.getElementById('recovery-view');
  const errorView = document.getElementById('error-view');
  const confirmMessageEl = document.getElementById('confirm-message');
  const errorCopyEl = document.getElementById('error-copy');
  const form = document.getElementById('reset-form');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm-password');
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('message');

  function t(key) {
    return window.RiftSkinI18n ? window.RiftSkinI18n.t(key) : key;
  }

  function setMessage(type, text) {
    if (!messageEl) return;
    messageEl.className = 'msg ' + (type || '');
    messageEl.textContent = text || '';
  }

  function setConfirmMessage(type, text) {
    if (!confirmMessageEl) return;
    confirmMessageEl.className = 'msg ' + (type || '');
    confirmMessageEl.textContent = text || '';
  }

  function showView(view) {
    if (confirmView) confirmView.classList.add('hidden');
    if (recoveryView) recoveryView.classList.add('hidden');
    if (errorView) errorView.classList.add('hidden');

    if (view === 'confirm' && confirmView) confirmView.classList.remove('hidden');
    if (view === 'recovery' && recoveryView) recoveryView.classList.remove('hidden');
    if (view === 'error' && errorView) errorView.classList.remove('hidden');
  }

  function parseParams() {
    const query = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const fragment = new URLSearchParams(hash);

    function pick(key) {
      return query.get(key) || fragment.get(key) || '';
    }

    return {
      accessToken: pick('access_token'),
      refreshToken: pick('refresh_token'),
      tokenHash: pick('token_hash'),
      type: pick('type'),
      error: pick('error'),
      errorCode: pick('error_code'),
      errorDescription: pick('error_description')
    };
  }

  function setErrorCopy(text) {
    if (!errorCopyEl) return;
    errorCopyEl.textContent = text || t('cb_error_p');
  }

  async function initRecoverySession(supabaseClient, params) {
    if (params.accessToken && params.refreshToken) {
      return supabaseClient.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken
      });
    }

    if (params.tokenHash) {
      return supabaseClient.auth.verifyOtp({
        token_hash: params.tokenHash,
        type: 'recovery'
      });
    }

    return { error: new Error(t('cb_invalid_reset')) };
  }

  async function initConfirmationSession(supabaseClient, params) {
    if (params.tokenHash && params.type) {
      return supabaseClient.auth.verifyOtp({
        token_hash: params.tokenHash,
        type: params.type
      });
    }

    if (params.accessToken && params.refreshToken) {
      return supabaseClient.auth.setSession({
        access_token: params.accessToken,
        refresh_token: params.refreshToken
      });
    }

    return { error: null };
  }

  function bindResetForm(supabaseClient) {
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setMessage('', '');

      const password = passwordInput ? passwordInput.value : '';
      const confirm = confirmInput ? confirmInput.value : '';

      if (password.length < 8) {
        setMessage('error', t('cb_pwd_min'));
        return;
      }
      if (password !== confirm) {
        setMessage('error', t('cb_pwd_mismatch'));
        return;
      }

      submitBtn.disabled = true;
      const { error: updateError } = await supabaseClient.auth.updateUser({ password: password });
      submitBtn.disabled = false;

      if (updateError) {
        setMessage('error', updateError.message || t('cb_pwd_update_failed'));
        return;
      }

      setMessage('ok', t('cb_pwd_updated'));
      form.reset();
    });
  }

  async function init() {
    if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
      showView('error');
      setErrorCopy(t('msg_status_supabase_missing'));
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const params = parseParams();
    if (params.error || params.errorCode) {
      showView('error');
      setErrorCopy(params.errorDescription || t('cb_error_p'));
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    if (params.type === 'recovery') {
      showView('recovery');
      const { error } = await initRecoverySession(supabaseClient, params);
      if (error) {
        showView('error');
        setErrorCopy(error.message || t('cb_invalid_reset'));
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      bindResetForm(supabaseClient);
      return;
    }

    showView('confirm');
    const { error } = await initConfirmationSession(supabaseClient, params);
    if (error) {
      showView('error');
      setErrorCopy(error.message || t('cb_confirm_failed'));
      return;
    }

    if (params.type === 'signup' || params.type === 'email_change' || params.tokenHash || params.accessToken) {
      setConfirmMessage('ok', t('cb_confirm_success'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
