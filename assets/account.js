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
  const adminRefreshBtn = document.querySelector('[data-admin-refresh]');
  const adminCreateForm = document.querySelector('[data-admin-create-key]');
  const adminCreateMsg = document.querySelector('[data-admin-create-msg]');
  const adminKeyOutput = document.querySelector('[data-admin-key-output]');
  const adminAttachForm = document.querySelector('[data-admin-attach-key]');
  const adminAttachMsg = document.querySelector('[data-admin-attach-msg]');
  const adminPermanentForm = document.querySelector('[data-admin-permanent-form]');
  const adminPermanentMsg = document.querySelector('[data-admin-permanent-msg]');
  const adminKeysBody = document.querySelector('[data-admin-keys-body]');
  const adminListMsg = document.querySelector('[data-admin-list-msg]');
  const adminUpdateForm = document.querySelector('[data-admin-update-notice]');
  const adminUpdateMsg = document.querySelector('[data-admin-update-msg]');
  const adminUpdateLive = document.querySelector('[data-admin-update-live]');
  const adminAccountsBody = document.querySelector('[data-admin-accounts-body]');
  const adminAccountsMsg = document.querySelector('[data-admin-accounts-msg]');
  const adminAccountSearch = document.querySelector('[data-admin-account-search]');
  const adminAccountFilter = document.querySelector('[data-admin-account-filter]');
  const adminKpis = Array.from(document.querySelectorAll('[data-admin-kpi]'));
  const adminKpiSubs = Array.from(document.querySelectorAll('[data-admin-kpi-sub]'));

  const adminState = {
    search: '',
    filter: 'all',
    searchTimer: null
  };

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
    if (!isoString) return t('admin_not_available');
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString();
  }

  function fillTemplate(text, vars) {
    let output = text || '';
    Object.keys(vars || {}).forEach(function (key) {
      output = output.replace(new RegExp('\\{' + key + '\\}', 'g'), vars[key]);
    });
    return output;
  }

  function safeArray(val) {
    return Array.isArray(val) ? val : [];
  }

  function createBadge(label, kind) {
    const span = document.createElement('span');
    span.className = 'status-badge ' + (kind || '');
    span.textContent = label;
    return span;
  }

  function accessStateInfo(state) {
    if (state === 'admin') return { label: t('admin_state_admin'), kind: 'ok' };
    if (state === 'active') return { label: t('admin_state_active'), kind: 'ok' };
    if (state === 'expired') return { label: t('admin_state_expired'), kind: 'error' };
    return { label: t('admin_state_no_access'), kind: '' };
  }

  function accessSourceLabel(item) {
    if (item.is_admin) return t('admin_source_admin');
    if (item.access_source === 'admin_grant' && !item.access_expires_at) return t('admin_source_permanent');
    if (item.access_source === 'activation_key') return t('admin_source_key');
    if (item.access_source) return item.access_source;
    return t('admin_not_available');
  }

  function keyStateInfo(state) {
    if (state === 'available') return { label: t('admin_key_state_available'), kind: 'ok' };
    if (state === 'consumed') return { label: t('admin_key_state_consumed'), kind: '' };
    if (state === 'expired') return { label: t('admin_key_state_expired'), kind: 'error' };
    return { label: t('admin_key_state_inactive'), kind: '' };
  }

  function confirmationLabel(item) {
    return item && item.email_confirmed_at ? t('admin_confirmed') : t('admin_pending_confirmation');
  }

  function formatMonths(months) {
    if (!months) return t('admin_no_expiry');
    return months + ' ' + (months > 1 ? t('admin_months') : t('admin_month'));
  }

  function decodeActivationMessage(code) {
    if (!code) return '';
    if (code === 'redeemed') return t('admin_msg_key_redeemed');
    if (code === 'attached') return t('admin_msg_key_attached');
    if (code === 'already_redeemed') return t('admin_msg_key_already_attached');
    if (code === 'invalid_key') return t('admin_msg_invalid_key');
    if (code === 'inactive_key') return t('admin_msg_inactive_key');
    if (code === 'expired_key') return t('admin_msg_expired_key');
    if (code === 'key_limit_reached') return t('admin_msg_key_limit');
    if (code === 'not_authenticated') return t('admin_msg_not_authenticated');
    if (code === 'user_not_found') return t('admin_msg_user_not_found');
    if (code === 'email_mismatch') return t('admin_msg_email_mismatch');
    if (code === 'key_reserved_for_other_email') return t('admin_msg_reserved_other_email');
    if (code === 'not_admin') return t('admin_msg_not_admin');
    return code;
  }

  function decodeUpdateAdminMessage(code) {
    if (!code) return '';
    if (code === 'published') return t('admin_msg_update_published');
    if (code === 'disabled') return t('admin_msg_update_disabled');
    if (code === 'latest_version_required') return t('admin_msg_update_latest_required');
    if (code === 'not_authenticated') return t('admin_msg_not_authenticated');
    if (code === 'not_admin') return t('admin_msg_not_admin');
    return code;
  }

  function decodePermanentMessage(code) {
    if (!code) return '';
    if (code === 'permanent_enabled') return t('admin_msg_permanent_enabled');
    if (code === 'permanent_disabled') return t('admin_msg_permanent_disabled');
    if (code === 'target_is_admin') return t('admin_msg_target_is_admin');
    if (code === 'user_not_found') return t('admin_msg_user_not_found');
    if (code === 'not_authenticated') return t('admin_msg_not_authenticated');
    if (code === 'not_admin') return t('admin_msg_not_admin');
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
    setAccessBadge(t('admin_sign_in_required'), '');
    if (accessMeta) accessMeta.textContent = '';
    if (myKeysBody) myKeysBody.replaceChildren();
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
      const { data, error } = await supabaseClient.rpc('get_client_access_state', {
        p_trial_days: cfg.trialDays || 7
      });

      if (error) {
        setAccessBadge(t('admin_unavailable'), 'error');
        if (accessMeta) accessMeta.textContent = error.message || t('admin_access_table_unavailable');
        return;
      }

      const row = safeArray(data)[0] || null;
      if (!row) {
        setAccessBadge(t('admin_unavailable'), 'error');
        if (accessMeta) accessMeta.textContent = t('admin_unexpected_error');
        return;
      }

      if (row.is_admin) {
        setAccessBadge(t('admin_access_active_admin'), 'ok');
        if (accessMeta) accessMeta.textContent = t('admin_access_admin_meta');
        return;
      }

      if (row.access_source === 'trial' && row.access_granted) {
        setAccessBadge(t('account_access_trial_active'), 'ok');
        if (accessMeta) {
          accessMeta.textContent = fillTemplate(t('account_access_trial_meta'), {
            days: row.trial_days_left || 0,
            date: formatDate(row.trial_expires_at)
          });
        }
        return;
      }

      if (row.access_granted && (row.access_source === 'activation_key' || row.access_source === 'admin_grant')) {
        setAccessBadge(t('account_access_key_active'), 'ok');
        if (accessMeta) {
          accessMeta.textContent = fillTemplate(t('account_access_key_meta'), {
            date: formatDate(row.access_expires_at || '')
          });
        }
        return;
      }

      if (row.access_source === 'expired') {
        setAccessBadge(t('admin_state_expired'), 'error');
        if (accessMeta) accessMeta.textContent = t('account_access_expired');
        return;
      }

      setAccessBadge(t('admin_state_no_access'), 'error');
      if (accessMeta) accessMeta.textContent = t('account_access_no_access');
    } catch (err) {
      setAccessBadge(t('admin_unavailable'), 'error');
      if (accessMeta) accessMeta.textContent = (err && err.message) ? err.message : t('admin_unexpected_error');
    }
  }

  async function checkIsAdmin() {
    const { data, error } = await supabaseClient.rpc('is_app_admin');
    if (error) return false;
    return data === true;
  }

  function setKpi(name, value) {
    adminKpis.forEach(function (el) {
      if (el.getAttribute('data-admin-kpi') === name) {
        el.textContent = value;
      }
    });
  }

  function setKpiSub(name, text) {
    adminKpiSubs.forEach(function (el) {
      if (el.getAttribute('data-admin-kpi-sub') === name) {
        el.textContent = text;
      }
    });
  }

  async function loadAdminSummary() {
    const { data, error } = await supabaseClient.rpc('admin_dashboard_summary');
    if (error) {
      msg(adminAccountsMsg, error.message || t('admin_summary_failed'), 'error');
      return;
    }

    const row = safeArray(data)[0] || {};
    setKpi('total_accounts', String(row.total_accounts || 0));
    setKpi('active_accounts', String(row.active_accounts || 0));
    setKpi('no_access_accounts', String(row.no_access_accounts || 0));
    setKpi('total_keys', String(row.total_keys || 0));

    setKpiSub('confirmed_accounts', (row.confirmed_accounts || 0) + ' ' + t('admin_confirmed').toLowerCase());
    setKpiSub('expired_accounts', (row.expired_accounts || 0) + ' ' + t('admin_state_expired').toLowerCase());
    setKpiSub('admin_accounts', (row.admin_accounts || 0) + ' ' + t('admin_filter_admin').toLowerCase());
    setKpiSub('active_keys', (row.active_keys || 0) + ' ' + t('admin_key_state_available').toLowerCase());
  }

  function prefillCreateKeyForm(email) {
    if (!adminCreateForm) return;
    const input = adminCreateForm.querySelector('[name="for_email"]');
    if (input) {
      input.value = email || '';
      input.focus();
    }
  }

  function prefillPermanentForm(email, mode) {
    if (!adminPermanentForm) return;
    const emailInput = adminPermanentForm.querySelector('[name="user_email"]');
    const modeInput = adminPermanentForm.querySelector('[name="mode"]');
    if (emailInput) emailInput.value = email || '';
    if (modeInput && mode) modeInput.value = mode;
    if (emailInput) emailInput.focus();
  }

  async function copyToClipboard(text) {
    if (!text) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_err) {
      // fall through
    }
    return false;
  }

  async function loadAdminAccounts() {
    if (!adminAccountsBody) return;
    adminAccountsBody.replaceChildren();
    msg(adminAccountsMsg, '');

    const { data, error } = await supabaseClient.rpc('admin_list_accounts', {
      p_search: adminState.search || null,
      p_filter: adminState.filter || 'all'
    });

    if (error) {
      msg(adminAccountsMsg, error.message || t('admin_accounts_failed'), 'error');
      return;
    }

    const rows = safeArray(data);
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.textContent = t('admin_accounts_empty');
      tr.appendChild(td);
      adminAccountsBody.appendChild(tr);
      return;
    }

    rows.forEach(function (item) {
      const tr = document.createElement('tr');

      const tdEmail = document.createElement('td');
      const emailStrong = document.createElement('div');
      emailStrong.textContent = item.email || '-';
      const emailSub = document.createElement('div');
      emailSub.className = 'table-subtle';
      emailSub.textContent = confirmationLabel(item);
      tdEmail.appendChild(emailStrong);
      tdEmail.appendChild(emailSub);
      tr.appendChild(tdEmail);

      const tdUsername = document.createElement('td');
      tdUsername.textContent = item.username || '-';
      tr.appendChild(tdUsername);

      const tdCreated = document.createElement('td');
      tdCreated.textContent = formatDate(item.created_at);
      tr.appendChild(tdCreated);

      const tdSeen = document.createElement('td');
      tdSeen.textContent = item.last_sign_in_at ? formatDate(item.last_sign_in_at) : t('admin_not_available');
      tr.appendChild(tdSeen);

      const tdAccess = document.createElement('td');
      const state = accessStateInfo(item.access_state);
      tdAccess.appendChild(createBadge(state.label, state.kind));
      const source = document.createElement('div');
      source.className = 'table-subtle';
      source.textContent = accessSourceLabel(item);
      tdAccess.appendChild(source);
      tr.appendChild(tdAccess);

      const tdExpires = document.createElement('td');
      tdExpires.textContent = (item.is_admin || (item.access_source === 'admin_grant' && !item.access_expires_at))
        ? t('admin_permanent_label')
        : (item.access_expires_at ? formatDate(item.access_expires_at) : t('admin_no_expiry'));
      tr.appendChild(tdExpires);

      const tdKey = document.createElement('td');
      tdKey.textContent = item.latest_key_code || '-';
      tr.appendChild(tdKey);

      const tdActions = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'inline-actions';

      const prefillBtn = document.createElement('button');
      prefillBtn.type = 'button';
      prefillBtn.className = 'btn btn-ghost btn-small';
      prefillBtn.textContent = t('admin_action_prefill');
      prefillBtn.setAttribute('data-prefill-email', item.email || '');
      actions.appendChild(prefillBtn);

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'btn btn-ghost btn-small';
      copyBtn.textContent = t('admin_action_copy_email');
      copyBtn.setAttribute('data-copy-email', item.email || '');
      actions.appendChild(copyBtn);

      if (!item.is_admin) {
        const isPermanent = item.access_source === 'admin_grant' && !item.access_expires_at && item.access_state === 'active';
        const permanentBtn = document.createElement('button');
        permanentBtn.type = 'button';
        permanentBtn.className = 'btn btn-ghost btn-small';
        permanentBtn.textContent = isPermanent ? t('admin_action_remove_permanent') : t('admin_action_make_permanent');
        permanentBtn.setAttribute('data-permanent-email', item.email || '');
        permanentBtn.setAttribute('data-permanent-mode', isPermanent ? 'disable' : 'enable');
        actions.appendChild(permanentBtn);
      }

      tdActions.appendChild(actions);
      tr.appendChild(tdActions);

      adminAccountsBody.appendChild(tr);
    });
  }

  async function loadAdminKeys() {
    if (!adminKeysBody) return;
    adminKeysBody.replaceChildren();
    msg(adminListMsg, '');

    const { data, error } = await supabaseClient.rpc('admin_list_activation_keys', {
      p_search: null,
      p_filter: 'all'
    });

    if (error) {
      msg(adminListMsg, error.message || t('admin_keys_failed'), 'error');
      return;
    }

    const keys = safeArray(data);
    if (!keys.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = t('admin_keys_empty');
      tr.appendChild(td);
      adminKeysBody.appendChild(tr);
      return;
    }

    keys.forEach(function (item) {
      const tr = document.createElement('tr');

      const tdCode = document.createElement('td');
      const code = document.createElement('div');
      code.className = 'mono-text';
      code.textContent = item.code;
      const state = keyStateInfo(item.availability_state);
      const codeSub = document.createElement('div');
      codeSub.className = 'table-subtle';
      codeSub.textContent = state.label;
      tdCode.appendChild(code);
      tdCode.appendChild(codeSub);
      tr.appendChild(tdCode);

      const tdUses = document.createElement('td');
      tdUses.textContent = String(item.used_count) + ' / ' + String(item.max_uses);
      tr.appendChild(tdUses);

      const tdKeyExp = document.createElement('td');
      tdKeyExp.textContent = item.expires_at ? formatDate(item.expires_at) : t('admin_no_expiry');
      tr.appendChild(tdKeyExp);

      const tdAccessExp = document.createElement('td');
      tdAccessExp.textContent = formatMonths(item.grant_months);
      tr.appendChild(tdAccessExp);

      const tdTarget = document.createElement('td');
      tdTarget.replaceChildren();
      const targetMain = document.createElement('div');
      targetMain.textContent = item.created_for_email || '-';
      const targetSub = document.createElement('div');
      targetSub.className = 'table-subtle';
      targetSub.textContent = item.note || '-';
      tdTarget.appendChild(targetMain);
      tdTarget.appendChild(targetSub);
      tr.appendChild(tdTarget);

      adminKeysBody.appendChild(tr);
    });
  }

  async function loadAdminUpdateNotice() {
    if (!adminUpdateLive) return;
    adminUpdateLive.textContent = t('admin_loading');

    const { data, error } = await supabaseClient.rpc('get_public_update_notice', { p_channel: 'stable' });
    if (error) {
      adminUpdateLive.textContent = error.message || t('admin_update_load_failed');
      return;
    }

    const row = safeArray(data)[0] || null;
    if (!row) {
      adminUpdateLive.textContent = t('admin_update_none_live');
      if (adminUpdateForm) {
        adminUpdateForm.querySelector('[name="enabled"]').checked = false;
      }
      return;
    }

    const parts = [
      t('admin_update_latest') + ' ' + (row.latest_version || '-'),
      t('admin_update_minimum') + ' ' + (row.minimum_version || '-'),
      t('admin_update_mandatory_label') + ' ' + (row.mandatory ? t('admin_yes') : t('admin_no')),
      t('admin_update_published') + ' ' + formatDate(row.published_at)
    ];
    if (row.message) parts.push(row.message);
    adminUpdateLive.textContent = parts.join(' | ');

    if (adminUpdateForm) {
      adminUpdateForm.querySelector('[name="latest_version"]').value = row.latest_version || '';
      adminUpdateForm.querySelector('[name="minimum_version"]').value = row.minimum_version || '';
      adminUpdateForm.querySelector('[name="message"]').value = row.message || '';
      adminUpdateForm.querySelector('[name="mandatory"]').checked = !!row.mandatory;
      adminUpdateForm.querySelector('[name="enabled"]').checked = !!row.enabled;
    }
  }

  async function refreshAdminPanels() {
    if (!adminPanel) return;
    const isAdmin = await checkIsAdmin();
    adminPanel.style.display = isAdmin ? 'block' : 'none';
    if (!isAdmin) return;
    await loadAdminSummary();
    await loadAdminAccounts();
    await loadAdminKeys();
    await loadAdminUpdateNotice();
  }

  async function loadMyKeys(userId) {
    if (!myKeysBody) return;
    myKeysBody.replaceChildren();
    if (myKeysMsg) msg(myKeysMsg, '');
    if (!userId) return;

    const { data, error } = await supabaseClient
      .from('key_redemptions')
      .select('redeemed_at, activation_keys(code, expires_at, is_active)')
      .eq('user_id', userId)
      .order('redeemed_at', { ascending: false })
      .limit(20);

    if (error) {
      if (myKeysMsg) msg(myKeysMsg, error.message || t('account_my_key_load_failed'), 'error');
      return;
    }

    const rows = safeArray(data);
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = t('account_my_key_empty');
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
      tdExpires.textContent = keyObj.expires_at ? formatDate(keyObj.expires_at) : t('admin_no_expiry');
      tr.appendChild(tdExpires);

      const tdStatus = document.createElement('td');
      tdStatus.textContent = keyObj.is_active === false ? t('admin_key_state_inactive') : t('admin_state_active');
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
      msg(redeemMsg, t('account_redeeming_key'));
      const raw = (redeemForm.querySelector('[name="key"]').value || '').trim();
      if (!raw) {
        msg(redeemMsg, t('account_enter_key_first'), 'error');
        return;
      }

      const { data, error } = await supabaseClient.rpc('redeem_activation_key', { p_code: raw });
      if (error) {
        msg(redeemMsg, error.message || t('account_redeem_failed'), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      if (!row.success) {
        msg(redeemMsg, decodeActivationMessage(row.message || '') || t('account_redeem_invalid'), 'error');
        return;
      }

      msg(redeemMsg, decodeActivationMessage(row.message || '') || t('account_redeem_success'), 'ok');
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

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener('click', async function () {
      msg(adminAccountsMsg, t('admin_refreshing'));
      await refreshAdminPanels();
      msg(adminAccountsMsg, '', '');
    });
  }

  if (adminAccountSearch) {
    adminAccountSearch.addEventListener('input', function () {
      adminState.search = adminAccountSearch.value.trim();
      clearTimeout(adminState.searchTimer);
      adminState.searchTimer = setTimeout(function () {
        loadAdminAccounts();
      }, 250);
    });
  }

  if (adminAccountFilter) {
    adminAccountFilter.addEventListener('change', function () {
      adminState.filter = adminAccountFilter.value || 'all';
      loadAdminAccounts();
    });
  }

  if (adminAccountsBody) {
    adminAccountsBody.addEventListener('click', async function (event) {
      const prefillBtn = event.target.closest('[data-prefill-email]');
      if (prefillBtn) {
        prefillCreateKeyForm(prefillBtn.getAttribute('data-prefill-email') || '');
        return;
      }

      const copyBtn = event.target.closest('[data-copy-email]');
      if (copyBtn) {
        const email = copyBtn.getAttribute('data-copy-email') || '';
        const copied = await copyToClipboard(email);
        msg(adminAccountsMsg, copied ? t('admin_email_copied') : t('admin_email_copy_failed'), copied ? 'ok' : 'error');
        return;
      }

      const permanentBtn = event.target.closest('[data-permanent-email]');
      if (permanentBtn) {
        const email = permanentBtn.getAttribute('data-permanent-email') || '';
        const mode = permanentBtn.getAttribute('data-permanent-mode') || 'enable';
        prefillPermanentForm(email, mode);
      }
    });
  }

  if (adminCreateForm) {
    adminCreateForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminCreateMsg, t('admin_creating_key'));
      if (adminKeyOutput) {
        adminKeyOutput.style.display = 'none';
        adminKeyOutput.textContent = '';
      }

      const fd = new FormData(adminCreateForm);
      const maxUses = Number(fd.get('max_uses') || 1);
      const validMonths = Number(fd.get('valid_months') || 1);
      const grantMonthsRaw = (fd.get('grant_months') || '').toString().trim();
      const grantMonths = grantMonthsRaw ? Number(grantMonthsRaw) : null;
      const forEmail = ((fd.get('for_email') || '').toString().trim()) || null;
      const note = ((fd.get('note') || '').toString().trim()) || null;
      const autoAttach = !!adminCreateForm.querySelector('[name="auto_attach"]').checked;

      const { data, error } = await supabaseClient.rpc('create_activation_key', {
        p_for_email: forEmail,
        p_note: note,
        p_max_uses: maxUses,
        p_valid_months: validMonths,
        p_grant_months: grantMonths
      });

      if (error) {
        msg(adminCreateMsg, error.message || t('admin_key_create_failed'), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      const code = row.code || '';
      if (!code) {
        msg(adminCreateMsg, t('admin_key_create_failed'), 'error');
        return;
      }

      let createdMessage = t('admin_key_created_ok');
      if (autoAttach && forEmail) {
        const attachResult = await supabaseClient.rpc('attach_activation_key_to_user', {
          p_code: code,
          p_user_email: forEmail
        });
        if (attachResult.error) {
          msg(adminCreateMsg, attachResult.error.message || t('admin_attach_failed'), 'error');
          return;
        }
        const attachRow = safeArray(attachResult.data)[0] || {};
        if (!attachRow.success) {
          msg(adminCreateMsg, decodeActivationMessage(attachRow.message || '') || t('admin_attach_failed'), 'error');
          return;
        }
        createdMessage = t('admin_key_created_attached_ok');
      }

      msg(adminCreateMsg, createdMessage, 'ok');
      if (adminKeyOutput) {
        const outputParts = [code, t('admin_key_expires') + ' ' + (row.expires_at ? formatDate(row.expires_at) : t('admin_no_expiry'))];
        if (grantMonths) outputParts.push(t('admin_access_duration_label') + ' ' + formatMonths(grantMonths));
        adminKeyOutput.textContent = outputParts.join(' | ');
        adminKeyOutput.style.display = 'block';
      }

      adminCreateForm.reset();
      adminCreateForm.querySelector('[name="max_uses"]').value = '1';
      adminCreateForm.querySelector('[name="valid_months"]').value = '1';
      await loadAdminSummary();
      await loadAdminAccounts();
      await loadAdminKeys();
    });
  }

  if (adminAttachForm) {
    adminAttachForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminAttachMsg, t('admin_attaching_key'));

      const fd = new FormData(adminAttachForm);
      const userEmail = ((fd.get('user_email') || '').toString().trim()) || '';
      const keyCode = ((fd.get('key_code') || '').toString().trim()) || '';

      if (!userEmail || !keyCode) {
        msg(adminAttachMsg, t('admin_attach_fields_required'), 'error');
        return;
      }

      const { data, error } = await supabaseClient.rpc('attach_activation_key_to_user', {
        p_code: keyCode,
        p_user_email: userEmail
      });
      if (error) {
        msg(adminAttachMsg, error.message || t('admin_attach_failed'), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      const text = decodeActivationMessage(row.message || '');
      if (!row.success) {
        msg(adminAttachMsg, text || t('admin_attach_failed'), 'error');
        return;
      }

      msg(adminAttachMsg, text || t('admin_attach_success'), 'ok');
      adminAttachForm.reset();
      await loadAdminSummary();
      await loadAdminAccounts();
      await loadAdminKeys();
    });
  }

  if (adminPermanentForm) {
    adminPermanentForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const fd = new FormData(adminPermanentForm);
      const userEmail = ((fd.get('user_email') || '').toString().trim()) || '';
      const mode = ((fd.get('mode') || 'enable').toString().trim()) || 'enable';

      if (!userEmail) {
        msg(adminPermanentMsg, t('admin_permanent_fields_required'), 'error');
        return;
      }

      msg(adminPermanentMsg, mode === 'disable' ? t('admin_permanent_disabling') : t('admin_permanent_enabling'));
      const { data, error } = await supabaseClient.rpc('set_user_permanent_access', {
        p_user_email: userEmail,
        p_enabled: mode !== 'disable'
      });
      if (error) {
        msg(adminPermanentMsg, error.message || t('admin_permanent_failed'), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      if (!row.success) {
        msg(adminPermanentMsg, decodePermanentMessage(row.message || '') || t('admin_permanent_failed'), 'error');
        return;
      }

      msg(adminPermanentMsg, decodePermanentMessage(row.message || '') || t('admin_permanent_success'), 'ok');
      await loadAdminSummary();
      await loadAdminAccounts();
    });
  }

  if (adminUpdateForm) {
    adminUpdateForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminUpdateMsg, t('admin_publishing_update'));

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
        msg(adminUpdateMsg, error.message || t('admin_update_publish_failed'), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      if (!row.success) {
        msg(adminUpdateMsg, decodeUpdateAdminMessage(row.message || '') || t('admin_update_publish_failed'), 'error');
        return;
      }

      msg(adminUpdateMsg, decodeUpdateAdminMessage(row.message || '') || t('admin_msg_update_published'), 'ok');
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
