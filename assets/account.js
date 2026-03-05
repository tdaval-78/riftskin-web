(function () {
  const cfg = window.RiftSkinConfig || {};
  const statusBox = document.querySelector('[data-account-status]');
  const loggedOutView = document.querySelector('[data-logged-out]');
  const loggedInView = document.querySelector('[data-logged-in]');
  const accountEmail = document.querySelector('[data-session-email]');
  const accountEmailInput = document.querySelector('[data-account-email]');

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
      setStatus('Connected', 'ok');
      return;
    }

    if (loggedOutView) loggedOutView.style.display = 'grid';
    if (loggedInView) loggedInView.style.display = 'none';
    if (accountEmail) accountEmail.textContent = '-';
    setStatus('Not connected', '');
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    setSessionUi(null);
    setStatus('Supabase config missing', 'error');
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

  const signInForm = document.querySelector('[data-signin-form]');
  if (signInForm) {
    signInForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = signInForm.querySelector('[name="email"]').value.trim();
      const password = signInForm.querySelector('[name="password"]').value;
      const out = signInForm.querySelector('[data-msg]');

      msg(out, 'Signing in...');
      const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (error) {
        msg(out, error.message || 'Sign in failed.', 'error');
        return;
      }

      if (accountEmailInput) accountEmailInput.value = email;
      msg(out, 'Signed in.', 'ok');
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
        msg(out, 'Username must be 3-24 chars (letters, numbers, _, -, .).', 'error');
        return;
      }
      if (password.length < 8) {
        msg(out, 'Password must be at least 8 characters.', 'error');
        return;
      }
      if (password !== confirm) {
        msg(out, 'Passwords do not match.', 'error');
        return;
      }

      msg(out, 'Checking username...');
      const { data: taken, error: checkError } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('username', username)
        .limit(1);

      if (checkError) {
        if (checkError.code === 'PGRST205') {
          msg(out, "Profiles table is missing. Run DB setup SQL before enabling sign up.", 'error');
        } else {
          msg(out, checkError.message || 'Username check failed.', 'error');
        }
        return;
      }
      if (taken && taken.length > 0) {
        msg(out, 'Username already taken.', 'error');
        return;
      }

      msg(out, 'Creating account...');
      const { error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: { username: username },
          emailRedirectTo: window.location.origin + '/auth/callback'
        }
      });

      if (error) {
        msg(out, error.message || 'Sign up failed.', 'error');
        return;
      }

      if (accountEmailInput) accountEmailInput.value = email;
      msg(out, 'Account created. Check your email to confirm your account.', 'ok');
    });
  }

  const forgotBtn = document.querySelector('[data-forgot]');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async function () {
      const out = document.querySelector('[data-forgot-msg]');
      const email = (accountEmailInput && accountEmailInput.value.trim()) || '';
      if (!email || email.indexOf('@') === -1) {
        msg(out, 'Enter your account email first.', 'error');
        return;
      }

      msg(out, 'Sending reset email...');
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/auth/callback'
      });

      if (error) {
        msg(out, error.message || 'Reset request failed.', 'error');
        return;
      }

      msg(out, 'Reset email sent. Check your inbox.', 'ok');
    });
  }

  const signOutBtn = document.querySelector('[data-signout]');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', async function () {
      const out = document.querySelector('[data-session-msg]');
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        msg(out, error.message || 'Sign out failed.', 'error');
        return;
      }
      msg(out, 'Signed out.', 'ok');
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
      msg(out, 'Customer portal URL is not configured yet.', 'error');
    });
  }
})();
