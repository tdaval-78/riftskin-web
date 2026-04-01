(function () {
  const cfg = window.RiftSkinConfig || {};
  const sessionStatus = document.querySelector('[data-admin-session-status]');
  const adminGuard = document.querySelector('[data-admin-guard]');
  const adminGuardTitle = document.querySelector('[data-admin-guard-title]');
  const adminGuardMessage = document.querySelector('[data-admin-guard-message]');
  const adminContent = document.querySelector('[data-admin-content]');
  const adminEmail = document.querySelector('[data-admin-email]');
  const adminRefreshBtn = document.querySelector('[data-admin-refresh]');
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

  function t(key, fallback) {
    if (window.RiftSkinI18n && typeof window.RiftSkinI18n.t === 'function') {
      const translated = window.RiftSkinI18n.t(key);
      return translated === key && typeof fallback === 'string' ? fallback : translated;
    }
    return typeof fallback === 'string' ? fallback : key;
  }

  function msg(target, text, type) {
    if (!target) return;
    target.textContent = text || '';
    target.className = 'msg ' + (type || '');
  }

  function setSessionBadge(text, kind) {
    if (!sessionStatus) return;
    sessionStatus.textContent = text;
    sessionStatus.className = 'status-badge ' + (kind || '');
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function formatDate(isoString) {
    if (!isoString) return t('admin_not_available', 'Not available');
    const dt = new Date(isoString);
    if (Number.isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString();
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
        : 'Message manuel, traduction libre.';
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
    if (stateInput) stateInput.value = template.state;
    updateServiceTemplateHelper(template, template.message);
  }

  function serviceStatusBackendMessage(errorText) {
    if (/get_public_service_status|set_public_service_status/i.test(errorText || '')) {
      return "Le backend du statut desktop n'est pas encore deploye. Appliquez d'abord le SQL du statut de service sur le projet Supabase du site.";
    }
    return errorText || "Impossible de charger le statut desktop.";
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
      adminServiceLive.textContent = t('admin_unavailable', 'Unavailable');
      adminServiceLive.className = 'status-badge error';
      if (adminServicePublished) adminServicePublished.textContent = serviceStatusBackendMessage(error.message || '');
      return;
    }

    const row = safeArray(data)[0] || null;
    renderAdminServiceStatus(row);
  }

  function showGuard(title, message, kind) {
    if (adminGuard) adminGuard.style.display = 'block';
    if (adminContent) adminContent.style.display = 'none';
    if (adminGuardTitle) adminGuardTitle.textContent = title;
    if (adminGuardMessage) adminGuardMessage.textContent = message;
    setSessionBadge(title, kind || '');
  }

  async function getSession() {
    const { data } = await supabaseClient.auth.getSession();
    return data ? data.session : null;
  }

  async function checkIsAdmin() {
    const { data, error } = await supabaseClient.rpc('is_app_admin');
    if (error) return false;
    return data === true;
  }

  async function refreshAdminPage() {
    const session = await getSession();
    const user = session && session.user ? session.user : null;

    if (!user) {
      if (adminEmail) adminEmail.textContent = '-';
      showGuard(
        t('admin_sign_in_required', 'Sign in required'),
        t('site_admin_guard_auth', 'Sign in on your account page with the admin account to access this console.'),
        ''
      );
      return;
    }

    if (adminEmail) adminEmail.textContent = user.email || '-';

    const isAdmin = await checkIsAdmin();
    if (!isAdmin) {
      showGuard(
        t('admin_msg_not_admin', 'Admin rights are required.'),
        t('site_admin_guard_forbidden', 'This authenticated account does not have admin rights for the RIFTSKIN console.'),
        'error'
      );
      return;
    }

    if (adminGuard) adminGuard.style.display = 'none';
    if (adminContent) adminContent.style.display = 'grid';
    setSessionBadge(t('msg_status_connected', 'Connected'), 'ok');
    await loadAdminServiceStatus();
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    showGuard(
      t('admin_unavailable', 'Unavailable'),
      t('msg_status_supabase_missing', 'Supabase config missing'),
      'error'
    );
    return;
  }

  const authStorage = window.localStorage || window.sessionStorage;
  const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener('click', async function () {
      msg(adminServiceMsg, '');
      await refreshAdminPage();
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

  refreshAdminPage();

  supabaseClient.auth.onAuthStateChange(function () {
    refreshAdminPage();
  });

  document.addEventListener('riftskin:language-changed', function () {
    refreshAdminPage();
  });
})();
