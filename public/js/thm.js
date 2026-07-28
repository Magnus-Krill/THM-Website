/* THM · highwaymen.cc — shared behaviour */
'use strict';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Theme, applied again here for pages loaded without the inline head script.
document.documentElement.dataset.theme =
  localStorage.getItem('thm-theme') ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

document.addEventListener('DOMContentLoaded', () => {
  // ── Theme switch ─────────────────────────────────────────────────────────
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    const label = () =>
      btn.setAttribute(
        'aria-label',
        `Switch to ${document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'} theme`
      );
    label();
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('thm-theme', next);
      label();
    });
  });

  // ── Menu ─────────────────────────────────────────────────────────────────
  const burger = document.querySelector('.nav-burger');
  const menu = document.querySelector('.nav-links');
  burger?.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  menu?.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    menu.classList.remove('open');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Open menu');
  });

  // ── Reveal on scroll ─────────────────────────────────────────────────────
  const revealObs = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in', 'visible');
        revealObs.unobserve(e.target);
      }),
    { threshold: 0.12 }
  );
  document.querySelectorAll('.rv, .reveal').forEach((el) => revealObs.observe(el));

  // ── Log markers fill as their entry comes into view ──────────────────────
  const seenObs = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('seen');
          seenObs.unobserve(e.target);
        }
      }),
    { threshold: 0.3 }
  );
  document.querySelectorAll('.log-row').forEach((el) => seenObs.observe(el));

  // ── Scroll-driven work ───────────────────────────────────────────────────
  // One rAF-throttled handler for the nav state and the rail centreline fill.
  const nav = document.querySelector('.nav');
  const rail = document.querySelector('.log-rail');
  let queued = false;

  function onScroll() {
    nav?.classList.toggle('scrolled', scrollY > 24);

    if (rail && !reduced) {
      // Fill tracks how far the reading line (60% down the viewport) has
      // travelled through the log.
      const r = rail.getBoundingClientRect();
      const read = innerHeight * 0.6 - r.top;
      rail.style.setProperty('--fill', Math.min(1, Math.max(0, read / r.height)).toFixed(3));
    }
    queued = false;
  }
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(onScroll);
    },
    { passive: true }
  );
  if (rail && reduced) rail.style.setProperty('--fill', '1');
  onScroll();

  // ── Active nav link ──────────────────────────────────────────────────────
  const links = document.querySelectorAll('.nav-links a[href^="#"]');
  if (links.length) {
    const activeObs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          links.forEach((a) => a.classList.toggle('active', a.hash === `#${e.target.id}`));
        }),
      { rootMargin: '-30% 0px -55% 0px' }
    );
    document.querySelectorAll('section[id]').forEach((s) => activeObs.observe(s));
  }

  // ── Numbers ──────────────────────────────────────────────────────────────
  const fmt = new Intl.NumberFormat();
  const stamp = (iso) => {
    const d = new Date(iso);
    return isNaN(d)
      ? null
      : d.toLocaleString(undefined, {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  // Counts up once, so a live reading arrives as a reading rather than a jump.
  function setCount(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (reduced) {
      el.textContent = fmt.format(value);
      return;
    }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 900);
      el.textContent = fmt.format(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  if (document.getElementById('stat-discord')) {
    fetch('/api/stats', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        setCount('stat-discord', d.discordMembers);
        setCount('stat-blocks', d.dailyBlocks);
        setCount('stat-members', d.noviceMembers);
        const t = stamp(d.updated);
        if (t) document.getElementById('stats-updated').textContent = t;
      })
      .catch(() => {});
  }

  // ── Map survey timestamp ─────────────────────────────────────────────────
  const mapEl = document.getElementById('map-updated-time');
  if (mapEl) {
    fetch('/map-meta.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const t = stamp(d.updated);
        if (t) mapEl.textContent = t;
      })
      .catch(() => {});
  }
});
