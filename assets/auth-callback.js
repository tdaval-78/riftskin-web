(function () {
  const cfg = window.RiftSkinConfig || {};
  const supabaseUrl = cfg.supabaseUrl || '';
  const supabaseAnonKey = cfg.supabaseAnonKey || '';

  const confirmView = document.getElementById('confirm-view');
  const recoveryView = document.getElementById('recovery-view');
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
    messageEl.className = 'msg ' + type;
    messageEl.textContent = text;
  }

  function parseHashParams() {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    return {
      accessToken: params.get('access_token') || '',
      refreshToken: params.get('refresh_token') || '',
      type: params.get('type') || ''
    };
  }

  async function init() {
    if (!window.supabase || !supabaseUrl || !supabaseAnonKey) {
      setMessage('error', t('msg_status_supabase_missing'));
      if (submitBtn) submitBtn.disabled = true;
      return;
    }

    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
    const { accessToken, refreshToken, type } = parseHashParams();

    if (type === 'recovery') {
      if (recoveryView) recoveryView.classList.remove('hidden');
      if (!accessToken || !refreshToken) {
        setMessage('error', t('cb_invalid_reset'));
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      const { error } = await supabaseClient.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      if (error) {
        setMessage('error', error.message || t('cb_reset_session_failed'));
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      if (form && submitBtn) {
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
      return;
    }

    if (confirmView) confirmView.classList.remove('hidden');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
