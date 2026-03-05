(function () {
  const cfg = window.RiftSkinConfig || {};
  const statusBox = document.querySelector('[data-account-status]');
  const loggedOutView = document.querySelector('[data-logged-out]');
  const loggedInView = document.querySelector('[data-logged-in]');
  const accountEmail = document.querySelector('[data-session-email]');
  const accountEmailInput = document.querySelector('[data-account-email]');

  const accessStatus = document.querySelector('[data-access-status]');
  const accessMeta = document.querySelector('[data-access-meta]');
  const redeemForm = document.querySelector('[data-redeem-form]');
  const redeemMsg = document.querySelector('[data-redeem-msg]');

  const adminPanel = document.querySelector('[data-admin-only]');
  const adminCreateForm = document.querySelector('[data-admin-create-key]');
  const adminCreateMsg = document.querySelector('[data-admin-create-msg]');
  const adminKeyOutput = document.querySelector('[data-admin-key-output]');
  const adminKeysBody = document.querySelector('[data-admin-keys-body]');
  const adminListMsg = document.querySelector('[data-admin-list-msg]');

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

  function setAccessBadge(text, kind) {
    if (!accessStatus) return;
    accessStatus.textContent = text;
    accessStatus.className = 'status-badge ' + (kind || '');
  }

  function formatDate(isoString) {
    if (!isoString) return 'Never';
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString();
  }

  function safeArray(val) {
    return Array.isArray(val) ? val : [];
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
    setAccessBadge('Sign in required', '');
    if (accessMeta) accessMeta.textContent = '';
    if (adminPanel) adminPanel.style.display = 'none';
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    setSessionUi(null);
    setStatus(t('msg_status_supabase_missing'), 'error');
    return;
  }

  const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data ? data.session : null;
  }

  async function refreshSession() {
    const session = await getSession();
    setSessionUi(session);
    if (session && session.user) {
      await refreshAccessStatus(session.user.id);
      await refreshAdminPanels();
    }
  }

  async function refreshAccessStatus(userId) {
    if (!userId) return;

    try {
      const { data, error } = await supabaseClient
        .from('user_access')
        .select('is_active, source, expires_at, granted_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        setAccessBadge('Unavailable', 'error');
        if (accessMeta) accessMeta.textContent = error.message || 'Access table unavailable.';
        return;
      }

      if (!data || !data.is_active) {
        setAccessBadge('No active key', 'error');
        if (accessMeta) accessMeta.textContent = 'Redeem an activation key to unlock software access.';
        return;
      }

      const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
      const expired = expiresAt && expiresAt.getTime() <= Date.now();
      if (expired) {
        setAccessBadge('Expired', 'error');
        if (accessMeta) accessMeta.textContent = 'Expired on ' + formatDate(data.expires_at);
        return;
      }

      setAccessBadge('Active', 'ok');
      const source = data.source || 'activation_key';
      const expiresLabel = data.expires_at ? formatDate(data.expires_at) : 'No expiry';
      if (accessMeta) accessMeta.textContent = 'Source: ' + source + ' - Expires: ' + expiresLabel;
    } catch (err) {
      setAccessBadge('Unavailable', 'error');
      if (accessMeta) accessMeta.textContent = (err && err.message) ? err.message : 'Unexpected error.';
    }
  }

  async function checkIsAdmin() {
    const { data, error } = await supabaseClient.rpc('is_app_admin');
    if (error) return false;
    return data === true;
  }

  async function loadAdminKeys() {
    if (!adminKeysBody) return;
    adminKeysBody.innerHTML = '';
    msg(adminListMsg, '');

    const { data, error } = await supabaseClient
      .from('activation_keys')
      .select('code, used_count, max_uses, expires_at, grant_days, created_for_email, note, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      msg(adminListMsg, error.message || 'Could not load keys.', 'error');
      return;
    }

    const keys = safeArray(data);
    if (!keys.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = 'No keys yet.';
      tr.appendChild(td);
      adminKeysBody.appendChild(tr);
      return;
    }

    keys.forEach(function (item) {
      const tr = document.createElement('tr');

      const tdCode = document.createElement('td');
      tdCode.textContent = item.code + (item.is_active ? '' : ' (inactive)');
      tr.appendChild(tdCode);

      const tdUses = document.createElement('td');
      tdUses.textContent = String(item.used_count) + ' / ' + String(item.max_uses);
      tr.appendChild(tdUses);

      const tdKeyExp = document.createElement('td');
      tdKeyExp.textContent = item.expires_at ? formatDate(item.expires_at) : 'No expiry';
      tr.appendChild(tdKeyExp);

      const tdAccessExp = document.createElement('td');
      tdAccessExp.textContent = item.grant_days ? String(item.grant_days) + ' days' : 'No expiry';
      tr.appendChild(tdAccessExp);

      const tdTarget = document.createElement('td');
      tdTarget.textContent = [item.created_for_email || '-', item.note || '-'].join(' / ');
      tr.appendChild(tdTarget);

      adminKeysBody.appendChild(tr);
    });
  }

  async function refreshAdminPanels() {
    if (!adminPanel) return;
    const isAdmin = await checkIsAdmin();
    adminPanel.style.display = isAdmin ? 'block' : 'none';
    if (isAdmin) {
      await loadAdminKeys();
    }
  }

  refreshSession();

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    setSessionUi(session);
    if (session && session.user) {
      refreshAccessStatus(session.user.id);
      refreshAdminPanels();
    }
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
      await refreshSession();
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

  if (redeemForm) {
    redeemForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(redeemMsg, 'Redeeming key...');
      const raw = (redeemForm.querySelector('[name="key"]').value || '').trim();
      if (!raw) {
        msg(redeemMsg, 'Enter a key first.', 'error');
        return;
      }

      const { data, error } = await supabaseClient.rpc('redeem_activation_key', { p_code: raw });
      if (error) {
        msg(redeemMsg, error.message || 'Redeem failed.', 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      if (!row.success) {
        msg(redeemMsg, row.message || 'Key invalid or expired.', 'error');
        return;
      }

      msg(redeemMsg, 'Key accepted. Access is now active.', 'ok');
      redeemForm.reset();
      const session = await getSession();
      if (session && session.user) await refreshAccessStatus(session.user.id);
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

  if (adminCreateForm) {
    adminCreateForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminCreateMsg, 'Creating key...');
      if (adminKeyOutput) {
        adminKeyOutput.style.display = 'none';
        adminKeyOutput.textContent = '';
      }

      const fd = new FormData(adminCreateForm);
      const maxUses = Number(fd.get('max_uses') || 1);
      const validDays = Number(fd.get('valid_days') || 30);
      const grantDaysRaw = (fd.get('grant_days') || '').toString().trim();
      const grantDays = grantDaysRaw ? Number(grantDaysRaw) : null;
      const forEmail = ((fd.get('for_email') || '').toString().trim()) || null;
      const note = ((fd.get('note') || '').toString().trim()) || null;

      const payload = {
        p_for_email: forEmail,
        p_note: note,
        p_max_uses: maxUses,
        p_valid_days: validDays,
        p_grant_days: grantDays
      };

      const { data, error } = await supabaseClient.rpc('create_activation_key', payload);
      if (error) {
        msg(adminCreateMsg, error.message || 'Could not create key.', 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      const code = row.code || '';
      if (!code) {
        msg(adminCreateMsg, 'Key created but no code returned.', 'error');
        return;
      }

      msg(adminCreateMsg, 'Key created successfully.', 'ok');
      if (adminKeyOutput) {
        adminKeyOutput.textContent = code + (row.expires_at ? (' - key expires: ' + formatDate(row.expires_at)) : '');
        adminKeyOutput.style.display = 'block';
      }

      adminCreateForm.reset();
      adminCreateForm.querySelector('[name="max_uses"]').value = '1';
      adminCreateForm.querySelector('[name="valid_days"]').value = '30';
      await loadAdminKeys();
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
      await refreshSession();
    });
  }
})();
