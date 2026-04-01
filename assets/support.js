(function () {
  const cfg = window.RiftSkinConfig || {};
  window.dataLayer = window.dataLayer || [];
  const form = document.getElementById('support-form');
  const out = document.getElementById('support-msg');
  const emailInput = form ? form.querySelector('[name="email"]') : null;
  const topicSelect = form ? form.querySelector('[name="topic"]') : null;
  const messageInput = form ? form.querySelector('[name="message"]') : null;
  const submitBtn = document.getElementById('support-submit');
  const appVersionWrap = document.getElementById('support-app-version');
  const appVersionSelect = document.getElementById('support-app-version-select');
  const appVersionOtherInput = document.getElementById('support-app-version-other');
  const fileInput = form ? form.querySelector('[name="attachments"]') : null;
  const fileList = document.getElementById('support-files-list');
  const fileTrigger = document.getElementById('support-files-trigger');
  const uploadActions = document.getElementById('support-upload-actions');
  const i18n = window.RiftSkinI18n;
  const t = function (key) { return i18n ? i18n.t(key) : key; };
  const MAX_ATTACHMENTS = 5;
  const APP_VERSION_OPTIONS = [
    'v26.3.33',
    'v26.3.32',
    'v26.3.31',
    'v26.3.30',
    'v26.3.29',
    'v26.3.28',
    'v26.3.27',
    'v26.3.26',
    'v26.3.25',
    'v26.3.24'
  ];
  let selectedFiles = [];
  let objectUrls = new Map();

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
    return selectedFiles.slice();
  }

  function revokeObjectUrl(name) {
    const url = objectUrls.get(name);
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.delete(name);
  }

  function getObjectUrl(file) {
    const key = [file.name, file.size, file.lastModified].join(':');
    if (!objectUrls.has(key)) {
      objectUrls.set(key, URL.createObjectURL(file));
    }
    return objectUrls.get(key);
  }

  function getFileKey(file) {
    return [file.name, file.size, file.lastModified].join(':');
  }

  function formatFileCount(count) {
    if (count <= 1) return '1 ' + t('site_support_files_count_single');
    return count + ' ' + t('site_support_files_count_plural');
  }

  function renderAppVersionOptions() {
    if (!appVersionSelect) return;
    const currentValue = appVersionSelect.value;
    const placeholder = appVersionSelect.querySelector('option[value=""]');
    appVersionSelect.textContent = '';
    if (placeholder) {
      placeholder.textContent = t('site_support_app_version_ph');
      appVersionSelect.appendChild(placeholder);
    } else {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = t('site_support_app_version_ph');
      appVersionSelect.appendChild(option);
    }

    APP_VERSION_OPTIONS.forEach(function (version) {
      const option = document.createElement('option');
      option.value = version;
      option.textContent = version;
      appVersionSelect.appendChild(option);
    });

    const unknownOption = document.createElement('option');
    unknownOption.value = 'unknown';
    unknownOption.textContent = t('site_support_app_version_unknown');
    appVersionSelect.appendChild(unknownOption);

    const otherOption = document.createElement('option');
    otherOption.value = 'other';
    otherOption.textContent = t('site_support_app_version_other');
    appVersionSelect.appendChild(otherOption);

    if (currentValue) {
      appVersionSelect.value = currentValue;
    }
  }

  function syncAppVersionVisibility() {
    if (!topicSelect || !appVersionWrap || !appVersionSelect || !appVersionOtherInput) return;
    const requiresVersion = topicSelect.value === 'application' || topicSelect.value === 'subscription';
    appVersionWrap.hidden = !requiresVersion;
    appVersionSelect.required = requiresVersion;

    const wantsOther = requiresVersion && appVersionSelect.value === 'other';
    appVersionOtherInput.hidden = !wantsOther;
    appVersionOtherInput.required = wantsOther;

    if (!requiresVersion) {
      appVersionSelect.value = '';
      appVersionOtherInput.value = '';
      appVersionOtherInput.hidden = true;
      appVersionOtherInput.required = false;
    }
    updateSubmitState();
  }

  function isSubmitReady() {
    const name = form && form.elements.name ? String(form.elements.name.value || '').trim() : '';
    const email = form && form.elements.email ? String(form.elements.email.value || '').trim() : '';
    const topic = topicSelect ? String(topicSelect.value || '').trim() : '';
    const message = messageInput ? String(messageInput.value || '').trim() : '';
    const requiresVersion = topic === 'application' || topic === 'subscription';
    const appVersion = appVersionSelect ? String(appVersionSelect.value || '').trim() : '';
    const appVersionOther = appVersionOtherInput ? String(appVersionOtherInput.value || '').trim() : '';
    const hasVersion = !requiresVersion || (appVersion && (appVersion !== 'other' || appVersionOther));
    return Boolean(name && email && topic && message && hasVersion);
  }

  function updateSubmitState() {
    if (!submitBtn) return;
    const ready = isSubmitReady();
    submitBtn.textContent = ready
      ? t('site_support_submit')
      : t('site_support_submit_pending');
    submitBtn.disabled = !ready;
    submitBtn.classList.toggle('is-disabled', !ready);
  }

  function removeSelectedFile(fileKey) {
    const nextFiles = [];
    selectedFiles.forEach(function (file) {
      const key = getFileKey(file);
      if (key === fileKey) {
        revokeObjectUrl(key);
        return;
      }
      nextFiles.push(file);
    });
    selectedFiles = nextFiles;
    renderSelectedFiles();
  }

  function appendSelectedFile(file) {
    if (!file || selectedFiles.length >= MAX_ATTACHMENTS) return;
    const key = getFileKey(file);
    const exists = selectedFiles.some(function (item) {
      return getFileKey(item) === key;
    });
    if (exists) return;
    selectedFiles = selectedFiles.concat(file).slice(0, MAX_ATTACHMENTS);
  }

  function renderSelectedFiles() {
    const files = getSelectedFiles();
    if (!fileList) return;
    fileList.textContent = '';
    fileList.className = 'support-files-list';
    if (uploadActions) {
      uploadActions.textContent = '';
      if (files.length < MAX_ATTACHMENTS) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost';
        button.id = 'support-files-trigger';
        button.textContent = files.length
          ? t('site_support_files_pick_more')
          : t('site_support_files_pick_one');
        button.addEventListener('click', function () {
          if (fileInput) fileInput.click();
        });
        uploadActions.appendChild(button);
      }
    }

    if (!files.length) {
      return;
    }

    const title = document.createElement('div');
    title.className = 'support-files-title';
    title.textContent = t('site_support_files_selected');
    fileList.appendChild(title);

    const summary = document.createElement('div');
    summary.className = 'support-files-summary';

    const summaryThumb = document.createElement('div');
    summaryThumb.className = 'support-files-summary-thumb';
    const firstFile = files[0];
    if (firstFile && firstFile.type && firstFile.type.startsWith('image/')) {
      const thumbImg = document.createElement('img');
      thumbImg.src = getObjectUrl(firstFile);
      thumbImg.alt = firstFile.name;
      summaryThumb.appendChild(thumbImg);
    } else {
      summaryThumb.textContent = files.length;
    }
    summary.appendChild(summaryThumb);

    const summaryText = document.createElement('div');
    summaryText.className = 'support-files-summary-text';
    summaryText.textContent = formatFileCount(files.length);
    summary.appendChild(summaryText);
    fileList.appendChild(summary);

    const list = document.createElement('div');
    list.className = 'support-files-items';

    files.forEach(function (file) {
      const item = document.createElement('div');
      item.className = 'support-file-item';

      const meta = document.createElement('div');
      meta.className = 'support-file-item-meta';

      const name = document.createElement('div');
      name.className = 'support-file-item-name';
      name.textContent = file.name;

      const size = document.createElement('div');
      size.className = 'support-file-item-size';
      size.textContent = formatFileSize(file.size);

      meta.appendChild(name);
      meta.appendChild(size);
      item.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'support-file-item-actions';

      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'support-file-action';
      previewBtn.setAttribute('aria-label', t('site_support_files_preview'));
      previewBtn.title = t('site_support_files_preview');
      previewBtn.textContent = '👁';
      previewBtn.addEventListener('click', function () {
        window.open(getObjectUrl(file), '_blank', 'noopener');
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'support-file-action support-file-action-remove';
      removeBtn.setAttribute('aria-label', t('site_support_files_remove'));
      removeBtn.title = t('site_support_files_remove');
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', function () {
        removeSelectedFile(getFileKey(file));
      });

      actions.appendChild(previewBtn);
      actions.appendChild(removeBtn);
      item.appendChild(actions);
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
        updateSubmitState();
      }
    } catch (_err) {
      // No-op: the support form should remain usable even if auth lookup fails.
    }
  }

  if (fileTrigger && fileInput) {
    fileTrigger.addEventListener('click', function () {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', function () {
      const pickedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (pickedFile) {
        appendSelectedFile(pickedFile);
      }
      fileInput.value = '';
      renderSelectedFiles();
    });
  }

  renderSelectedFiles();
  renderAppVersionOptions();
  syncAppVersionVisibility();
  prefillAccountEmail();
  document.addEventListener('riftskin:language-changed', function () {
    renderSelectedFiles();
    renderAppVersionOptions();
    syncAppVersionVisibility();
    updateSubmitState();
  });

  if (topicSelect) {
    topicSelect.addEventListener('change', syncAppVersionVisibility);
  }

  if (appVersionSelect) {
    appVersionSelect.addEventListener('change', syncAppVersionVisibility);
  }

  [form.elements.name, form.elements.email, topicSelect, messageInput, appVersionSelect, appVersionOtherInput].forEach(function (field) {
    if (!field) return;
    field.addEventListener('input', updateSubmitState);
    field.addEventListener('change', updateSubmitState);
  });

  updateSubmitState();

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!isSubmitReady()) {
      updateSubmitState();
      return;
    }
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
    const appVersion = (data.get('app_version') || '').toString().trim();
    const appVersionOther = (data.get('app_version_other') || '').toString().trim();
    const resolvedAppVersion = appVersion === 'other' ? appVersionOther : appVersion;
    const message = (data.get('message') || '').toString().trim();
    const supportData = new FormData();
    const attachments = getSelectedFiles();

    supportData.append('name', name);
    supportData.append('email', email);
    supportData.append('topic', topic);
    supportData.append('topic_label', selectedTopicLabel);
    supportData.append('app_version', resolvedAppVersion);
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
      selectedFiles.forEach(function (file) {
        revokeObjectUrl(getFileKey(file));
      });
      selectedFiles = [];
      renderSelectedFiles();
      renderAppVersionOptions();
      syncAppVersionVisibility();
      prefillAccountEmail();
      updateSubmitState();
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

  window.addEventListener('beforeunload', function () {
    Array.from(objectUrls.values()).forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    objectUrls.clear();
  });
})();
