(function () {
  window.dataLayer = window.dataLayer || [];

  function pushAnalyticsEvent(eventName, params) {
    if (!eventName) return;
    window.dataLayer.push(Object.assign({
      event: eventName,
      page_type: document.body.getAttribute('data-page') || 'unknown',
      page_path: window.location.pathname
    }, params || {}));
  }

  const cfg = window.RiftSkinConfig || {};
  const statusBox = document.querySelector('[data-account-status]');
  const maintenanceMsg = document.querySelector('[data-maintenance-msg]');
  const loggedOutView = document.querySelector('[data-logged-out]');
  const loggedInView = document.querySelector('[data-logged-in]');
  const signUpCard = document.querySelector('[data-signup-form]') ? document.querySelector('[data-signup-form]').closest('.account-auth-card') : null;
  const sessionSummary = document.querySelector('[data-session-summary]');
  const accountEmails = document.querySelectorAll('[data-session-email]');
  const accountEmailInput = document.querySelector('[data-account-email]');
  const signInPasswordInput = document.querySelector('[data-signin-password]');
  const resendRow = document.querySelector('[data-resend-row]');
  const resendConfirmationBtn = document.querySelector('[data-resend-confirmation]');
  const resendMsg = document.querySelector('[data-resend-msg]');

  const accessStatus = document.querySelector('[data-access-status]');
  const accessMeta = document.querySelector('[data-access-meta]');
  const subscribeBtns = Array.from(document.querySelectorAll('[data-subscribe]'));
  const billingPortalBtns = Array.from(document.querySelectorAll('[data-open-billing-portal]'));
  const emailChangeForm = document.querySelector('[data-email-change-form]');
  const emailChangeMsg = document.querySelector('[data-email-change-msg]');
  const passwordChangeForm = document.querySelector('[data-password-change-form]');
  const passwordChangeMsg = document.querySelector('[data-password-change-msg]');
  const deleteAccountForm = document.querySelector('[data-delete-account-form]');
  const deleteAccountMsg = document.querySelector('[data-delete-account-msg]');
  const myKeysBody = document.querySelector('[data-my-keys-body]');
  const myKeysMsg = document.querySelector('[data-my-keys-msg]');
  const myKeysDateHeader = document.querySelector('[data-my-keys-date-header]');
  const adminEntry = document.querySelector('[data-admin-entry]');
  const adminEntryHeading = document.querySelector('[data-admin-entry-heading]');
  const adminTab = document.querySelector('[data-admin-tab]');

  const adminPanel = document.querySelector('[data-admin-only]');
  const adminRefreshBtn = document.querySelector('[data-admin-refresh]');
  const adminCreateForm = document.querySelector('[data-admin-create-key]');
  const adminCreateMsg = document.querySelector('[data-admin-create-msg]');
  const adminKeyOutput = document.querySelector('[data-admin-key-output]');
  const adminBoundForm = document.querySelector('[data-admin-bound-key]');
  const adminBoundMsg = document.querySelector('[data-admin-bound-msg]');
  const adminBoundOutput = document.querySelector('[data-admin-bound-output]');
  const adminKeysBody = document.querySelector('[data-admin-keys-body]');
  const adminListMsg = document.querySelector('[data-admin-list-msg]');
  const adminServiceForm = document.querySelector('[data-admin-service-form]');
  const adminServiceMsg = document.querySelector('[data-admin-service-msg]');
  const adminServiceLive = document.querySelector('[data-admin-service-live]');
  const adminServicePublished = document.querySelector('[data-admin-service-published]');
  const adminServiceLiveMessage = document.querySelector('[data-admin-service-live-message]');
  const adminServiceTemplate = document.querySelector('[data-admin-service-template]');
  const adminServiceTemplatePreview = document.querySelector('[data-admin-service-template-preview]');
  const adminServiceTemplateTranslation = document.querySelector('[data-admin-service-template-translation]');

  const CUSTOM_SERVICE_TEMPLATE = '__custom__';
  const SERVICE_MESSAGE_TEMPLATES = [
    {
      id: 'ok_general',
      state: 'ok',
      message: 'Injection is fully operational on the latest League of Legends patch. You can use RIFTSKIN normally.',
      translation: "L'injection est entierement fonctionnelle sur le dernier patch de League of Legends. Vous pouvez utiliser RIFTSKIN normalement."
    },
    {
      id: 'ok_update_deployed',
      state: 'ok',
      message: 'A compatibility update has been deployed and injection is functional again on the latest League of Legends patch.',
      translation: "Une mise a jour de compatibilite a ete deployee et l'injection fonctionne de nouveau sur le dernier patch de League of Legends."
    },
    {
      id: 'maintenance_patch',
      state: 'maintenance',
      message: 'Injection is temporarily unavailable after the latest League of Legends patch. Our team is actively working on a compatibility update.',
      translation: "L'injection est temporairement indisponible apres le dernier patch de League of Legends. Notre equipe travaille activement sur une mise a jour de compatibilite."
    },
    {
      id: 'maintenance_testing',
      state: 'maintenance',
      message: 'Our team has completed the main fix and is currently testing the next RIFTSKIN update before release.',
      translation: "Notre equipe a termine le correctif principal et teste actuellement la prochaine mise a jour de RIFTSKIN avant sa publication."
    }
  ];

  function t(key) {
    return window.RiftSkinI18n ? window.RiftSkinI18n.t(key) : key;
  }

  function normalizeEmail(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function isMaintenanceAllowedSession() {
    const session = arguments[0];
    const email = session && session.user && session.user.email
      ? String(session.user.email).trim().toLowerCase()
      : '';
    const allowed = Array.isArray(cfg.siteMaintenanceAllowedEmails)
      ? cfg.siteMaintenanceAllowedEmails.map(function (value) {
        return String(value || '').trim().toLowerCase();
      }).filter(Boolean)
      : [];
    return !!email && allowed.indexOf(email) !== -1;
  }

  function getMaintenanceMessage() {
    return t('site_maintenance_gate_message');
  }

  function msg(target, text, type) {
    if (!target) return;
    target.textContent = text || '';
    target.className = 'msg ' + (type || '');
  }

  function currentLanguageCode() {
    const api = window.RiftSkinI18n;
    if (api && typeof api.getLanguage === 'function') {
      const lang = String(api.getLanguage() || '').trim().toLowerCase();
      if (lang === 'fr' || lang === 'en' || lang === 'es' || lang === 'pt') return lang;
    }

    try {
      const saved = String((window.localStorage && window.localStorage.getItem('riftskin_lang')) || '').trim().toLowerCase();
      if (saved === 'fr' || saved === 'en' || saved === 'es' || saved === 'pt') return saved;
    } catch (_error) {
      // Ignore storage read failures and fall back to English.
    }

    return 'en';
  }

  function authCallbackUrl() {
    return window.location.origin + '/auth/callback?lang=' + encodeURIComponent(currentLanguageCode());
  }

  function isEmailNotConfirmedError(error) {
    const message = ((error && error.message) || '').toLowerCase();
    const code = ((error && error.code) || '').toLowerCase();
    return (
      code === 'email_not_confirmed' ||
      message.indexOf('email not confirmed') !== -1 ||
      message.indexOf('email_not_confirmed') !== -1 ||
      message.indexOf('confirm your email') !== -1
    );
  }

  function setResendVisibility(visible) {
    if (!resendRow) return;
    resendRow.style.display = visible ? '' : 'none';
  }

  function setForgotMode(active) {
    if (!signInPasswordInput) return;
    if (active) {
      signInPasswordInput.value = '';
      signInPasswordInput.required = false;
      signInPasswordInput.style.display = 'none';
      return;
    }

    signInPasswordInput.required = true;
    signInPasswordInput.style.display = '';
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

  function setBillingUi(hasActiveSubscription) {
    subscribeBtns.forEach(function (btn) {
      const nextKey = hasActiveSubscription ? 'account_manage_sub' : 'site_pricing_premium_cta';
      btn.setAttribute('data-i18n', nextKey);
      btn.textContent = t(nextKey);
    });

    billingPortalBtns.forEach(function (btn) {
      btn.style.display = 'none';
    });
  }

  function setAdminUi(isAdmin) {
    if (adminEntry) adminEntry.style.display = isAdmin ? 'block' : 'none';
    if (adminEntryHeading) adminEntryHeading.style.display = isAdmin ? 'block' : 'none';
    if (adminTab) adminTab.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  function resetAccountManagementUi() {
    if (emailChangeForm) emailChangeForm.reset();
    if (passwordChangeForm) passwordChangeForm.reset();
    if (deleteAccountForm) deleteAccountForm.reset();
    if (emailChangeMsg) msg(emailChangeMsg, '', '');
    if (passwordChangeMsg) msg(passwordChangeMsg, '', '');
    if (deleteAccountMsg) msg(deleteAccountMsg, '', '');
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

  async function extractFunctionErrorMessage(result) {
    if (result && result.data) {
      const directMessage = result.data.message || result.data.error;
      if (directMessage) return String(directMessage);
    }

    const error = result && result.error ? result.error : null;
    if (!error) return '';

    const context = error.context;
    if (context) {
      try {
        if (typeof context.clone === 'function') {
          const payload = await context.clone().json().catch(function () { return null; });
          if (payload && (payload.message || payload.error)) {
            return String(payload.message || payload.error);
          }
        }
      } catch (_err) {}

      try {
        if (typeof context.json === 'function') {
          const payload = await context.json().catch(function () { return null; });
          if (payload && (payload.message || payload.error)) {
            return String(payload.message || payload.error);
          }
        }
      } catch (_err) {}
    }

    return error.message ? String(error.message) : '';
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
    if (item.access_source === 'subscription_canceled') return t('account_subscription_canceled_table_status');
    if (item.access_source === 'activation_key') return t('admin_source_key');
    if (item.access_source) return item.access_source;
    return t('admin_not_available');
  }

  function serviceStateInfo(state) {
    if (state === 'ok') return { label: 'INJECTION & SOFTWARE FUNCTIONAL', kind: 'ok' };
    return { label: 'INJECTION CURRENTLY BEING PATCHED BY OUR TEAM', kind: 'warning' };
  }

  function defaultServiceMessage(state) {
    if (state === 'ok') {
      return 'Skin injection is currently functional on the latest League of Legends patch.';
    }
    return 'Skin injection is currently unavailable on the latest League of Legends patch. Our developers are actively working on a new update.';
  }

  function getServiceMessageInput() {
    return adminServiceForm ? adminServiceForm.querySelector('[name="service_message"]') : null;
  }

  function getServiceStateInput() {
    return adminServiceForm ? adminServiceForm.querySelector('[name="injection_state"]') : null;
  }

  function findServiceTemplateById(id) {
    return SERVICE_MESSAGE_TEMPLATES.find(function (item) {
      return item.id === id;
    }) || null;
  }

  function findServiceTemplateByMessage(message) {
    const normalized = (message || '').trim();
    if (!normalized) return null;
    return SERVICE_MESSAGE_TEMPLATES.find(function (item) {
      return item.message === normalized;
    }) || null;
  }

  function updateServiceTemplateHelper(template, message) {
    if (adminServiceTemplatePreview) {
      adminServiceTemplatePreview.textContent = template
        ? template.message
        : ((message || '').trim() || 'Custom message');
    }
    if (adminServiceTemplateTranslation) {
      adminServiceTemplateTranslation.textContent = template
        ? template.translation
        : "Message manuel, traduction libre.";
    }
  }

  function syncServiceTemplateSelection(message) {
    const template = findServiceTemplateByMessage(message);
    if (adminServiceTemplate) {
      adminServiceTemplate.value = template ? template.id : CUSTOM_SERVICE_TEMPLATE;
    }
    updateServiceTemplateHelper(template, message);
  }

  function applyServiceTemplate(templateId) {
    const template = findServiceTemplateById(templateId);
    const messageInput = getServiceMessageInput();
    const stateInput = getServiceStateInput();
    if (!template || !messageInput) {
      updateServiceTemplateHelper(null, messageInput ? messageInput.value : '');
      return;
    }

    messageInput.value = template.message;
    if (stateInput) {
      stateInput.value = template.state;
    }
    updateServiceTemplateHelper(template, template.message);
  }

  function serviceStatusBackendMessage(errorText) {
    if (/get_public_service_status|set_public_service_status/i.test(errorText || '')) {
      return "Le backend du statut desktop n'est pas encore deploye. Appliquez d'abord le SQL du statut de service sur le projet Supabase du site.";
    }
    return errorText || "Impossible de charger le statut desktop.";
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

  function adminKeyConfig(kind) {
    const normalized = (kind || 'monthly').toString().trim().toLowerCase();
    if (normalized === 'permanent') {
      return {
        isPermanent: true,
        validMonths: null,
        grantMonths: null
      };
    }
    return {
      isPermanent: false,
      validMonths: 1,
      grantMonths: 1
    };
  }

  function bindKeyKindToggle(form) {
    if (!form) return;
    const kindSelect = form.querySelector('[name="key_kind"]');
    const durationSelect = form.querySelector('[name="duration_months"]');
    if (!kindSelect || !durationSelect) return;

    function sync() {
      const isPermanent = (kindSelect.value || 'monthly') === 'permanent';
      durationSelect.disabled = isPermanent;
      durationSelect.style.display = isPermanent ? 'none' : '';
      if (!durationSelect.value) durationSelect.value = '1';
    }

    kindSelect.addEventListener('change', sync);
    sync();
  }

  async function createActivationKeyRpc(params) {
    if (!params.p_is_permanent) {
      return supabaseClient.rpc('create_activation_key', {
        p_for_email: params.p_for_email,
        p_note: params.p_note,
        p_max_uses: params.p_max_uses,
        p_valid_months: params.p_valid_months,
        p_grant_months: params.p_grant_months
      });
    }

    const result = await supabaseClient.rpc('create_activation_key', params);
    if (result.error && /create_activation_key\(.*boolean/i.test(result.error.message || '')) {
      return {
        data: null,
        error: {
          message: 'Permanent key backend is not deployed yet. Apply the latest Supabase activation_keys.sql migration first.'
        }
      };
    }
    return result;
  }

  function renderAdminKeyOutput(target, code, row, config) {
    if (!target) return;
    const outputParts = [
      code,
      t('admin_key_expires') + ' ' + (row.expires_at ? formatDate(row.expires_at) : t('admin_no_expiry'))
    ];
    if (config.isPermanent) outputParts.push(t('admin_key_mode_permanent'));
    else outputParts.push(t('admin_access_duration_label') + ' ' + formatMonths(config.grantMonths));
    target.textContent = outputParts.join(' | ');
    target.style.display = 'block';
  }

  function setSessionUi(session) {
    const user = session && session.user ? session.user : null;
    if (user) {
      if (maintenanceMsg) {
        maintenanceMsg.textContent = '';
        maintenanceMsg.className = 'msg';
        maintenanceMsg.style.display = 'none';
      }
      if (loggedOutView) loggedOutView.style.display = 'none';
      if (loggedInView) loggedInView.style.display = 'block';
      if (sessionSummary) sessionSummary.style.display = 'block';
      accountEmails.forEach(function (el) {
        el.textContent = user.email || '';
      });
      if (accountEmailInput && user.email) accountEmailInput.value = user.email;
      setStatus(t('msg_status_connected'), 'ok');
      return;
    }

    if (loggedOutView) loggedOutView.style.display = 'grid';
    if (loggedInView) loggedInView.style.display = 'none';
    if (sessionSummary) sessionSummary.style.display = 'none';
    accountEmails.forEach(function (el) {
      el.textContent = '-';
    });
    resetAccountManagementUi();
    setStatus(t('msg_status_not_connected'), '');
    setAccessBadge(t('admin_sign_in_required'), '');
    if (accessMeta) accessMeta.textContent = '';
    if (myKeysBody) myKeysBody.replaceChildren();
    if (myKeysMsg) msg(myKeysMsg, '');
    if (adminEntry) adminEntry.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'none';
    setBillingUi(false);
  }

  function applyMaintenanceLoggedOutState() {
    if (signUpCard) signUpCard.style.display = '';
    if (maintenanceMsg) {
      maintenanceMsg.textContent = getMaintenanceMessage();
      maintenanceMsg.className = 'msg error';
      maintenanceMsg.style.display = '';
    }
    if (statusBox) {
      statusBox.textContent = getMaintenanceMessage();
      statusBox.className = 'status-badge error';
    }
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    setSessionUi(null);
    setStatus(t('msg_status_supabase_missing'), 'error');
    return;
  }

  const authStorage = window.localStorage || window.sessionStorage;
  const pageStorage = window.sessionStorage;
  const PENDING_CHECKOUT_KEY = 'riftskin_stripe_checkout_pending';
  let reconcileInFlight = false;
  let latestSubscriptionSummary = null;
  const supabaseClient = window.__riftskinSupabaseClient
    || window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
  window.__riftskinSupabaseClient = supabaseClient;

  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data ? data.session : null;
  }

  function hasPendingStripeCheckout() {
    return !!(pageStorage && pageStorage.getItem(PENDING_CHECKOUT_KEY) === '1');
  }

  function clearPendingStripeCheckout() {
    if (!pageStorage) return;
    pageStorage.removeItem(PENDING_CHECKOUT_KEY);
  }

  function setMyKeysDateHeader(summary) {
    if (!myKeysDateHeader) return;
    const key = summary && summary.cancellationScheduled
      ? 'account_my_key_col_end'
      : 'account_my_key_col_expires';
    myKeysDateHeader.setAttribute('data-i18n', key);
    myKeysDateHeader.textContent = t(key);
  }

  function shouldShowCanonicalSubscriptionKey(summary) {
    if (!summary || !summary.activationKeyCode) return false;
    return summary.active === true;
  }

  async function loadSubscriptionSummary() {
    try {
      const result = await supabaseClient.functions.invoke('account-subscription-summary', { body: {} });
      if (result.error || !result.data || result.data.ok !== true) {
        latestSubscriptionSummary = null;
        setMyKeysDateHeader(null);
        return null;
      }
      latestSubscriptionSummary = result.data.subscription || null;
      setMyKeysDateHeader(latestSubscriptionSummary);
      return latestSubscriptionSummary;
    } catch (_err) {
      latestSubscriptionSummary = null;
      setMyKeysDateHeader(null);
      return null;
    }
  }

  async function tryStripeReconcile(userId) {
    if (reconcileInFlight || !hasPendingStripeCheckout()) return false;
    reconcileInFlight = true;
    try {
      const result = await supabaseClient.functions.invoke('stripe-reconcile-subscription', { body: {} });
      if (result.error || !result.data || result.data.ok !== true) {
        return false;
      }
      clearPendingStripeCheckout();
      await loadMyKeys(userId);
      return true;
    } catch (_err) {
      return false;
    } finally {
      reconcileInFlight = false;
    }
  }

  async function refreshSession() {
    const session = await getSession();
    if (cfg.siteMaintenanceEnabled && session && !isMaintenanceAllowedSession(session)) {
      await supabaseClient.auth.signOut();
      setSessionUi(null);
      applyMaintenanceLoggedOutState();
      return;
    }
    setSessionUi(session);
    if (session && session.user) {
      await refreshAccessStatus(session.user.id);
      await Promise.all([
        loadMyKeys(session.user.id),
        refreshAdminEntry()
      ]);
      return;
    }
    if (cfg.siteMaintenanceEnabled) {
      applyMaintenanceLoggedOutState();
    }
  }

  async function refreshAdminEntry() {
    if (!adminEntry) return;
    const isAdmin = await checkIsAdmin();
    setAdminUi(isAdmin);
  }

  async function refreshAccessStatus(userId) {
    if (!userId) return;

    try {
      const [subscriptionSummary, accessStateResult] = await Promise.all([
        loadSubscriptionSummary(),
        supabaseClient.rpc('get_client_access_state', {
          p_trial_days: cfg.trialDays || 7
        })
      ]);
      const data = accessStateResult.data;
      const error = accessStateResult.error;

      if (error) {
        setBillingUi(false);
        setAccessBadge(t('admin_unavailable'), 'error');
        if (accessMeta) accessMeta.textContent = error.message || t('admin_access_table_unavailable');
        return;
      }

      const row = safeArray(data)[0] || null;
      if (!row) {
        setBillingUi(false);
        setAccessBadge(t('admin_unavailable'), 'error');
        if (accessMeta) accessMeta.textContent = t('admin_unexpected_error');
        return;
      }

      if (row.is_admin) {
        clearPendingStripeCheckout();
        setBillingUi(true);
        setAccessBadge(t('account_access_admin_badge'), 'ok');
        if (accessMeta) accessMeta.textContent = t('account_access_admin_meta');
        return;
      }

      if (row.access_granted && (row.access_source === 'activation_key' || row.access_source === 'subscription_canceled' || row.access_source === 'admin_grant')) {
        clearPendingStripeCheckout();
        setBillingUi(true);
        if (row.access_source === 'subscription_canceled' || (subscriptionSummary && subscriptionSummary.cancellationScheduled)) {
          setAccessBadge(t('account_subscription_canceled_badge'), 'warning');
          if (accessMeta) {
            accessMeta.textContent = fillTemplate(t('account_subscription_canceled_meta'), {
              date: formatDate((subscriptionSummary && subscriptionSummary.currentPeriodEndsAt) || row.access_expires_at || '')
            });
          }
          return;
        }
        setAccessBadge(t('account_access_premium_badge'), 'ok');
        if (accessMeta) {
          accessMeta.textContent = fillTemplate(t('account_access_premium_meta'), {
            date: formatDate(row.access_expires_at || '')
          });
        }
        return;
      }

      if (row.access_source === 'expired') {
        setBillingUi(false);
        setAccessBadge(t('account_access_free_badge'), '');
        if (accessMeta) accessMeta.textContent = t('account_access_expired_meta');
        return;
      }

      if (hasPendingStripeCheckout()) {
        const reconciled = await tryStripeReconcile(userId);
        if (reconciled) {
          return refreshAccessStatus(userId);
        }
      }

      setBillingUi(false);
      setAccessBadge(t('account_access_free_badge'), '');
      if (accessMeta) accessMeta.textContent = t('account_access_free_meta');
    } catch (err) {
      setBillingUi(false);
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

  function renderAdminServiceStatus(row) {
    const normalized = row && row.injection_state === 'ok' ? 'ok' : 'maintenance';
    const info = serviceStateInfo(normalized);
    if (adminServiceLive) {
      adminServiceLive.textContent = info.label;
      adminServiceLive.className = 'status-badge ' + info.kind;
    }
    if (adminServicePublished) {
      adminServicePublished.textContent = row && row.published_at
        ? t('site_status_live_since', 'Published on') + ' ' + formatDate(row.published_at)
        : t('site_status_published_empty', 'No public status has been published yet.');
    }
    if (adminServiceLiveMessage) {
      adminServiceLiveMessage.textContent = (row && row.service_message) || defaultServiceMessage(normalized);
    }
    if (adminServiceForm) {
      adminServiceForm.querySelector('[name="injection_state"]').value = normalized;
      adminServiceForm.querySelector('[name="service_message"]').value = (row && row.service_message) || '';
    }
    syncServiceTemplateSelection((row && row.service_message) || '');
  }

  async function loadAdminServiceStatus() {
    if (!adminServiceLive) return;
    adminServiceLive.textContent = t('admin_loading', 'Loading...');
    adminServiceLive.className = 'status-badge';
    if (adminServicePublished) adminServicePublished.textContent = t('site_status_published_loading', 'Checking current public status...');
    if (adminServiceLiveMessage) adminServiceLiveMessage.textContent = '';

    const { data, error } = await supabaseClient.rpc('get_public_service_status', { p_channel: 'stable' });
    if (error) {
      if (adminServiceLive) {
        adminServiceLive.textContent = t('admin_unavailable', 'Unavailable');
        adminServiceLive.className = 'status-badge error';
      }
      if (adminServicePublished) adminServicePublished.textContent = serviceStatusBackendMessage(error.message || '');
      return;
    }

    const row = safeArray(data)[0] || null;
    renderAdminServiceStatus(row);
  }

  async function refreshAdminPanels() {
    if (!adminPanel) return;
    const isAdmin = await checkIsAdmin();
    adminPanel.style.display = isAdmin ? 'block' : 'none';
    setAdminUi(isAdmin);
    if (!isAdmin) return;
    await loadAdminKeys();
    await loadAdminServiceStatus();
  }

  let latestMyKeysRequest = 0;

  async function loadMyKeys(userId) {
    if (!myKeysBody) return;
    const requestId = ++latestMyKeysRequest;
    setMyKeysDateHeader(latestSubscriptionSummary);
    myKeysBody.replaceChildren();
    if (myKeysMsg) msg(myKeysMsg, '');
    if (!userId) return;

    const { data, error } = await supabaseClient
      .from('key_redemptions')
      .select('id, redeemed_at, activation_keys(id, code, expires_at, is_active)')
      .eq('user_id', userId)
      .order('redeemed_at', { ascending: false })
      .limit(20);

    if (requestId !== latestMyKeysRequest) return;

    if (error) {
      if (myKeysMsg) msg(myKeysMsg, error.message || t('account_my_key_load_failed'), 'error');
      return;
    }

    const seen = new Set();
    let rows = safeArray(data).filter(function (row) {
      const keyObj = row.activation_keys || {};
      const uniqueKey = [
        keyObj.id || keyObj.code || '-',
        row.redeemed_at || '-'
      ].join(':');
      if (seen.has(uniqueKey)) return false;
      seen.add(uniqueKey);
      return true;
    });

    if (shouldShowCanonicalSubscriptionKey(latestSubscriptionSummary)) {
      const canonicalCode = String(latestSubscriptionSummary.activationKeyCode || '').trim();
      const canonicalId = Number(latestSubscriptionSummary.activationKeyId || 0) || null;
      const canonicalMatch = rows.find(function (row) {
        const keyObj = row.activation_keys || {};
        return (
          (canonicalId && Number(keyObj.id || 0) === canonicalId) ||
          String(keyObj.code || '').trim() === canonicalCode
        );
      });

      const canonicalRows = canonicalMatch ? [canonicalMatch] : [{
        redeemed_at: latestSubscriptionSummary.currentPeriodStartsAt || latestSubscriptionSummary.updatedAt || null,
        activation_keys: {
          id: canonicalId,
          code: canonicalCode,
          expires_at: latestSubscriptionSummary.activationKeyExpiresAt || latestSubscriptionSummary.currentPeriodEndsAt || null,
          is_active: latestSubscriptionSummary.activationKeyActive !== false
        }
      }];

      rows = canonicalRows;
    }

    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.textContent = t('account_my_key_empty');
      tr.appendChild(td);
      myKeysBody.appendChild(tr);
      return;
    }

    rows.forEach(function (row) {
      const keyObj = row.activation_keys || {};
      const cancellationScheduled = !!(
        keyObj.is_active !== false && (
          (latestSubscriptionSummary && latestSubscriptionSummary.cancellationScheduled) ||
          (accessStatus && accessStatus.textContent === t('account_subscription_canceled_badge'))
        )
      );
      const tr = document.createElement('tr');

      const tdCode = document.createElement('td');
      tdCode.textContent = keyObj.code || '-';
      tr.appendChild(tdCode);

      const tdRedeemed = document.createElement('td');
      tdRedeemed.textContent = formatDate(row.redeemed_at);
      tr.appendChild(tdRedeemed);

      const tdExpires = document.createElement('td');
      tdExpires.textContent = cancellationScheduled
        ? formatDate(latestSubscriptionSummary.currentPeriodEndsAt || keyObj.expires_at || '')
        : (keyObj.expires_at ? formatDate(keyObj.expires_at) : t('account_my_key_subscription_active'));
      tr.appendChild(tdExpires);

      const tdMachine = document.createElement('td');
      tdMachine.textContent = latestSubscriptionSummary && latestSubscriptionSummary.machineActivationActive
        ? t('account_machine_activation_yes')
        : t('account_machine_activation_no');
      tr.appendChild(tdMachine);

      const tdStatus = document.createElement('td');
      tdStatus.textContent = keyObj.is_active === false
        ? t('admin_key_state_inactive')
        : (cancellationScheduled ? t('account_subscription_canceled_table_status') : t('admin_state_active'));
      tr.appendChild(tdStatus);

      myKeysBody.appendChild(tr);
    });
  }

  refreshSession();

  supabaseClient.auth.onAuthStateChange(function (_event, session) {
    setSessionUi(session);
    if (session && session.user) {
      refreshAccessStatus(session.user.id).then(function () {
        return loadMyKeys(session.user.id);
      });
      refreshAdminEntry();
    }
  });

  document.addEventListener('riftskin:language-changed', function () {
    refreshSession();
  });

  document.addEventListener('riftskin:site-maintenance', function () {
    applyMaintenanceLoggedOutState();
  });

  const signInForm = document.querySelector('[data-signin-form]');
  if (signInForm) {
    signInForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (signInPasswordInput && signInPasswordInput.style.display === 'none') {
        setForgotMode(false);
        signInPasswordInput.focus();
        return;
      }
      const email = signInForm.querySelector('[name="email"]').value.trim();
      const password = signInForm.querySelector('[name="password"]').value;
      const out = signInForm.querySelector('[data-msg]');

      msg(out, t('msg_signing_in'));
      const { error } = await supabaseClient.auth.signInWithPassword({ email: email, password: password });
      if (error) {
        if (accountEmailInput) accountEmailInput.value = email;
        if (isEmailNotConfirmedError(error)) {
          setResendVisibility(true);
          msg(out, t('msg_email_not_confirmed'), 'error');
        } else {
          setResendVisibility(false);
          msg(out, error.message || t('msg_sign_in_failed'), 'error');
        }
        return;
      }

      const refreshedSession = await getSession();
      if (cfg.siteMaintenanceEnabled && refreshedSession && !isMaintenanceAllowedSession(refreshedSession)) {
        await supabaseClient.auth.signOut();
        msg(out, getMaintenanceMessage(), 'error');
        applyMaintenanceLoggedOutState();
        return;
      }

      setResendVisibility(false);
      msg(resendMsg, '', '');
      if (accountEmailInput) accountEmailInput.value = email;
      msg(out, t('msg_signed_in'), 'ok');
      pushAnalyticsEvent('riftskin_signin_success');
      await refreshSession();
      document.dispatchEvent(new CustomEvent('riftskin:signin-success'));
    });
  }

  const signUpForm = document.querySelector('[data-signup-form]');
  if (signUpForm) {
    signUpForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (cfg.siteMaintenanceEnabled) {
        const out = signUpForm.querySelector('[data-msg]');
        msg(out, getMaintenanceMessage(), 'error');
        return;
      }
      const out = signUpForm.querySelector('[data-msg]');

      const email = signUpForm.querySelector('[name="email"]').value.trim();
      const password = signUpForm.querySelector('[name="password"]').value;
      const confirm = signUpForm.querySelector('[name="confirm_password"]').value;

      if (password.length < 8) {
        msg(out, t('msg_password_len'), 'error');
        return;
      }
      if (password !== confirm) {
        msg(out, t('msg_password_match'), 'error');
        return;
      }

      msg(out, t('msg_creating_account'));
      const confirmationResult = await supabaseClient.functions.invoke('account-signup', {
        body: {
          email: email,
          password: password,
          redirectTo: authCallbackUrl()
        }
      });

      if (confirmationResult.error || !confirmationResult.data || confirmationResult.data.ok !== true) {
        const rawMessage = await extractFunctionErrorMessage(confirmationResult);
        const message = rawMessage === 'account_exists'
          ? t('msg_account_exists')
          : (rawMessage || t('msg_signup_failed'));
        msg(out, message, 'error');
        return;
      }

      if (accountEmailInput) accountEmailInput.value = email;
      setResendVisibility(true);
      msg(
        out,
        confirmationResult.data.mode === 'resend'
          ? t('msg_account_confirmation_pending')
          : t('msg_account_created'),
        'ok'
      );
      pushAnalyticsEvent('riftskin_signup_success');
    });
  }

  const forgotBtn = document.querySelector('[data-forgot]');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', async function () {
      const out = document.querySelector('[data-forgot-msg]');
      const email = (accountEmailInput && accountEmailInput.value.trim()) || '';
      if (!email || email.indexOf('@') === -1) {
        setForgotMode(true);
        msg(out, t('msg_enter_email_first'), 'error');
        return;
      }

      setForgotMode(true);
      msg(out, t('msg_sending_reset'));
      const { data, error } = await supabaseClient.functions.invoke('auth-password-reset', {
        body: {
          email: email,
          redirectTo: authCallbackUrl()
        }
      });

      if (error || !data || data.ok !== true) {
        const message = error && error.message ? error.message : (data && (data.message || data.error)) || t('msg_reset_failed');
        msg(out, message, 'error');
        return;
      }

      msg(out, t('msg_reset_sent'), 'ok');
    });
  }

  if (resendConfirmationBtn) {
    resendConfirmationBtn.addEventListener('click', async function () {
      const email = (accountEmailInput && accountEmailInput.value.trim()) || '';
      if (!email || email.indexOf('@') === -1) {
        msg(resendMsg, t('msg_enter_email_first'), 'error');
        return;
      }

      msg(resendMsg, t('msg_sending_confirmation'), '');
      const { data, error } = await supabaseClient.functions.invoke('auth-send-confirmation', {
        body: {
          email: email,
          redirectTo: authCallbackUrl()
        }
      });

      if (error || !data || data.ok !== true) {
        const message = error && error.message ? error.message : (data && (data.message || data.error)) || t('msg_confirmation_resend_failed');
        msg(resendMsg, message, 'error');
        return;
      }

      msg(resendMsg, t('msg_confirmation_resent'), 'ok');
    });
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener('click', async function () {
      msg(adminListMsg, t('admin_refreshing'));
      await refreshAdminPanels();
      msg(adminListMsg, '', '');
    });
  }

  if (adminCreateForm) {
    bindKeyKindToggle(adminCreateForm);

    adminCreateForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminCreateMsg, t('admin_creating_key'));
      if (adminKeyOutput) {
        adminKeyOutput.style.display = 'none';
        adminKeyOutput.textContent = '';
      }

      const fd = new FormData(adminCreateForm);
      const config = adminKeyConfig(fd.get('key_kind'));
      const durationMonths = Number(fd.get('duration_months') || 1);

      const { data, error } = await createActivationKeyRpc({
        p_for_email: null,
        p_note: null,
        p_max_uses: 1,
        p_valid_months: config.isPermanent ? null : durationMonths,
        p_grant_months: config.isPermanent ? null : durationMonths,
        p_is_permanent: config.isPermanent
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

      msg(adminCreateMsg, t('admin_key_created_ok'), 'ok');
      renderAdminKeyOutput(adminKeyOutput, code, row, config);

      adminCreateForm.reset();
      await loadAdminKeys();
    });
  }

  if (adminBoundForm) {
    bindKeyKindToggle(adminBoundForm);

    adminBoundForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminBoundMsg, t('admin_creating_key'));
      if (adminBoundOutput) {
        adminBoundOutput.style.display = 'none';
        adminBoundOutput.textContent = '';
      }

      const fd = new FormData(adminBoundForm);
      const userEmail = ((fd.get('user_email') || '').toString().trim()) || '';
      const config = adminKeyConfig(fd.get('key_kind'));
      const durationMonths = Number(fd.get('duration_months') || 1);

      if (!userEmail) {
        msg(adminBoundMsg, t('admin_attach_fields_required'), 'error');
        return;
      }

      const createResult = await createActivationKeyRpc({
        p_for_email: userEmail,
        p_note: null,
        p_max_uses: 1,
        p_valid_months: config.isPermanent ? null : durationMonths,
        p_grant_months: config.isPermanent ? null : durationMonths,
        p_is_permanent: config.isPermanent
      });
      if (createResult.error) {
        msg(adminBoundMsg, createResult.error.message || t('admin_key_create_failed'), 'error');
        return;
      }

      const createdRow = safeArray(createResult.data)[0] || {};
      const keyCode = createdRow.code || '';
      if (!keyCode) {
        msg(adminBoundMsg, t('admin_key_create_failed'), 'error');
        return;
      }

      const { data, error } = await supabaseClient.rpc('attach_activation_key_to_user', {
        p_code: keyCode,
        p_user_email: userEmail
      });
      if (error) {
        msg(adminBoundMsg, error.message || t('admin_attach_failed'), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      const text = decodeActivationMessage(row.message || '');
      if (!row.success) {
        msg(adminBoundMsg, text || t('admin_attach_failed'), 'error');
        return;
      }

      msg(adminBoundMsg, t('admin_key_created_attached_ok'), 'ok');
      renderAdminKeyOutput(adminBoundOutput, keyCode, createdRow, config);
      adminBoundForm.reset();
      await loadAdminKeys();
    });
  }

  if (adminServiceForm) {
    const serviceMessageInput = getServiceMessageInput();
    if (adminServiceTemplate) {
      adminServiceTemplate.addEventListener('change', function () {
        const selected = adminServiceTemplate.value || CUSTOM_SERVICE_TEMPLATE;
        if (selected === CUSTOM_SERVICE_TEMPLATE) {
          updateServiceTemplateHelper(null, serviceMessageInput ? serviceMessageInput.value : '');
          return;
        }
        applyServiceTemplate(selected);
      });
    }

    if (serviceMessageInput) {
      serviceMessageInput.addEventListener('input', function () {
        syncServiceTemplateSelection(serviceMessageInput.value || '');
      });
    }

    adminServiceForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      msg(adminServiceMsg, 'Publishing desktop status...');

      const fd = new FormData(adminServiceForm);
      const injectionState = ((fd.get('injection_state') || '').toString().trim()) || 'maintenance';
      const serviceMessage = ((fd.get('service_message') || '').toString().trim()) || null;

      const { data, error } = await supabaseClient.rpc('set_public_service_status', {
        p_channel: 'stable',
        p_injection_state: injectionState,
        p_service_message: serviceMessage
      });

      if (error) {
        msg(adminServiceMsg, serviceStatusBackendMessage(error.message || ''), 'error');
        return;
      }

      const row = safeArray(data)[0] || {};
      if (!row.success) {
        msg(adminServiceMsg, row.message || 'Failed to publish desktop status.', 'error');
        return;
      }

      msg(adminServiceMsg, 'Desktop status updated.', 'ok');
      await loadAdminServiceStatus();
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
      if (out) {
        out.textContent = '';
        out.className = 'msg';
      }
      await refreshSession();
    });
  }

  if (emailChangeForm) {
    emailChangeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const session = await getSession();
      if (!session || !session.user) {
        msg(emailChangeMsg, t('admin_sign_in_required'), 'error');
        return;
      }

      const currentEmail = (session.user.email || '').trim().toLowerCase();
      const newEmail = (emailChangeForm.querySelector('[name="new_email"]').value || '').trim().toLowerCase();

      if (!newEmail || newEmail.indexOf('@') === -1) {
        msg(emailChangeMsg, t('msg_enter_email_first'), 'error');
        return;
      }
      if (newEmail === currentEmail) {
        msg(emailChangeMsg, t('msg_email_same'), 'error');
        return;
      }

      msg(emailChangeMsg, t('msg_updating_email'), '');
      const { error } = await supabaseClient.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: authCallbackUrl() }
      );

      if (error) {
        msg(emailChangeMsg, error.message || t('msg_email_change_failed'), 'error');
        return;
      }

      emailChangeForm.reset();
      msg(emailChangeMsg, t('msg_email_change_sent'), 'ok');
    });
  }

  if (passwordChangeForm) {
    passwordChangeForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const session = await getSession();
      if (!session || !session.user) {
        msg(passwordChangeMsg, t('admin_sign_in_required'), 'error');
        return;
      }

      const currentPassword = passwordChangeForm.querySelector('[name="current_password"]').value || '';
      const newPassword = passwordChangeForm.querySelector('[name="new_password"]').value || '';
      const confirmPassword = passwordChangeForm.querySelector('[name="confirm_password"]').value || '';
      const currentEmail = (session.user.email || '').trim();

      if (!currentPassword) {
        msg(passwordChangeMsg, t('msg_current_password_required'), 'error');
        return;
      }
      if (newPassword.length < 8) {
        msg(passwordChangeMsg, t('msg_password_len'), 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        msg(passwordChangeMsg, t('msg_password_match'), 'error');
        return;
      }
      if (newPassword === currentPassword) {
        msg(passwordChangeMsg, t('msg_new_password_same'), 'error');
        return;
      }

      msg(passwordChangeMsg, t('msg_updating_password'), '');

      const { error: reauthError } = await supabaseClient.auth.signInWithPassword({
        email: currentEmail,
        password: currentPassword
      });

      if (reauthError) {
        msg(passwordChangeMsg, t('msg_current_password_invalid'), 'error');
        return;
      }

      const { error: updateError } = await supabaseClient.auth.updateUser({ password: newPassword });

      if (updateError) {
        msg(passwordChangeMsg, updateError.message || t('msg_password_change_failed'), 'error');
        return;
      }

      passwordChangeForm.reset();
      msg(passwordChangeMsg, t('msg_password_changed'), 'ok');
    });
  }

  if (deleteAccountForm) {
    deleteAccountForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const session = await getSession();
      if (!session || !session.user) {
        msg(deleteAccountMsg, t('admin_sign_in_required'), 'error');
        return;
      }

      const password = deleteAccountForm.querySelector('[name="password"]').value || '';
      const confirmationText = (deleteAccountForm.querySelector('[name="confirmation_text"]').value || '').trim();

      if (!password) {
        msg(deleteAccountMsg, t('msg_current_password_required'), 'error');
        return;
      }
      if (confirmationText !== 'YES, I WANT TO DELETE MY ACCOUNT AND DATA') {
        msg(deleteAccountMsg, t('msg_delete_confirmation_mismatch'), 'error');
        return;
      }

      msg(deleteAccountMsg, t('msg_deleting_account'), '');
      const { data, error } = await supabaseClient.functions.invoke('delete-account', {
        body: {
          password: password,
          confirmationText: confirmationText
        }
      });

      if (error) {
        msg(deleteAccountMsg, error.message || t('msg_delete_account_failed'), 'error');
        return;
      }

      if (!data || data.ok !== true) {
        const code = data && data.error ? data.error : '';
        if (code === 'active_subscription') {
          msg(deleteAccountMsg, t('msg_delete_account_active_subscription'), 'error');
          return;
        }
        if (code === 'invalid_password') {
          msg(deleteAccountMsg, t('msg_current_password_invalid'), 'error');
          return;
        }
        if (code === 'invalid_confirmation_text') {
          msg(deleteAccountMsg, t('msg_delete_confirmation_mismatch'), 'error');
          return;
        }
        msg(deleteAccountMsg, t('msg_delete_account_failed'), 'error');
        return;
      }

      try {
        await supabaseClient.auth.signOut();
      } catch (_error) {
        window.sessionStorage.clear();
      }

      resetAccountManagementUi();
      msg(deleteAccountMsg, t('msg_account_deleted'), 'ok');
      await refreshSession();
      window.location.href = '/account.html';
    });
  }
})();
