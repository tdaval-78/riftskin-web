(function () {
  const cfg = window.RiftSkinConfig || {};
  const form = document.getElementById('support-form');
  const out = document.getElementById('support-msg');
  const i18n = window.RiftSkinI18n;
  const t = function (key) { return i18n ? i18n.t(key) : key; };

  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const data = new FormData(form);
    const name = (data.get('name') || '').toString().trim();
    const email = (data.get('email') || '').toString().trim();
    const topic = (data.get('topic') || '').toString().trim();
    const message = (data.get('message') || '').toString().trim();
    const to = cfg.supportEmail || 'support@riftskin.com';
    const subject = encodeURIComponent('[RIFTSKIN Support] ' + topic);
    const body = encodeURIComponent(
      'Name: ' + name + '\n' +
      'Email: ' + email + '\n' +
      'Topic: ' + topic + '\n\n' +
      message + '\n\n' +
      '---\nSent from riftskin.com/support'
    );
    window.location.href = 'mailto:' + to + '?subject=' + subject + '&body=' + body;
    out.textContent = t('support_mail_opened');
    out.className = 'msg ok';
  });
})();
