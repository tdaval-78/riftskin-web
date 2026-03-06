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
  const myKeysBody = document.querySelector('[data-my-keys-body]');
  const myKeysMsg = document.querySelector('[data-my-keys-msg]');

  const adminPanel = document.querySelector('[data-admin-only]');
  const adminCreateForm = document.querySelector('[data-admin-create-key]');
  const adminCreateMsg = document.querySelector('[data-admin-create-msg]');
  const adminKeyOutput = document.querySelector('[data-admin-key-output]');
  const adminAttachForm = document.querySelector('[data-admin-attach-key]');
  const adminAttachMsg = document.querySelector('[data-admin-attach-msg]');
  const adminKeysBody = document.querySelector('[data-admin-keys-body]');
  const adminListMsg = document.querySelector('[data-admin-list-msg]');
  const adminUpdateForm = document.querySelector('[data-admin-update-notice]');
  const adminUpdateMsg = document.querySelector('[data-admin-update-msg]');
  const adminUpdateLive = document.querySelector('[data-admin-update-live]');

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

  function decodeActivationMessage(code) {
    if (!code) return '';
    if (code === 'redeemed') return 'Activation key accepted.';
    if (code === 'attached') return 'Activation key attached to account.';
    if (code === 'already_redeemed') return 'This account already has this key attached.';
    if (code === 'invalid_key') return 'Activation key is invalid.';
    if (code === 'inactive_key') return 'Activation key is inactive.';
    if (code === 'expired_key') return 'Activation key is expired.';
    if (code === 'key_limit_reached') return 'Activation key usage limit is reached.';
    if (code === 'not_authenticated') return 'Please sign in first.';
    if (code === 'user_not_found') return 'No account found for this email.';
    if (code === 'email_mismatch') return 'Key is locked to another email.';
    if (code === 'key_reserved_for_other_email') return 'This key is reserved for another email.';
    if (code === 'not_admin') return 'Admin rights are required.';
    return code;
  }

  function decodeUpdateAdminMessage(code) {
    if (!code) return '';
    if (code === 'published') return 'Update notice published.';
    if (code === 'disabled') return 'Update notice disabled.';
    if (code === 'latest_version_required') return 'Latest version is required when notice is enabled.';
    if (code === 'not_authenticated') return 'Please sign in first.';
    if (code === 'not_admin') return 'Admin rights are required.';
    return code;
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
    if (myKeysBody) myKeysBody.innerHTML = '';
    if (myKeysMsg) msg(myKeysMsg, '');
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
      await loadMyKeys(session.user.id);
      await refreshAdminPanels();
    }
  }

  async function refreshAccessStatus(userId) {
    if (!userId) return;

    try {
      const { data: adminData, error: adminError } = await supabaseClient.rpc('is_app_admin');
      if (!adminError && adminData === true) {
        setAccessBadge('Active (admin)', 'ok');
        if (accessMeta) accessMeta.textContent = 'Admin account: no activation key required.';
        return;
      }

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
      await loadAdminUpdateNotice();
    }
  }

  async function loadAdminUpdateNotice() {
    if (!adminUpdateLive) return;
    adminUpdateLive.textContent = 'Loading...';

    const { data, error } = await supabaseClient.rpc('get_public_update_notice', { p_channel: 'stable' });
    if (error) {
      adminUpdateLive.textContent = error.message || 'Could not load live notice.';
      return;
    }

    const row = safeArray(data)[0] || null;
    if (!row) {
      adminUpdateLive.textContent = 'No live notice published.';
      if (adminUpdateForm) {
        adminUpdateForm.querySelector('[name="enabled"]').checked = false;
      }
      return;
    }

    const parts = [
      'Latest: ' + (row.latest_version || '-'),
      'Minimum: ' + (row.minimum_version || '-'),
      'Mandatory: ' + (row.mandatory ? 'yes' : 'no'),
      'Published: ' + formatDate(row.published_at)
    ];
    if (row.message) {
      parts.push('Message: ' + row.message);
    }
    adminUpdateLive.textContent = parts.join(' | ');

    if (adminUpdateForm) {
      adminUpdateForm.querySelector('[name="latest_version"]').value = row.latest_version || '';
      adminUpdateForm.querySelector('[name="minimum_version"]').value = row.minimum_version || '';
      adminUpdateForm.querySelector('[name="message"]').value = row.message || '';
      adminUpdateForm.querySelector('[name="mandatory"]').checked = !!row.mandatory;
      adminUpdateForm.querySelector('[name="enabled"]').checked = !!row.enabled;
    }
  }

  async function loadMyKeys(userId) {
    if (!myKeysBody) return;
    myKeysBody.innerHTML = '';
    if (myKeysMsg) msg(myKeysMsg, '');
    if (!userId) return;

    const { data, error } = await supabaseClient
      .from('key_redemptions')
      .select('redeemed_at, activation_keys(code, expires_at, is_active)')
      .eq('user_id', userId)
      .order('redeemed_at', { ascending: false })
      .limit(20);

    if (error) {
      if (myKeysMsg) msg(myKeysMsg, error.message || 'Could not load your keys.', 'error');
      return;
    }

    const rows = safeArray(data);
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No key attached yet.';
      tr.appendChild(td);
      myKeysBody.appendChild(tr);
      return;
    }

    rows.forEach(function (row) {
      const keyObj = row.activation_keys || {};
      const tr = document.createElement('tr');

      const tdCode = document.createElement('td');
      tdCode.textContent = keyObj.code || '-';
      tr.appendChild(tdCode);

      const tdRedeemed = document.createElement('td');
      tdRedeemed.textContent = formatDate(row.redeemed_at);
      tr.appendChild(tdRedeemed);

      const tdExpires = document.createElement('td');
      tdExpires.textContent = keyObj.expires_at ? formatDate(keyObj.expires_at) : 'No expiry';
      tr.appendChild(tdExpires);

      const tdStatus = document.createElement('td');
      tdStatus.textContent = keyObj.is_active === false ? 'Inactive' : 'Active';
      tr.appendChild(tdStatus);

      myKeysBody.appendChild(tr);
    });
  }

  refreshSession();

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    setSessionUi(session);
    if (session && session.user) {
      refreshAccessStatus(session.user.id);
      loadMyKeys(session.user.id);
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
        msg(redeemMsg, decodeActivationMessage(row.message || '') || 'Key invalid or expired.', 'error');
        return;
      }

      msg(redeemMsg, decodeActivationMessage(row.message || '') || 'Key accepted. Access is now active.', 'ok');
      redeemForm.reset();
      const session = await getSession();
      if (session && session.user) {
        await refreshAccessStatus(session.user.id);
        await loadMyKeys(session.user.id);
      }
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

  if (adminAttachForm) {
    adminAttachForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminAttachMsg, 'Attaching key...');

      const fd = new FormData(adminAttachForm);
      const userEmail = ((fd.get('user_email') || '').toString().trim()) || '';
      const keyCode = ((fd.get('key_code') || '').toString().trim()) || '';

      if (!userEmail || !keyCode) {
        msg(adminAttachMsg, 'User email and key code are required.', 'error');
        return;
      }

      const { data, error } = await supabaseClient.rpc('attach_activation_key_to_user', {
        p_code: keyCode,
        p_user_email: userEmail
      });
      if (error) {
        msg(adminAttachMsg, error.message || 'Could not attach key.', 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      const text = decodeActivationMessage(row.message || '');
      if (!row.success) {
        msg(adminAttachMsg, text || 'Could not attach key.', 'error');
        return;
      }

      msg(adminAttachMsg, text || 'Key attached successfully.', 'ok');
      adminAttachForm.reset();
      await loadAdminKeys();
    });
  }

  if (adminUpdateForm) {
    adminUpdateForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminUpdateMsg, 'Publishing update notice...');

      const fd = new FormData(adminUpdateForm);
      const enabled = adminUpdateForm.querySelector('[name="enabled"]').checked;
      const latestVersion = ((fd.get('latest_version') || '').toString().trim()) || null;
      const minimumVersion = ((fd.get('minimum_version') || '').toString().trim()) || null;
      const noticeMessage = ((fd.get('message') || '').toString().trim()) || null;
      const mandatory = adminUpdateForm.querySelector('[name="mandatory"]').checked;

      const { data, error } = await supabaseClient.rpc('set_app_update_notice', {
        p_channel: 'stable',
        p_latest_version: latestVersion,
        p_minimum_version: minimumVersion,
        p_message: noticeMessage,
        p_mandatory: mandatory,
        p_enabled: enabled
      });

      if (error) {
        msg(adminUpdateMsg, error.message || 'Could not publish update notice.', 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      if (!row.success) {
        msg(adminUpdateMsg, decodeUpdateAdminMessage(row.message || '') || 'Could not publish update notice.', 'error');
        return;
      }

      msg(adminUpdateMsg, decodeUpdateAdminMessage(row.message || '') || 'Update notice published.', 'ok');
      await loadAdminUpdateNotice();
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
