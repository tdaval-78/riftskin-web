(function () {
  const cfg = window.RiftSkinConfig || {};
  window.dataLayer = window.dataLayer || [];
  const form = document.getElementById('support-form');
  const out = document.getElementById('support-msg');
  const emailInput = form ? form.querySelector('[name="email"]') : null;
  const topicSelect = form ? form.querySelector('[name="topic"]') : null;
  const fileInput = form ? form.querySelector('[name="attachments"]') : null;
  const fileList = document.getElementById('support-files-list');
  const i18n = window.RiftSkinI18n;
  const t = function (key) { return i18n ? i18n.t(key) : key; };

  if (!form) return;

  function pushAnalyticsEvent(eventName, params) {
    if (!eventName) return;
    window.dataLayer.push(Object.assign({
      event: eventName,
      page_type: document.body.getAttribute('data-page') || 'unknown',
      page_path: window.location.pathname
    }, params || {}));
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getSelectedFiles() {
    return fileInput ? Array.from(fileInput.files || []) : [];
  }

  function renderSelectedFiles() {
    const files = getSelectedFiles();
    if (!fileList) return;
    fileList.textContent = '';
    fileList.className = 'support-files-list';

    if (!files.length) {
      return;
    }

    const title = document.createElement('div');
    title.className = 'support-files-title';
    title.textContent = t('site_support_files_selected');
    fileList.appendChild(title);

    const list = document.createElement('ul');
    list.className = 'support-files-items';

    files.forEach(function (file) {
      const item = document.createElement('li');
      item.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
      list.appendChild(item);
    });

    fileList.appendChild(list);
  }

  async function prefillAccountEmail() {
    if (!emailInput || emailInput.value || !window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      return;
    }

    try {
      const authStorage = window.localStorage || window.sessionStorage;
      const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: {
          storage: authStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      });
      const sessionResult = await supabaseClient.auth.getSession();
      const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      const sessionEmail = session && session.user ? session.user.email : '';

      if (sessionEmail) {
        emailInput.value = sessionEmail;
      }
    } catch (_err) {
      // No-op: the support form should remain usable even if auth lookup fails.
    }
  }

  if (fileInput) {
    fileInput.addEventListener('change', renderSelectedFiles);
  }

  renderSelectedFiles();
  prefillAccountEmail();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      out.textContent = t('site_support_submit_error');
      out.className = 'msg error';
      return;
    }

    const data = new FormData(form);
    const name = (data.get('name') || '').toString().trim();
    const email = (data.get('email') || '').toString().trim();
    const topic = (data.get('topic') || '').toString().trim();
    const website = (data.get('website') || '').toString().trim();
    const selectedTopicLabel = topicSelect && topicSelect.selectedIndex >= 0
      ? topicSelect.options[topicSelect.selectedIndex].textContent.trim()
      : topic;
    const message = (data.get('message') || '').toString().trim();
    const supportData = new FormData();
    const attachments = getSelectedFiles();

    supportData.append('name', name);
    supportData.append('email', email);
    supportData.append('topic', topic);
    supportData.append('topic_label', selectedTopicLabel);
    supportData.append('message', message);
    supportData.append('website', website);

    pushAnalyticsEvent('riftskin_support_submit_attempt', {
      support_topic: topic || 'unknown',
      attachments_count: attachments.length
    });

    attachments.forEach(function (file) {
      supportData.append('attachments', file, file.name);
    });

    out.textContent = t('site_support_submit_sending');
    out.className = 'msg';

    try {
      let authToken = cfg.supabaseAnonKey;
      if (window.supabase) {
        const authStorage = window.localStorage || window.sessionStorage;
        const supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: {
            storage: authStorage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false
          }
        });
        const sessionResult = await supabaseClient.auth.getSession();
        const session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
        if (session && session.access_token) {
          authToken = session.access_token;
        }
      }

      const response = await fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/functions/v1/support-request', {
        method: 'POST',
        headers: {
          apikey: cfg.supabaseAnonKey,
          Authorization: 'Bearer ' + authToken
        },
        body: supportData
      });

      const payload = await response.json().catch(function () { return null; });
      if (!response.ok || !payload || !payload.ok) {
        throw new Error(payload && payload.message ? payload.message : 'request_failed');
      }

      form.reset();
      renderSelectedFiles();
      prefillAccountEmail();
      out.textContent = t('site_support_submit_success');
      out.className = 'msg ok';
      pushAnalyticsEvent('riftskin_support_submit_success', {
        support_topic: topic || 'unknown',
        attachments_count: attachments.length
      });
    } catch (err) {
      const rawMessage = err && err.message ? String(err.message) : '';
      if (rawMessage === 'Please wait a moment before sending another support request.') {
        out.textContent = t('site_support_submit_rate_limited');
      } else {
        out.textContent = rawMessage || t('site_support_submit_error');
      }
      out.className = 'msg error';
      pushAnalyticsEvent('riftskin_support_submit_error', {
        support_topic: topic || 'unknown',
        attachments_count: attachments.length
      });
    }
  });
})();
