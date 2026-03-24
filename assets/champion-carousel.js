(function () {
  const track = document.querySelector('[data-champion-carousel]');
  if (!track || !Array.isArray(window.champions) || typeof window.iconVersion !== 'string') {
    return;
  }

  const champions = window.champions.slice();
  if (!champions.length) {
    return;
  }

  const loops = 3;
  const tileWidth = 132;
  const speed = 0.035;
  const cycleWidth = champions.length * tileWidth;
  const items = [];

  function iconUrl(championId) {
    return 'https://ddragon.leagueoflegends.com/cdn/' + window.iconVersion + '/img/champion/' + championId + '.png';
  }

  function build() {
    track.textContent = '';
    for (let loop = 0; loop < loops; loop += 1) {
      champions.forEach(function (champion, index) {
        const card = document.createElement('article');
        card.className = 'champion-chip';
        card.setAttribute('aria-label', champion.name);

        const image = document.createElement('img');
        image.loading = loop === 1 && index < 16 ? 'eager' : 'lazy';
        image.decoding = 'async';
        image.alt = champion.name;
        image.src = iconUrl(champion.id);

        const label = document.createElement('span');
        label.textContent = champion.name;

        card.appendChild(image);
        card.appendChild(label);
        track.appendChild(card);

        items.push({
          el: card,
          baseX: loop * cycleWidth + index * tileWidth
        });
      });
    }
  }

  function layout(offset) {
    const shell = track.parentElement;
    const width = shell ? shell.clientWidth : 0;
    const center = width / 2;
    const radius = Math.max(width * 0.44, 260);
    const depth = 160;

    items.forEach(function (item) {
      let x = item.baseX - offset;
      while (x < -tileWidth) x += loops * cycleWidth;
      while (x > width + tileWidth) x -= loops * cycleWidth;

      const chipCenter = x + (item.el.offsetWidth || tileWidth) / 2;
      const normalized = width > 0 ? (chipCenter - center) / Math.max(center, 1) : 0;
      const clamped = Math.max(-1, Math.min(1, normalized));
      const arcY = Math.pow(Math.abs(clamped), 1.7) * 82;
      const direction = clamped < 0 ? -1 : 1;
      const rotateY = clamped * 58;
      const rotateX = direction * Math.pow(Math.abs(clamped), 1.35) * 12;
      const scale = 1.06 - Math.min(Math.abs(clamped), 1) * 0.34;
      const opacity = 1 - Math.min(Math.abs(clamped), 1) * 0.58;
      const z = Math.cos(clamped * Math.PI * 0.5) * depth - 80;

      item.el.style.opacity = String(opacity);
      item.el.style.zIndex = String(Math.round((scale + 1) * 100));
      item.el.style.transform =
        'translate3d(' + x.toFixed(2) + 'px, calc(-50% + ' + arcY.toFixed(2) + 'px), ' + z.toFixed(2) + 'px) ' +
        'rotateY(' + rotateY.toFixed(2) + 'deg) rotateX(' + rotateX.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
      item.el.style.filter = 'saturate(' + (0.84 + scale * 0.3).toFixed(2) + ')';
    });
  }

  let offset = cycleWidth;
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(now - last, 32);
    last = now;
    offset += dt * speed;
    if (offset >= cycleWidth * 2) {
      offset -= cycleWidth;
    }
    layout(offset);
    requestAnimationFrame(frame);
  }

  build();
  layout(offset);
  requestAnimationFrame(frame);
  window.addEventListener('resize', function () {
    layout(offset);
  });
})();
