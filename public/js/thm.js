/* Shared shell, bounded page cache, and disposable page behaviour. */
'use strict';
(() => {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const backgroundColors = { dark: '#0d0b0c', light: '#f3efe8' };
  const pages = new Map();
  const scripts = new Map();
  const pageLimit = 8;
  const pageLifetime = 60_000;
  let pageController;
  let pageCleanups = [];
  let currentUrl = new URL(location.href);
  let navigation = 0;
  let transition;
  let rail;
  let prefetching = false;
  let statsReading;
  const format = new Intl.NumberFormat();

  function preference(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch { /* Storage can be disabled. */ }
  }

  function applyTheme(theme) {
    const value = theme === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;
    root.dataset.theme = value;
    root.style.colorScheme = value;
    root.style.background = backgroundColors[value];
    document.querySelectorAll('meta[name="theme-color"]').forEach(el => { el.content = backgroundColors[value]; });
    document.querySelector('.theme-toggle')?.setAttribute('aria-label', `Switch to ${value === 'dark' ? 'light' : 'dark'} theme`);
  }

  function destination(input) {
    const url = new URL(input, location.href);
    const moved = { '#network': '/network/', '#standard': '/network/#standard', '#roster': '/players/', '#about': '/about/#about', '#log': '/about/#log', '#alliance': '/about/#alliance' };
    if (url.origin === location.origin && url.pathname === '/' && moved[url.hash]) return new URL(moved[url.hash], url);
    return url;
  }

  function pageUrl(input) {
    const url = destination(input);
    if (url.origin !== location.origin || url.username || url.password) return null;
    if (!['/', '/network/', '/map', '/map/', '/players/', '/achievements/', '/about/'].includes(url.pathname) && !/^\/players\/[A-Za-z0-9_]+\/$/.test(url.pathname)) return null;
    url.hash = '';
    return url;
  }

  function remember(key, entry) {
    pages.delete(key);
    pages.set(key, entry);
    while (pages.size > pageLimit) pages.delete(pages.keys().next().value);
  }

  async function pageHtml(input) {
    const url = pageUrl(input);
    if (!url) throw new Error('Unsupported page');
    const key = url.href;
    let entry = pages.get(key);
    if (entry && Date.now() - entry.time < pageLifetime) return entry.promise;
    entry = { time: Date.now() };
    entry.promise = fetch(key, { signal: AbortSignal.timeout(8000), credentials: 'same-origin', cache: 'no-cache' }).then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Page unavailable');
      if (response.url !== key && (url.pathname !== '/map' || response.url !== new URL('/map/' + url.search, url).href)) {
        throw new Error('Redirect requires document navigation');
      }
      const markup = await response.text();
      if (markup.length > 500_000) throw new Error('Page too large');
      return markup;
    }).catch(error => {
      if (pages.get(key) === entry) pages.delete(key);
      throw error;
    });
    remember(key, entry);
    return entry.promise;
  }

  function prefetch(input) {
    if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    const url = pageUrl(input);
    if (!url || url.href === pageUrl(location.href)?.href) return;
    void pageHtml(url.href).catch(() => {});
  }

  async function warmPages() {
    if (prefetching || connection?.saveData) return;
    prefetching = true;
    const urls = [...new Set([...document.querySelectorAll('a[href]')].map(el => pageUrl(el.href)?.href).filter(Boolean))].slice(0, pageLimit);
    for (const url of urls) {
      if (connection?.saveData) break;
      if (url !== pageUrl(location.href)?.href) {
        try { await pageHtml(url); } catch { /* A hover retries failed pages. */ }
      }
    }
    prefetching = false;
  }

  function disposePage() {
    pageController?.abort();
    pageCleanups.forEach(cleanup => cleanup());
    pageCleanups = [];
  }

  function observe(elements, callback, options) {
    if (!elements.length) return;
    const observer = new IntersectionObserver(callback, options);
    elements.forEach(el => observer.observe(el));
    pageCleanups.push(() => observer.disconnect());
    return observer;
  }

  function timestamp(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function stats(signal) {
    const discord = document.getElementById('stat-discord');
    if (discord) {
      try {
        if (!statsReading || Date.now() - statsReading.time > 30_000) {
          const response = await fetch('/api/stats', { cache: 'no-store', signal });
          if (!response.ok) throw new Error('Stats unavailable');
          statsReading = { data: await response.json(), time: Date.now() };
        }
        if (signal.aborted) return;
        for (const [id, key] of [['stat-discord', 'discordMembers'], ['stat-blocks', 'dailyBlocks'], ['stat-members', 'noviceMembers']]) {
          const value = statsReading.data[key];
          if (Number.isFinite(value) && value >= 0) document.getElementById(id).textContent = format.format(value);
        }
        const time = timestamp(statsReading.data.updated);
        if (time) document.getElementById('stats-updated').textContent = time;
      } catch { /* Keep the labelled placeholders. */ }
    }
  }

  function lightboxes(signal) {
    const box = document.createElement('dialog');
    box.className = 'zoom lightbox';
    box.setAttribute('aria-label', 'Enlarged image');
    const close = document.createElement('button');
    close.className = 'zoom-close mono';
    close.type = 'button';
    close.textContent = 'Close ×';
    const image = document.createElement('img');
    image.alt = '';
    image.decoding = 'async';
    box.append(close, image);
    document.getElementById('content').append(box);
    close.addEventListener('click', () => box.close(), { signal });
    box.addEventListener('click', event => { if (event.target === box) box.close(); }, { signal });
    document.querySelectorAll('#content img').forEach(img => {
      if (img.closest('a, button, .zoom')) return;
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `Enlarge: ${img.alt || 'image'}`);
      const show = () => {
        image.src = img.dataset.fullimage || img.currentSrc || img.src;
        image.alt = img.alt;
        box.showModal();
      };
      img.addEventListener('click', show, { signal });
      img.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); }
      }, { signal });
    });
  }

  function loadScript(src, integrity) {
    if (!scripts.has(src)) {
      const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        if (integrity) { script.integrity = integrity; script.crossOrigin = 'anonymous'; }
        script.onload = resolve;
        script.onerror = () => { script.remove(); reject(new Error('Script unavailable')); };
        document.head.append(script);
      }).catch(error => { scripts.delete(src); throw error; });
      scripts.set(src, promise);
    }
    return scripts.get(src);
  }

  function initMaps(signal) {
    const maps = [...document.querySelectorAll('[data-highway-map]')];
    if (!maps.length) return;
    let loading;
    function loadMap() {
      loading ??= Promise.all([
        fetch('/api/highway-map', { cache: 'no-cache', signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) }),
        loadScript('/js/highway-map.js?v=31')
      ]).then(([response]) => {
        if (!response.ok) throw new Error('Highway map unavailable');
        return response.json();
      }).catch(error => { loading = undefined; throw error; });
      return loading;
    }

    const observer = observe(maps, async entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      try {
        const data = await loadMap();
        if (!signal.aborted) maps.forEach(canvas => window.thmHighwayMap(canvas, data, signal));
      } catch {
        if (!signal.aborted) document.querySelector('.atlas-status')?.replaceChildren('Could not load the survey. Reload to try again.');
      }
    }, { rootMargin: '160px' });

    const preview = maps[0].closest('a[href="/map"]');
    if (!preview) return;
    let dialog;
    preview.addEventListener('click', async event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (dialog) return;

      const box = document.createElement('dialog');
      dialog = box;
      box.className = 'atlas-dialog';
      box.setAttribute('aria-label', 'Nether highway map');
      const bar = document.createElement('div');
      bar.className = 'atlas-dialog-bar';
      const direct = document.createElement('a');
      direct.href = preview.href;
      direct.className = 'text-link';
      direct.textContent = 'Open full page';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'atlas-dialog-close';
      close.textContent = 'Close ×';
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      status.textContent = 'Loading public highways…';
      bar.append(direct, close);
      box.append(bar, status);
      document.getElementById('content').append(box);
      const lifetime = new AbortController();
      const mapSignal = AbortSignal.any([signal, lifetime.signal]);
      box.addEventListener('close', () => {
        lifetime.abort();
        box.remove();
        if (dialog === box) dialog = undefined;
        if (!signal.aborted) preview.focus({ preventScroll: true });
      }, { once: true });
      signal.addEventListener('abort', () => box.close(), { once: true, signal: lifetime.signal });
      close.addEventListener('click', () => box.close(), { signal: mapSignal });
      box.addEventListener('click', e => {
        if (e.target !== box) return;
        const bounds = box.getBoundingClientRect();
        if (e.clientX < bounds.left || e.clientX >= bounds.right || e.clientY < bounds.top || e.clientY >= bounds.bottom) box.close();
      }, { signal: mapSignal });
      box.showModal();
      close.focus();

      try {
        const [markup, data] = await Promise.all([pageHtml(preview.href), loadMap()]);
        if (mapSignal.aborted || !box.open) return;
        const atlas = new DOMParser().parseFromString(markup, 'text/html').querySelector('.atlas');
        if (!atlas) throw new Error('Map layout unavailable');
        status.replaceWith(atlas);
        window.thmHighwayMap(atlas.querySelector('canvas'), data, mapSignal);
      } catch {
        if (!mapSignal.aborted && box.open) {
          status.textContent = 'Could not load the map. Try opening the full page.';
          if (!status.isConnected) box.querySelector('.atlas')?.replaceWith(status);
        }
      }
    }, { signal });
  }

  function lazyRenderers(signal) {
    initMaps(signal);
    const skin = document.getElementById('skin-canvas');
    if (skin) {
      const observer = observe([skin], async entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        try {
          await loadScript('/js/vendor/three-r128.min.js');
          await loadScript('/js/skin.js?v=31');
          if (!signal.aborted && skin.isConnected) window.thmSkin(skin, signal);
        } catch {
          if (!signal.aborted) skin.closest('.plate')?.querySelector('.skin-hint')?.replaceChildren('Skin preview unavailable');
        }
      }, { rootMargin: '160px' });
    }
  }

  function onScroll() {
    document.querySelector('.nav')?.classList.toggle('scrolled', scrollY > 24);
    if (rail && !motion.matches) {
      const bounds = rail.getBoundingClientRect();
      if (bounds.bottom > 0 && bounds.top < innerHeight && bounds.height > 0) rail.style.setProperty('--fill', Math.min(1, Math.max(0, (innerHeight * .6 - bounds.top) / bounds.height)).toFixed(3));
    }
  }

  function initPage() {
    pageController = new AbortController();
    const { signal } = pageController;
    rail = document.querySelector('.log-rail');
    if (rail && motion.matches) rail.style.setProperty('--fill', '1');
    observe([...document.querySelectorAll('.log-row')], entries => entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('seen');
    }), { threshold: .2 });
    document.querySelectorAll('[data-route]').forEach(link => {
      const route = new URL(link.href).pathname;
      if (route === location.pathname || (route === '/players/' && location.pathname.startsWith(route))) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    lightboxes(signal);
    void stats(signal);
    lazyRenderers(signal);
    onScroll();
    if ('requestIdleCallback' in window) requestIdleCallback(warmPages, { timeout: 1500 });
    else setTimeout(warmPages, 300);
  }

  function updateHead(doc) {
    document.title = doc.title;
    for (const selector of ['meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]']) {
      const next = doc.querySelector(selector);
      const current = document.querySelector(selector);
      if (next && current) current.replaceWith(next);
    }
  }

  async function go(input, { push = true, restore = null, replace = false } = {}) {
    const id = ++navigation;
    const url = destination(input);
    let doc;
    try {
      doc = new DOMParser().parseFromString(await pageHtml(url.href), 'text/html');
      if (!doc.getElementById('content') || !doc.title) throw new Error('Invalid page');
    } catch {
      if (id === navigation) location.assign(url.href);
      return;
    }
    if (id !== navigation) return;
    transition?.skipTransition();
    const swap = () => {
      if (id !== navigation) return;
      disposePage();
      if (push) {
        history.replaceState({ ...history.state, y: scrollY }, '');
        history.pushState({ y: 0 }, '', url.href);
      }
      if (replace) history.replaceState({ y: 0 }, '', url.href);
      updateHead(doc);
      const content = document.getElementById('content');
      content.replaceChildren(...doc.getElementById('content').childNodes);
      currentUrl = new URL(location.href);
      initPage();
      let target;
      try { target = url.hash && document.getElementById(decodeURIComponent(url.hash.slice(1))); } catch {}
      if (restore !== null) scrollTo({ top: restore, behavior: 'instant' });
      else if (target) target.scrollIntoView({ behavior: 'instant' });
      else scrollTo({ top: 0, behavior: 'instant' });
      content.focus({ preventScroll: true });
      onScroll();
    };
    if (!motion.matches && document.startViewTransition) transition = document.startViewTransition(swap);
    else swap();
  }

  function closeMenu() {
    document.querySelector('.nav-links')?.classList.remove('open');
    const burger = document.querySelector('.nav-burger');
    burger?.setAttribute('aria-expanded', 'false');
    burger?.setAttribute('aria-label', 'Open menu');
  }

  function initShell() {
    applyTheme(preference('thm-theme'));
    history.scrollRestoration = 'manual';
    history.replaceState({ ...history.state, y: scrollY }, '');
    document.querySelector('.theme-toggle')?.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      preference('thm-theme', next);
    });
    document.querySelector('.nav-burger')?.addEventListener('click', event => {
      const open = document.querySelector('.nav-links').classList.toggle('open');
      event.currentTarget.setAttribute('aria-expanded', String(open));
      event.currentTarget.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    let queued = false;
    addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; onScroll(); });
    }, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    for (const name of ['pointerover', 'focusin']) document.addEventListener(name, event => {
      const link = event.target.closest?.('a[href]');
      if (link) prefetch(link.href);
    });
    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href]');
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      if (!pageUrl(link.href)) return;
      closeMenu();
      const url = destination(link.href);
      if (url.pathname === currentUrl.pathname && url.search === currentUrl.search) {
        // Invalidate any older request even when this click stays on the page.
        navigation++;
        return;
      }
      event.preventDefault();
      void go(link.href);
    });
    addEventListener('popstate', event => {
      navigation++;
      if (location.pathname === currentUrl.pathname && location.search === currentUrl.search) return;
      closeMenu();
      void go(location.href, { push: false, restore: event.state?.y ?? 0 });
    });
    addEventListener('pagehide', disposePage);
    addEventListener('pageshow', event => { if (event.persisted) initPage(); });
  }

  const initialUrl = new URL(location.href);
  initialUrl.hash = '';
  remember(pageUrl(initialUrl.href)?.href, { time: Date.now(), promise: Promise.resolve(document.documentElement.outerHTML) });
  initShell();
  initPage();
  if (destination(location.href).href !== location.href) void go(location.href, { push: false, replace: true });
})();
