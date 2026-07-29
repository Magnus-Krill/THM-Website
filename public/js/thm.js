/* THM · highwaymen.cc — shared behaviour

   Navigation is client-side: a same-origin click swaps <body> rather than
   loading a document, so no browser ever blanks between pages — Firefox
   included, where there are no view transitions to hide the gap.

   That splits this file in two. Anything touching page content lives in
   initPage(), which runs on load and again after every swap. Window-level
   listeners are wired once, in initShell(). Nothing else may assume it runs
   only once. */
'use strict';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Theme, applied again here for pages loaded without the inline head script.
// Every localStorage touch in this file is guarded: it throws when the browser
// is set to block storage, and an exception at this point would take the router
// down with it — leaving plain document loads, which is the bug being fixed.
const stored = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const store = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* session-only theme, better than a dead page */
  }
};

document.documentElement.dataset.theme =
  stored('thm-theme') ||
  (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

// ─── Per-page state, rebuilt by initPage() ──────────────────────────────────
let observers = [];
let navEl = null;
let rail = null;
let currentPath = location.pathname;

const track = (obs) => (observers.push(obs), obs);

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

// One rAF-throttled handler for the nav state and the rail centreline fill.
// Registered once; reads the elements initPage() found.
function onScroll() {
  navEl?.classList.toggle('scrolled', scrollY > 24);

  if (rail && !reduced) {
    // Fill tracks how far the reading line (60% down the viewport) has
    // travelled through the log.
    const r = rail.getBoundingClientRect();
    const read = innerHeight * 0.6 - r.top;
    rail.style.setProperty('--fill', Math.min(1, Math.max(0, read / r.height)).toFixed(3));
  }
}

// ─── Theme switch ───────────────────────────────────────────────────────────
function themeToggle() {
  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    const label = () =>
      btn.setAttribute(
        'aria-label',
        `Switch to ${document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'} theme`
      );
    label();
    btn.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      const root = document.documentElement;
      root.dataset.theme = next;
      root.style.colorScheme = next;
      // Keep the canvas colour in step with the head script's, or the next
      // navigation paints the old theme's background for a frame.
      root.style.background = next === 'light' ? '#f3efe8' : '#0d0b0c';
      store('thm-theme', next);
      label();
    });
  });
}

// ─── Menu ───────────────────────────────────────────────────────────────────
function menu() {
  const burger = document.querySelector('.nav-burger');
  const links = document.querySelector('.nav-links');
  burger?.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  links?.addEventListener('click', (e) => {
    if (!e.target.closest('a')) return;
    links.classList.remove('open');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Open menu');
  });
}

// ─── Reveal on scroll ───────────────────────────────────────────────────────
function reveals() {
  const obs = track(
    new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in', 'visible');
          obs.unobserve(e.target);
        }),
      { threshold: 0.12 }
    )
  );
  document.querySelectorAll('.rv, .reveal').forEach((el) => obs.observe(el));

  // Log markers fill as their entry comes into view.
  const seen = track(
    new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('seen');
          seen.unobserve(e.target);
        }),
      { threshold: 0.3 }
    )
  );
  document.querySelectorAll('.log-row').forEach((el) => seen.observe(el));
}

// ─── Active nav link ────────────────────────────────────────────────────────
function activeNav() {
  const links = document.querySelectorAll('.nav-links a[href*="#"]');
  if (!links.length) return;
  const obs = track(
    new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          links.forEach((a) => a.classList.toggle('active', a.hash === `#${e.target.id}`));
        }),
      { rootMargin: '-30% 0px -55% 0px' }
    )
  );
  document.querySelectorAll('section[id]').forEach((s) => obs.observe(s));
}

// ─── Numbers ────────────────────────────────────────────────────────────────
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

function stats() {
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
}

// ─── Enlarged map ───────────────────────────────────────────────────────────
// ponytail: native <dialog> — Esc, focus trap and the backdrop come free.
function mapZoom() {
  const zoom = document.getElementById('map-zoom');
  if (!zoom) return;
  const open = document.querySelector('.map-open');
  if (open) open.addEventListener('click', () => zoom.showModal());
  zoom.querySelector('.zoom-close').addEventListener('click', () => zoom.close());
  // Click outside the image closes it, like every other lightbox.
  zoom.addEventListener('click', (e) => {
    if (e.target === zoom || e.target.classList.contains('zoom-scroll')) zoom.close();
  });
}

