(function () {
  const cfg = window.RiftSkinConfig || {};
  const supabaseUrl = cfg.supabaseUrl || '';
  const supabaseAnonKey = cfg.supabaseAnonKey || '';

  const confirmView = document.getElementById('confirm-view');
  const recoveryView = document.getElementById('recovery-view');
  const errorView = document.getElementById('error-view');
  const confirmMessageEl = document.getElementById('confirm-message');
  const confirmTitleEl = document.getElementById('confirm-title');
  const confirmCopyEl = document.getElementById('confirm-copy');
  const confirmPanelCopyEl = document.getElementById('confirm-panel-copy');
  const errorCopyEl = document.getElementById('error-copy');
  const form = document.getElementById('reset-form');
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm-password');
  const submitBtn = document.getElementById('submit-btn');
  const messageEl = document.getElementById('message');

  const copy = {
    supabaseMissing: 'Supabase configuration is missing.',
    invalidReset: 'This recovery link is invalid or has expired. Please request a new password reset.',
    confirmFailed: 'Email confirmation failed. Please request a new confirmation email.',
    confirmSuccess: 'Email confirmed successfully. You can now sign in to your account.',
    emailChangeTitle: 'Email change confirmed.',
    emailChangeCopy: 'Your new email address is now active. Return to the RIFTSKIN account page and sign in with that new address.',
    emailChangePanelCopy: 'Return to the account page, sign in with your new email and password, and continue from there.',
    emailChangeSuccess: 'Email updated successfully. You can now sign in with your new address.',
    resetSessionFailed: 'The recovery session could not be initialized.',
    passwordMin: 'Your password must contain at least 8 characters.',
    passwordMismatch: 'The passwords do not match.',
    passwordUpdateFailed: 'Your password could not be updated.',
    passwordUpdated: 'Password updated successfully. Return to the account page and sign in with your new password.',
    genericError: 'This confirmation or recovery link is invalid, expired, or has already been used.'
  };

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

  function setConfirmCopy(title, body, panel) {
    if (confirmTitleEl) confirmTitleEl.textContent = title || '';
    if (confirmCopyEl) confirmCopyEl.textContent = body || '';
    if (confirmPanelCopyEl) confirmPanelCopyEl.textContent = panel || '';
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
    errorCopyEl.textContent = text || copy.genericError;
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

    return { error: new Error(copy.invalidReset) };
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

  async function clearConfirmationSession(supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (_error) {
      // Best-effort cleanup: confirmation should not leave the user signed in.
    }
  }

  async function clearRecoverySession(supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (_error) {
      // Best-effort cleanup: recovery should not leave the user signed in.
    }
  }

  function bindBackToAccountLinks(supabaseClient) {
    const links = document.querySelectorAll('a[href="/account.html"]');
    if (!links.length) return;

    links.forEach(function (link) {
      link.addEventListener('click', async function (event) {
        event.preventDefault();
        await clearRecoverySession(supabaseClient);
        window.location.href = link.getAttribute('href') || '/account.html';
      });
    });
  }

  function bindResetForm(supabaseClient) {
    if (!form || !submitBtn) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      setMessage('', '');

      const password = passwordInput ? passwordInput.value : '';
      const confirm = confirmInput ? confirmInput.value : '';

      if (password.length < 8) {
        setMessage('error', copy.passwordMin);
        return;
      }
      if (password !== confirm) {
        setMessage('error', copy.passwordMismatch);
        return;
      }

      submitBtn.disabled = true;
      const { error: updateError } = await supabaseClient.auth.updateUser({ password: password });
      submitBtn.disabled = false;

      if (updateError) {
        setMessage('error', updateError.message || copy.passwordUpdateFailed);
        return;
      }

      await clearRecoverySession(supabaseClient);
      setMessage('ok', copy.passwordUpdated);
      form.reset();
    });
  }

  async function init() {
    if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
      showView('error');
      setErrorCopy(copy.supabaseMissing);
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const params = parseParams();
    if (params.error || params.errorCode) {
      showView('error');
      setErrorCopy(params.errorDescription || copy.genericError);
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });

    bindBackToAccountLinks(supabaseClient);

    if (params.type === 'recovery') {
      showView('recovery');
      const { error } = await initRecoverySession(supabaseClient, params);
      if (error) {
        showView('error');
        setErrorCopy(error.message || copy.invalidReset);
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
      setErrorCopy(error.message || copy.confirmFailed);
      return;
    }

    await clearConfirmationSession(supabaseClient);

    if (params.type === 'signup' || params.type === 'email_change' || params.tokenHash || params.accessToken) {
      if (params.type === 'email_change') {
        setConfirmCopy(copy.emailChangeTitle, copy.emailChangeCopy, copy.emailChangePanelCopy);
        setConfirmMessage('ok', copy.emailChangeSuccess);
        return;
      }
      setConfirmMessage('ok', copy.confirmSuccess);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
