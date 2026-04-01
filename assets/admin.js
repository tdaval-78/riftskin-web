(function () {
  const cfg = window.RiftSkinConfig || {};
  const sessionStatus = document.querySelector('[data-admin-session-status]');
  const adminGuard = document.querySelector('[data-admin-guard]');
  const adminGuardTitle = document.querySelector('[data-admin-guard-title]');
  const adminGuardMessage = document.querySelector('[data-admin-guard-message]');
  const adminContent = document.querySelector('[data-admin-content]');
  const adminEmail = document.querySelector('[data-admin-email]');
  const adminRefreshBtn = document.querySelector('[data-admin-refresh]');
  const adminStripeLinks = Array.from(document.querySelectorAll('[data-admin-stripe-link]'));
  const adminServiceForm = document.querySelector('[data-admin-service-form]');
  const adminServiceMsg = document.querySelector('[data-admin-service-msg]');
  const adminServiceLive = document.querySelector('[data-admin-service-live]');
  const adminServicePublished = document.querySelector('[data-admin-service-published]');
  const adminServiceLiveMessage = document.querySelector('[data-admin-service-live-message]');
  const adminServiceTemplate = document.querySelector('[data-admin-service-template]');
  const adminServiceTemplatePreview = document.querySelector('[data-admin-service-template-preview]');
  const adminServiceTemplateTranslation = document.querySelector('[data-admin-service-template-translation]');
  const adminViewLinks = Array.from(document.querySelectorAll('[data-admin-view-link]'));
  const adminViews = Array.from(document.querySelectorAll('[data-admin-view]'));

  const overviewAccountsEl = document.querySelector('[data-admin-overview-accounts]');
  const overviewActiveWebEl = document.querySelector('[data-admin-overview-active-web]');
  const overviewPremiumEl = document.querySelector('[data-admin-overview-premium]');
  const overviewCanceledEl = document.querySelector('[data-admin-overview-canceled]');
  const overviewReleaseEl = document.querySelector('[data-admin-overview-release]');
  const overviewReleaseDateEl = document.querySelector('[data-admin-overview-release-date]');
  const accountsChart = document.querySelector('[data-admin-chart-accounts]');
  const salesChart = document.querySelector('[data-admin-chart-sales]');
  const providerChart = document.querySelector('[data-admin-chart-provider]');
  const salesDetailChart = document.querySelector('[data-admin-chart-sales-detail]');
  const accountTimelineChart = document.querySelector('[data-admin-chart-account-timeline]');
  const salesTimelineChart = document.querySelector('[data-admin-chart-sales-timeline]');
  const revenueTimelineChart = document.querySelector('[data-admin-chart-revenue-timeline]');

  const accountTotalEl = document.querySelector('[data-admin-accounts-total]');
  const accountConfirmedEl = document.querySelector('[data-admin-accounts-confirmed]');
  const accountConnectedEl = document.querySelector('[data-admin-accounts-connected]');
  const accountActiveEl = document.querySelector('[data-admin-accounts-active]');
  const accountsBody = document.querySelector('[data-admin-accounts-body]');
  const accountsMsg = document.querySelector('[data-admin-accounts-msg]');

  const salesActiveEl = document.querySelector('[data-admin-sales-active]');
  const salesCanceledEl = document.querySelector('[data-admin-sales-canceled-running]');
  const salesEndedEl = document.querySelector('[data-admin-sales-ended]');
  const salesTotalEl = document.querySelector('[data-admin-sales-total]');
  const salesRevenueYearEl = document.querySelector('[data-admin-sales-revenue-year]');
  const salesInvoicesYearEl = document.querySelector('[data-admin-sales-invoices-year]');
  const salesNewYearEl = document.querySelector('[data-admin-sales-new-year]');
  const salesRenewalsEl = document.querySelector('[data-admin-sales-renewals]');
  const salesBillingIssuesEl = document.querySelector('[data-admin-sales-billing-issues]');
  const salesYearSelect = document.querySelector('[data-admin-sales-year]');
  const salesFilterEmail = document.querySelector('[data-admin-sales-filter-email]');
  const salesFilterProvider = document.querySelector('[data-admin-sales-filter-provider]');
  const salesFilterStatus = document.querySelector('[data-admin-sales-filter-status]');
  const salesFilterCanceled = document.querySelector('[data-admin-sales-filter-canceled]');
  const salesFilterCount = document.querySelector('[data-admin-sales-filter-count]');
  const salesBody = document.querySelector('[data-admin-sales-body]');
  const salesMsg = document.querySelector('[data-admin-sales-msg]');

  const releaseLatestEl = document.querySelector('[data-admin-release-latest]');
  const releasePublishedEl = document.querySelector('[data-admin-release-published]');
  const releaseCountEl = document.querySelector('[data-admin-release-count]');
  const releasesBody = document.querySelector('[data-admin-releases-body]');
  const releasesMsg = document.querySelector('[data-admin-releases-msg]');

  const CUSTOM_SERVICE_TEMPLATE = '__custom__';
  const DEFAULT_ADMIN_VIEW = 'overview';
  let latestSalesRows = [];
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

  function getStripeDashboardUrl() {
    const environment = String(cfg.stripeEnvironment || 'live').trim().toLowerCase();
    return environment === 'test'
      ? 'https://dashboard.stripe.com/test'
      : 'https://dashboard.stripe.com';
  }

  function syncStripeDashboardLinks() {
    const href = getStripeDashboardUrl();
    const enabled = String(cfg.billingProvider || '').trim().toLowerCase() === 'stripe';
    adminStripeLinks.forEach(function (link) {
      link.href = href;
      link.style.display = enabled ? '' : 'none';
    });
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

  function formatBooleanLabel(value) {
    return value ? t('site_admin_yes', 'Yes') : t('site_admin_no', 'No');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(Number(value || 0));
  }

  function formatMoney(valueMinor, currency) {
    const normalizedCurrency = String(currency || 'EUR').trim().toUpperCase() || 'EUR';
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: normalizedCurrency
    }).format((Number(valueMinor || 0) || 0) / 100);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function currentAdminView() {
    const url = new URL(window.location.href);
    const view = (url.searchParams.get('view') || DEFAULT_ADMIN_VIEW).trim().toLowerCase();
    return ['overview', 'shared', 'access', 'sales', 'releases'].includes(view) ? view : DEFAULT_ADMIN_VIEW;
  }

  function applyAdminView(view) {
    adminViewLinks.forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-admin-view-link') === view);
    });
    adminViews.forEach(function (section) {
      section.style.display = section.getAttribute('data-admin-view') === view ? '' : 'none';
    });
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

  async function invokeAdminDashboard() {
    const session = await getSession();
    if (!session || !session.access_token) {
      throw new Error('not_authenticated');
    }

    const response = await fetch(cfg.supabaseUrl.replace(/\/+$/, '') + '/functions/v1/admin-dashboard', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + session.access_token
      },
      body: JSON.stringify({
        year: salesYearSelect ? (Number(salesYearSelect.value || 0) || undefined) : undefined
      })
    });

    const payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload.detail || payload.error || 'admin_dashboard_failed');
    }
    return payload;
  }

  function accessStateLabel(value) {
    const key = String(value || '').trim().toLowerCase();
    if (key === 'admin') return t('site_admin_access_admin', 'Admin');
    if (key === 'active') return t('site_admin_access_active', 'Premium actif');
    if (key === 'expired') return t('site_admin_access_expired', 'Premium expiré');
    return t('site_admin_access_none', 'Mode gratuit');
  }

  function renderAccounts(data) {
    if (overviewAccountsEl) overviewAccountsEl.textContent = formatNumber(data.accountSummary?.totalAccounts || 0);
    if (overviewActiveWebEl) overviewActiveWebEl.textContent = formatNumber(data.accountSummary?.activeOnSite || 0);
    if (overviewPremiumEl) overviewPremiumEl.textContent = formatNumber((data.accountSummary?.activeAccess || 0) - (data.accountSummary?.adminAccounts || 0));
    if (accountTotalEl) accountTotalEl.textContent = String(data.accountSummary?.totalAccounts || 0);
    if (accountConfirmedEl) accountConfirmedEl.textContent = String(data.accountSummary?.confirmedAccounts || 0);
    if (accountConnectedEl) accountConnectedEl.textContent = String(data.accountSummary?.connectedOnSite || 0);
    if (accountActiveEl) accountActiveEl.textContent = String(data.accountSummary?.activeOnSite || 0);

    if (!accountsBody) return;
    const rows = safeArray(data.accounts);
    if (!rows.length) {
      accountsBody.innerHTML = '<tr><td colspan="6">' + escapeHtml(t('site_admin_empty_accounts', 'Aucun compte pour le moment.')) + '</td></tr>';
      return;
    }

    accountsBody.innerHTML = rows.map(function (row) {
      const email = escapeHtml(row.email || '-');
      const username = row.username ? '<div class="subtle">@' + escapeHtml(row.username) + '</div>' : '';
      const created = escapeHtml(formatDate(row.createdAt));
      const lastSignIn = escapeHtml(formatDate(row.lastSignInAt));
      const connected = escapeHtml(formatBooleanLabel(!!row.siteConnected));
      const active = escapeHtml(formatBooleanLabel(!!row.siteActive));
      const access = escapeHtml(accessStateLabel(row.accessState));
      return '<tr>'
        + '<td><strong>' + email + '</strong>' + username + '</td>'
        + '<td>' + created + '</td>'
        + '<td>' + lastSignIn + '</td>'
        + '<td>' + connected + '</td>'
        + '<td>' + active + '</td>'
        + '<td>' + access + '</td>'
        + '</tr>';
    }).join('');

    renderStackChart(accountsChart, safeArray(data.accountBreakdown));
    renderBarChart(accountTimelineChart, safeArray(data.accountTimeline));
  }

  function salesStatusLabel(row) {
    if (row.canceledButStillRunning) return t('site_admin_sales_status_canceled_running', 'Annulé, encore actif');
    if (row.active) return t('site_admin_sales_status_active', 'Actif');
    return t('site_admin_sales_status_ended', 'Terminé');
  }

  function filterSalesRows(rows) {
    const emailNeedle = (salesFilterEmail && salesFilterEmail.value ? String(salesFilterEmail.value) : '').trim().toLowerCase();
    const providerNeedle = (salesFilterProvider && salesFilterProvider.value ? String(salesFilterProvider.value) : '').trim().toLowerCase();
    const statusNeedle = (salesFilterStatus && salesFilterStatus.value ? String(salesFilterStatus.value) : '').trim().toLowerCase();
    const canceledNeedle = (salesFilterCanceled && salesFilterCanceled.value ? String(salesFilterCanceled.value) : '').trim().toLowerCase();

    return safeArray(rows).filter(function (row) {
      const email = String(row.customerEmail || '').trim().toLowerCase();
      const provider = String(row.provider || '').trim().toLowerCase();
      const canceled = !!row.canceledButStillRunning || !!row.canceledAt;
      const status = row.canceledButStillRunning ? 'canceled_running' : (row.active ? 'active' : 'ended');

      if (emailNeedle && !email.includes(emailNeedle)) return false;
      if (providerNeedle && provider !== providerNeedle) return false;
      if (statusNeedle && status !== statusNeedle) return false;
      if (canceledNeedle === 'yes' && !canceled) return false;
      if (canceledNeedle === 'no' && canceled) return false;
      return true;
    });
  }

  function renderSalesRows(rows) {
    if (!salesBody) return;
    if (salesFilterCount) {
      salesFilterCount.textContent = t('site_admin_sales_filter_count', '{{shown}} / {{total}} ventes')
        .replace('{{shown}}', formatNumber(rows.length))
        .replace('{{total}}', formatNumber(latestSalesRows.length));
    }
    if (!rows.length) {
      salesBody.innerHTML = '<tr><td colspan="6">' + escapeHtml(t('site_admin_sales_filter_empty', 'Aucune vente ne correspond aux filtres actuels.')) + '</td></tr>';
      return;
    }

    salesBody.innerHTML = rows.map(function (row) {
      const email = escapeHtml(row.customerEmail || '-');
      const provider = escapeHtml(String(row.provider || '').toUpperCase() || '-');
      const started = escapeHtml(formatDate(row.activatedAt || row.createdAt || row.currentPeriodStartsAt));
      const canceled = escapeHtml(formatBooleanLabel(!!row.canceledButStillRunning || !!row.canceledAt));
      const ends = escapeHtml(formatDate(row.currentPeriodEndsAt));
      const status = escapeHtml(salesStatusLabel(row));
      return '<tr>'
        + '<td><strong>' + email + '</strong></td>'
        + '<td>' + provider + '</td>'
        + '<td>' + started + '</td>'
        + '<td>' + canceled + '</td>'
        + '<td>' + ends + '</td>'
        + '<td>' + status + '</td>'
        + '</tr>';
    }).join('');
  }

  function syncSalesFilters() {
    renderSalesRows(filterSalesRows(latestSalesRows));
  }

  function renderSales(data) {
    if (overviewCanceledEl) overviewCanceledEl.textContent = formatNumber(data.salesSummary?.canceledButRunning || 0);
    if (salesActiveEl) salesActiveEl.textContent = String(data.salesSummary?.activeSubscriptions || 0);
    if (salesCanceledEl) salesCanceledEl.textContent = String(data.salesSummary?.canceledButRunning || 0);
    if (salesEndedEl) salesEndedEl.textContent = String(data.salesSummary?.endedSubscriptions || 0);
    if (salesTotalEl) salesTotalEl.textContent = String(data.salesSummary?.totalSubscriptions || 0);
    if (salesRevenueYearEl) salesRevenueYearEl.textContent = data.annualRevenueSummary?.revenueDisplay || formatMoney(0, 'EUR');
    if (salesInvoicesYearEl) salesInvoicesYearEl.textContent = formatNumber(data.annualRevenueSummary?.paidInvoices || 0);
    if (salesNewYearEl) salesNewYearEl.textContent = formatNumber(data.annualRevenueSummary?.salesRecorded || 0);
    if (salesRenewalsEl) salesRenewalsEl.textContent = formatNumber(data.salesSummary?.renewalsNext30Days || 0);
    if (salesBillingIssuesEl) salesBillingIssuesEl.textContent = formatNumber(data.salesSummary?.billingIssueSubscriptions || 0);
    renderYearOptions(data);

    if (!salesBody) return;
    latestSalesRows = safeArray(data.subscriptions);
    if (!latestSalesRows.length) {
      if (salesFilterCount) {
        salesFilterCount.textContent = t('site_admin_sales_filter_count', '{{shown}} / {{total}} ventes')
          .replace('{{shown}}', '0')
          .replace('{{total}}', '0');
      }
      salesBody.innerHTML = '<tr><td colspan="6">' + escapeHtml(t('site_admin_empty_sales', 'Aucun abonnement enregistré pour le moment.')) + '</td></tr>';
      return;
    }
    syncSalesFilters();

    renderStackChart(salesChart, safeArray(data.salesBreakdown));
    renderStackChart(providerChart, safeArray(data.providerBreakdown));
    renderStackChart(salesDetailChart, safeArray(data.salesBreakdown));
    renderBarChart(salesTimelineChart, safeArray(data.salesTimeline));
    renderBarChart(revenueTimelineChart, safeArray(data.annualRevenueTimeline), function (item) {
      return formatMoney(item.value || 0, data.annualRevenueSummary?.currency || 'EUR');
    });
  }

  function renderYearOptions(data) {
    if (!salesYearSelect) return;
    const years = safeArray(data.availableYears);
    const currentValue = String(data.selectedYear || '');
    salesYearSelect.innerHTML = years.map(function (year) {
      const stringYear = String(year);
      return '<option value="' + escapeHtml(stringYear) + '"' + (stringYear === currentValue ? ' selected' : '') + '>' + escapeHtml(stringYear) + '</option>';
    }).join('');
  }

  function renderReleases(data) {
    const releaseSummary = data.releaseSummary || {};
    if (overviewReleaseEl) overviewReleaseEl.textContent = releaseSummary.latestTag || '-';
    if (overviewReleaseDateEl) overviewReleaseDateEl.textContent = releaseSummary.latestPublishedAt ? formatDate(releaseSummary.latestPublishedAt) : '-';
    if (releaseLatestEl) releaseLatestEl.textContent = releaseSummary.latestTag || '-';
    if (releasePublishedEl) releasePublishedEl.textContent = releaseSummary.latestPublishedAt ? formatDate(releaseSummary.latestPublishedAt) : '-';
    if (releaseCountEl) releaseCountEl.textContent = formatNumber(safeArray(releaseSummary.releases).length);

    if (!releasesBody) return;
    const rows = safeArray(releaseSummary.releases);
    if (!rows.length) {
      releasesBody.innerHTML = '<tr><td colspan="4">' + escapeHtml(t('site_admin_empty_releases', 'No public releases loaded.')) + '</td></tr>';
      return;
    }
    releasesBody.innerHTML = rows.map(function (row) {
      const flags = [];
      if (row.isDraft) flags.push(t('site_admin_release_flag_draft', 'Draft'));
      if (row.isPrerelease) flags.push(t('site_admin_release_flag_prerelease', 'Prerelease'));
      if (!flags.length) flags.push(t('site_admin_release_flag_public', 'Public'));
      return '<tr>'
        + '<td><strong>' + escapeHtml(row.tag || '-') + '</strong></td>'
        + '<td>' + escapeHtml(row.name || '-') + '</td>'
        + '<td>' + escapeHtml(formatDate(row.publishedAt)) + '</td>'
        + '<td>' + escapeHtml(flags.join(' · ')) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderStackChart(target, items) {
    if (!target) return;
    const rows = safeArray(items);
    const total = rows.reduce(function (sum, item) { return sum + Number(item.value || 0); }, 0);
    if (!rows.length || total <= 0) {
      target.innerHTML = '<p class="subtle">' + escapeHtml(t('site_admin_chart_empty', 'No data yet.')) + '</p>';
      return;
    }
    target.innerHTML = rows.map(function (item) {
      const value = Number(item.value || 0);
      const width = total > 0 ? Math.max((value / total) * 100, value > 0 ? 3 : 0) : 0;
      return '<div class="admin-chart-row">'
        + '<div class="admin-chart-meta"><span>' + escapeHtml(item.label || '-') + '</span><strong>' + escapeHtml(formatNumber(value)) + '</strong></div>'
        + '<div class="admin-chart-rail"><div class="admin-chart-fill" style="width:' + width.toFixed(2) + '%"></div></div>'
        + '</div>';
    }).join('');
  }

  function renderBarChart(target, items, formatValue) {
    if (!target) return;
    const rows = safeArray(items);
    const max = rows.reduce(function (highest, item) {
      return Math.max(highest, Number(item.value || 0));
    }, 0);
    if (!rows.length || max <= 0) {
      target.innerHTML = '<p class="subtle">' + escapeHtml(t('site_admin_chart_empty', 'No data yet.')) + '</p>';
      return;
    }
    target.innerHTML = rows.map(function (item) {
      const value = Number(item.value || 0);
      const height = Math.max((value / max) * 100, value > 0 ? 8 : 0);
      return '<div class="admin-bar-item">'
        + '<div class="admin-bar-value">' + escapeHtml(typeof formatValue === 'function' ? formatValue(item) : formatNumber(value)) + '</div>'
        + '<div class="admin-bar-column" style="height:' + height.toFixed(2) + '%"></div>'
        + '<div class="admin-bar-label">' + escapeHtml(item.label || '-') + '</div>'
        + '</div>';
    }).join('');
  }

  async function loadAdminDashboard() {
    msg(accountsMsg, '');
    msg(salesMsg, '');
    msg(releasesMsg, '');

    try {
      const data = await invokeAdminDashboard();
      renderAccounts(data);
      renderSales(data);
      renderReleases(data);
    } catch (error) {
      const detail = error && error.message ? error.message : t('admin_dashboard_failed', 'Unable to load admin dashboard.');
      msg(accountsMsg, detail, 'error');
      msg(salesMsg, detail, 'error');
      msg(releasesMsg, detail, 'error');
    }
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
    applyAdminView(currentAdminView());
    await Promise.all([
      loadAdminServiceStatus(),
      loadAdminDashboard()
    ]);
  }

  syncStripeDashboardLinks();

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

  adminViewLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      const view = link.getAttribute('data-admin-view-link') || DEFAULT_ADMIN_VIEW;
      const url = new URL(window.location.href);
      url.searchParams.set('view', view);
      window.history.replaceState({}, '', url.toString());
      applyAdminView(view);
    });
  });

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener('click', async function () {
      msg(adminServiceMsg, '');
      await refreshAdminPage();
    });
  }

  if (salesYearSelect) {
    salesYearSelect.addEventListener('change', async function () {
      await loadAdminDashboard();
    });
  }

  [salesFilterEmail, salesFilterProvider, salesFilterStatus, salesFilterCanceled].forEach(function (input) {
    if (!input) return;
    input.addEventListener('input', syncSalesFilters);
    input.addEventListener('change', syncSalesFilters);
  });

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
