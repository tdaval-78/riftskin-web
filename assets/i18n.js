(function () {
  const STORAGE_KEY = 'riftskin_lang';
  const SUPPORTED = ['en', 'fr', 'es', 'pt', 'zh'];
  let currentLanguage = null;

  function normalizeLanguageCode(code) {
    if (!code) return '';
    const lc = String(code).toLowerCase();
    if (lc.startsWith('fr')) return 'fr';
    if (lc.startsWith('es')) return 'es';
    if (lc.startsWith('pt')) return 'pt';
    if (lc.startsWith('zh')) return 'zh';
    if (lc.startsWith('en')) return 'en';
    return '';
  }

  function detectBrowserLanguage() {
    const list = [];
    if (Array.isArray(navigator.languages)) list.push.apply(list, navigator.languages);
    if (navigator.language) list.push(navigator.language);
    for (let i = 0; i < list.length; i += 1) {
      const normalized = normalizeLanguageCode(list[i]);
      if (SUPPORTED.indexOf(normalized) !== -1) return normalized;
    }
    return 'en';
  }

  function getLanguage() {
    if (currentLanguage && SUPPORTED.indexOf(currentLanguage) !== -1) return currentLanguage;

    const saved = normalizeLanguageCode(localStorage.getItem(STORAGE_KEY) || '');
    if (SUPPORTED.indexOf(saved) !== -1) {
      currentLanguage = saved;
      return currentLanguage;
    }

    currentLanguage = detectBrowserLanguage();
    return currentLanguage;
  }

  function translate(key) {
    const lang = getLanguage();
    const all = window.RiftSkinTranslations || {};
    const selected = all[lang] || {};
    const fallback = all.en || {};
    if (Object.prototype.hasOwnProperty.call(selected, key)) return selected[key];
    if (Object.prototype.hasOwnProperty.call(fallback, key)) return fallback[key];
    return key;
  }

  function setDocumentLanguage(lang) {
    const htmlLang = lang === 'zh' ? 'zh-CN' : lang;
    document.documentElement.setAttribute('lang', htmlLang);
  }

  function mountLanguageSelector() {
    if (document.querySelector('[data-lang-select]')) return;

    const topbar = document.querySelector('.topbar');
    if (!topbar) return;

    const cta = topbar.querySelector('.cta-row') || topbar;
    const wrapper = document.createElement('div');
    wrapper.className = 'lang-picker';

    const select = document.createElement('select');
    select.className = 'lang-select';
    select.setAttribute('data-lang-select', '1');

    SUPPORTED.forEach(function (lang) {
      const option = document.createElement('option');
      option.value = lang;
      option.textContent = lang;
      select.appendChild(option);
    });

    wrapper.appendChild(select);
    cta.insertBefore(wrapper, cta.firstChild || null);
  }

  function applyTranslations(root) {
    const container = root || document;

    container.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = translate(el.getAttribute('data-i18n'));
    });

    container.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = translate(el.getAttribute('data-i18n-html'));
    });

    container.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', translate(el.getAttribute('data-i18n-placeholder')));
    });

    container.querySelectorAll('[data-i18n-content]').forEach(function (el) {
      el.setAttribute('content', translate(el.getAttribute('data-i18n-content')));
    });

    container.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', translate(el.getAttribute('data-i18n-title')));
    });

    container.querySelectorAll('[data-i18n-value]').forEach(function (el) {
      el.setAttribute('value', translate(el.getAttribute('data-i18n-value')));
    });

    const titleTag = container.querySelector('title[data-i18n]');
    if (titleTag) titleTag.textContent = translate(titleTag.getAttribute('data-i18n'));

    const select = document.querySelector('[data-lang-select]');
    if (select) {
      select.value = getLanguage();
      const labels = {
        en: translate('lang_en'),
        fr: translate('lang_fr'),
        es: translate('lang_es'),
        pt: translate('lang_pt'),
        zh: translate('lang_zh')
      };
      Array.from(select.options).forEach(function (opt) {
        opt.textContent = labels[opt.value] || opt.value;
      });
      select.setAttribute('title', translate('language_label'));
      select.setAttribute('aria-label', translate('language_label'));
    }

    setDocumentLanguage(getLanguage());
  }

  function setLanguage(lang, persist) {
    const next = normalizeLanguageCode(lang);
    if (SUPPORTED.indexOf(next) === -1) return;
    currentLanguage = next;

    if (persist !== false) {
      localStorage.setItem(STORAGE_KEY, next);
    }

    applyTranslations(document);
    document.dispatchEvent(new CustomEvent('riftskin:language-changed', { detail: { language: next } }));
  }

  function init() {
    getLanguage();
    mountLanguageSelector();

    const select = document.querySelector('[data-lang-select]');
    if (select && !select.dataset.bound) {
      select.dataset.bound = '1';
      select.addEventListener('change', function () {
        setLanguage(select.value, true);
      });
    }

    applyTranslations(document);
  }

  window.RiftSkinI18n = {
    init: init,
    t: translate,
    apply: applyTranslations,
    setLanguage: setLanguage,
    getLanguage: getLanguage,
    supported: SUPPORTED.slice()
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