// ─── Every other image enlarges too ─────────────────────────────────────────
// ponytail: one dialog and one handler per image, instead of wrapping 30-odd
// <img> in buttons across six pages. The nav mark and the map (its own pannable
// dialog above) opt out.
function zoomableImages() {
  const box = document.createElement('dialog');
  box.className = 'zoom lightbox';
  box.innerHTML =
    '<button class="zoom-close mono mono-sm" type="button">Close &times;</button><img alt="" />';
  const boxImg = box.querySelector('img');
  document.body.append(box);
  box.querySelector('.zoom-close').addEventListener('click', () => box.close());
  box.addEventListener('click', (e) => {
    if (e.target !== boxImg) box.close();
  });

  document.querySelectorAll('img').forEach((img) => {
    if (img.closest('.nav, .map-open, .zoom')) return;
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.title = 'Click to enlarge';
    const show = () => {
      boxImg.src = img.currentSrc || img.src;
      boxImg.alt = img.alt;
      box.showModal();
    };
    img.addEventListener('click', show);
    img.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      show();
    });
  });
}

// ─── Skin viewer ────────────────────────────────────────────────────────────
// three.js and skin.js are pulled in only by pages that have a canvas, and only
// once per session — a profile reached through the router has no <script> tags
// of its own, since swapped-in markup never executes them.
const scripts = new Map();

function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = reject;
        document.head.append(s);
      })
    );
  }
  return scripts.get(src);
}

async function skinViewer() {
  if (!document.getElementById('skin-canvas')) return;
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js');
    await loadScript('/js/skin.js?v=2');
    thmSkin();
  } catch {
    // No viewer; the plate keeps its facts.
  }
}

// ─── Client-side navigation ─────────────────────────────────────────────────
const pages = new Map(); // url -> html, so back/forward never refetches

async function pageHtml(url) {
  if (!pages.has(url)) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    pages.set(url, await r.text());
  }
  return pages.get(url);
}

async function go(url, { push = true, restore = null } = {}) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(await pageHtml(url), 'text/html');
    if (!doc.body.children.length) throw new Error('empty');
  } catch {
    location.href = url; // hand it back to the browser rather than dead-end
    return;
  }

  const swap = () => {
    if (push) {
      history.replaceState({ y: scrollY }, '');
      history.pushState({ y: 0 }, '', url);
    }
    document.title = doc.title;
    document.body.replaceChildren(...doc.body.childNodes);
    currentPath = location.pathname;
    initPage();

    const hash = new URL(url, location.href).hash;
    const target = hash && document.getElementById(hash.slice(1));
    if (restore !== null) scrollTo({ top: restore, behavior: 'instant' });
    else if (target) target.scrollIntoView({ behavior: 'instant' });
    else scrollTo({ top: 0, behavior: 'instant' });
  };

  // Chrome and Safari crossfade it; everywhere else it is an instant swap,
  // which is still a swap and not a page load.
  if (!reduced && document.startViewTransition) document.startViewTransition(swap);
  else swap();
}

function router() {
  history.scrollRestoration = 'manual';
  if (!history.state) history.replaceState({ y: 0 }, '');

  addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const a = e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    if (a.origin !== location.origin) return; // Discord, the wiki, mailto:
    // A link into the current page is the browser's job — let it scroll.
    if (a.pathname === currentPath && a.hash) return;
    if (a.href === location.href) return;

    e.preventDefault();
    go(a.href);
  });

  addEventListener('popstate', (e) => {
    // Hash-only history entries we never intercepted: leave them alone.
    if (location.pathname === currentPath) return;
    go(location.href, { push: false, restore: e.state?.y ?? 0 });
  });
}

// ─── Wiring ─────────────────────────────────────────────────────────────────
function initPage() {
  observers.forEach((o) => o.disconnect());
  observers = [];

  navEl = document.querySelector('.nav');
  rail = document.querySelector('.log-rail');

  themeToggle();
  menu();
  reveals();
  activeNav();
  stats();
  mapZoom();
  zoomableImages();
  skinViewer();

  if (rail && reduced) rail.style.setProperty('--fill', '1');
  onScroll();
}

function initShell() {
  let queued = false;
  addEventListener(
    'scroll',
    () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        onScroll();
        queued = false;
      });
    },
    { passive: true }
  );
  router();
}

document.addEventListener('DOMContentLoaded', () => {
  initShell();
  initPage();
});
