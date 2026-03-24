(function () {
  const track = document.querySelector('[data-champion-carousel]');
  if (!track || !Array.isArray(window.champions) || typeof window.iconVersion !== 'string') {
    return;
  }

  const reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const champions = window.champions.slice();
  if (!champions.length) {
    return;
  }

  const loops = reducedMotion ? 1 : 2;
  const tileWidth = 164;
  const chipWidth = 132;
  const baseSpeed = reducedMotion ? 0 : 0.07;
  const maxBoost = reducedMotion ? 0 : 0.42;
  const cycleWidth = champions.length * tileWidth;
  const items = [];
  const shell = track.parentElement;
  let shellWidth = 0;
  let shellCenter = 0;
  let visible = reducedMotion;
  let rafId = 0;

  function iconUrl(championId) {
    return 'https://ddragon.leagueoflegends.com/cdn/' + window.iconVersion + '/img/champion/' + championId + '.png';
  }

  function measure() {
    shellWidth = shell ? shell.clientWidth : 0;
    shellCenter = shellWidth / 2;
  }

  function build() {
    track.textContent = '';
    items.length = 0;
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
    const width = shellWidth;
    const center = shellCenter;
    const depth = 110;

    items.forEach(function (item) {
      let x = item.baseX - offset;
      while (x < -tileWidth) x += loops * cycleWidth;
      while (x > width + tileWidth) x -= loops * cycleWidth;

      if (x < -tileWidth * 1.2 || x > width + tileWidth * 0.6) {
        item.el.style.opacity = '0';
        item.el.style.zIndex = '0';
        item.el.style.transform =
          'translate3d(' + x.toFixed(2) + 'px, -50%, -40px) scale(0.84)';
        return;
      }

      const chipCenter = x + chipWidth / 2;
      const normalized = width > 0 ? (chipCenter - center) / Math.max(center, 1) : 0;
      const clamped = Math.max(-1, Math.min(1, normalized));
      const distance = Math.abs(clamped);
      const arcY = Math.pow(distance, 1.45) * 48;
      const rotateY = clamped * 28;
      const scale = 1.08 - distance * 0.2;
      const opacity = 1 - distance * 0.32;
      const z = Math.cos(clamped * Math.PI * 0.5) * depth - 48;

      item.el.style.opacity = String(opacity);
      item.el.style.zIndex = String(Math.round((scale + 1) * 100));
      item.el.style.transform =
        'translate3d(' + x.toFixed(2) + 'px, calc(-50% + ' + arcY.toFixed(2) + 'px), ' + z.toFixed(2) + 'px) ' +
        'rotateY(' + rotateY.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
    });
  }

  let offset = cycleWidth;
  let last = performance.now();
  let currentVelocity = baseSpeed;
  let targetVelocity = baseSpeed;

  function updateTargetVelocity(clientX) {
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const normalized = ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    const clamped = Math.max(-1, Math.min(1, normalized));
    if (Math.abs(clamped) < 0.12) {
      targetVelocity = baseSpeed;
      return;
    }
    targetVelocity = clamped * maxBoost;
  }

  function frame(now) {
    if (!visible) {
      rafId = 0;
      return;
    }
    const dt = Math.min(now - last, 32);
    last = now;
    currentVelocity += (targetVelocity - currentVelocity) * 0.085;
    offset += dt * currentVelocity;
    while (offset < cycleWidth) {
      offset += cycleWidth;
    }
    if (offset >= cycleWidth * 2) {
      offset -= cycleWidth;
    }
    layout(offset);
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (reducedMotion) return;
    visible = true;
    if (rafId) return;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    visible = false;
  }

  build();
  measure();
  layout(offset);
  start();
  if (shell) {
    shell.addEventListener('pointermove', function (event) {
      updateTargetVelocity(event.clientX);
    }, { passive: true });
    shell.addEventListener('pointerleave', function () {
      targetVelocity = baseSpeed;
    });
  }
  window.addEventListener('resize', function () {
    measure();
    layout(offset);
  });

  if (!reducedMotion && 'IntersectionObserver' in window && shell) {
    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.target !== shell) return;
        if (entry.isIntersecting) {
          start();
        } else {
          stop();
        }
      });
    }, {
      threshold: 0.05
    });

    observer.observe(shell);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
      return;
    }
    if (shell && shell.getBoundingClientRect().bottom > 0) {
      start();
    }
  });
})();
