(function () {
  const cfg = window.RiftSkinConfig || {};
  const statusBox = document.querySelector('[data-account-status]');
  const loggedOutView = document.querySelector('[data-logged-out]');
  const loggedInView = document.querySelector('[data-logged-in]');
  const accountEmail = document.querySelector('[data-session-email]');
  const accountEmailInput = document.querySelector('[data-account-email]');

  function t(key) {
    return window.RiftSkinI18n ? window.RiftSkinI18n.t(key) : key;
  }

  function msg(target, text, type) {
    if (!target) return;
    target.textContent = text || '';
    target.className = 'msg ' + (type || '');
  }

  function setStatus(text, kind) {
    if (!statusBox) return;
    statusBox.textContent = text;
    statusBox.className = 'status-badge ' + (kind || '');
  }

  function setSessionUi(session) {
    const user = session && session.user ? session.user : null;
    if (user) {
      if (loggedOutView) loggedOutView.style.display = 'none';
      if (loggedInView) loggedInView.style.display = 'block';
      if (accountEmail) accountEmail.textContent = user.email || '';
      if (accountEmailInput && user.email) accountEmailInput.value = user.email;
      setStatus(t('msg_status_connected'), 'ok');
      return;
    }

    if (loggedOutView) loggedOutView.style.display = 'grid';
    if (loggedInView) loggedInView.style.display = 'none';
    if (accountEmail) accountEmail.textContent = '-';
    setStatus(t('msg_status_not_connected'), '');
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    setSessionUi(null);
    setStatus(t('msg_status_supabase_missing'), 'error');
    return;
  }

  const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  async function refreshSession() {
    const { data } = await supabaseClient.auth.getSession();
    setSessionUi(data ? data.session : null);
  }

  refreshSession();

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    setSessionUi(session);
  });

  document.addEventListener('riftskin:language-changed', function () {
    refreshSession();
  });

  const signInForm = document.querySelector('[data-signin-form]');
  if (signInForm) {
    signInForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = signInForm.querySelector('[name="email"]').value.trim();
      const password = signInForm.querySelector('[name="password"]').value;
      const out = signInForm.querySelector('[data-msg]');

      msg(out, t('msg_signing_in'));
      const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (error) {
        msg(out, error.message || t('msg_sign_in_failed'), 'error');
        return;
      }

      if (accountEmailInput) accountEmailInput.value = email;
      msg(out, t('msg_signed_in'), 'ok');
    });
  }

  const signUpForm = document.querySelector('[data-signup-form]');
  if (signUpForm) {
    signUpForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const username = signUpForm.querySelector('[name="username"]').value.trim();
      const email = signUpForm.querySelector('[name="email"]').value.trim();
      const password = signUpForm.querySelector('[name="password"]').value;
      const confirm = signUpForm.querySelector('[name="confirm_password"]').value;
      const out = signUpForm.querySelector('[data-msg]');

      if (!/^[A-Za-z0-9_\-.]{3,24}$/.test(username)) {
        msg(out, t('msg_username_rule'), 'error');
        return;
      }
      if (password.length < 8) {
        msg(out, t('msg_password_len'), 'error');
        return;
      }
      if (password !== confirm) {
        msg(out, t('msg_password_match'), 'error');
        return;
      }

      msg(out, t('msg_checking_username'));
      const { data: taken, error: checkError } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .limit(1);

      if (checkError) {
        if (checkError.code === 'PGRST205') {
          msg(out, t('msg_profiles_missing'), 'error');
        } else {
          msg(out, checkError.message || t('msg_username_check_failed'), 'error');
        }
        return;
      }
      if (taken && taken.length > 0) {
        msg(out, t('msg_username_taken'), 'error');
        return;
      }

      msg(out, t('msg_creating_account'));
      const { error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { username: username },
          emailRedirectTo: window.location.origin + '/auth/callback'
        }
      });

      if (error) {
        msg(out, error.message || t('msg_signup_failed'), 'error');
        return;
      }

      if (accountEmailInput) accountEmailInput.value = email;
      msg(out, t('msg_account_created'), 'ok');
    });
  }

  const forgotBtn = document.querySelector('[data-forgot]');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async function () {
      const out = document.querySelector('[data-forgot-msg]');
      const email = (accountEmailInput && accountEmailInput.value.trim()) || '';
      if (!email || email.indexOf('@') === -1) {
        msg(out, t('msg_enter_email_first'), 'error');
        return;
      }

      msg(out, t('msg_sending_reset'));
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/callback'
      });

      if (error) {
        msg(out, error.message || t('msg_reset_failed'), 'error');
        return;
      }

      msg(out, t('msg_reset_sent'), 'ok');
    });
  }

  const signOutBtn = document.querySelector('[data-signout]');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      const out = document.querySelector('[data-session-msg]');
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        msg(out, error.message || t('msg_signout_failed'), 'error');
        return;
      }
      msg(out, t('msg_signed_out'), 'ok');
      refreshSession();
    });
  }

  const portalBtn = document.querySelector('[data-open-portal]');
  if (portalBtn) {
    portalBtn.addEventListener('click', function () {
      if (cfg.paddleCustomerPortalUrl) {
        window.open(cfg.paddleCustomerPortalUrl, '_blank', 'noopener');
        return;
      }

      const out = document.querySelector('[data-session-msg]');
      msg(out, t('msg_portal_missing'), 'error');
    });
  }
})();
