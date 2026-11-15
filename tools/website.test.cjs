'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = require('../server');
const { publicNetherMap } = require('../helpers/highway-map.cjs');
let server, origin;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));

test('pages revalidate, versioned assets cache, and live data stays fresh', async () => {
  const page = await fetch(origin + '/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('cache-control'), /no-cache, max-age=0/);
  assert.match(page.headers.get('cloudflare-cdn-cache-control'), /max-age=300/);
  const css = await fetch(origin + '/css/thm.css?v=31');
  assert.match(css.headers.get('cache-control'), /immutable/);
  const unversioned = await fetch(origin + '/css/thm.css');
  assert.doesNotMatch(unversioned.headers.get('cache-control'), /immutable/);
  const stats = await fetch(origin + '/api/stats');
  assert.match(stats.headers.get('cache-control'), /no-store/);
  const map = await fetch(origin + '/images/highway-map.webp');
  assert.match(map.headers.get('cache-control'), /max-age=60,/);
});

test('highway map includes only public Nether geometry', () => {
  const entry = (x, z, onMap) => ({ onMap, coordinates: { x, y: 120, z }, updatedBy: 'private' });
  const map = publicNetherMap({
    nether: {
      N: entry(0, -500, true),
      dugN: entry(0, -800, false),
      E: entry(500, 0, true),
      dugE: entry(800, 0, true),
      W: entry(-500, 0, false),
      dugW: entry(-800, 0, true),
      hidden: entry(12, 34, false),
      unlisted: entry(41, 72),
      landmark: entry(23, 45, true),
      ringRoads: [{ radius: 25, paved: true }, { radius: 200, paved: true, onMap: false }],
      diamondHighways: [{ radius: 100, paved: false }]
    },
    overworld: { other: entry(5000, 5000, true) },
    end: { other: entry(1000, 1000, true) }
  }, [
    { route: 'ring-1000', side: 1, paved: false, from: 10, to: 100, direction: 'S', builder: 'private' },
    { route: 'ring-200', side: 1, paved: true, from: 10, to: 100 },
    { route: 'ring-25', side: 2, paved: true, from: 10, to: 40 },
    { route: 'diamond-100', side: 0, paved: true, from: 20, to: 90 },
    { route: 'diamond-100', side: 0, paved: false, from: 20, to: 90 },
    { route: 'diamond-1000', side: 0, paved: false, from: 20, to: 2000 }
  ]);
  assert.deepEqual(map, { axes: [['N', 0, -500], ['E', 500, 0, 800, 0]], rings: [[25, 1]], diamonds: [[100, 0]], points: [['landmark', 23, 45]],
    progress: [['ring-1000', 1, 0, 10, 100], ['diamond-100', 0, 1, 20, 90]] });
});

test('map opens at /map and revalidates its HTML', async () => {
  const response = await fetch(origin + '/map', { redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-cache/);
  assert.match(await response.text(), /<title>Nether highway map/);
});

test('map zoom eases around the cursor, clips distant geometry, and returns to idle', () => {
  class Element extends EventTarget {
    constructor() { super(); this.dataset = {}; this.classList = { remove() {} }; }
    append() {}
    add() {}
    setAttribute() {}
    replaceChildren(...children) { this.textContent = children.map(child => child.textContent).join(' '); }
  }
  const canvas = new Element();
  const frame = new Element();
  const position = new Element();
  const select = new Element();
  const options = [];
  select.add = option => options.push(option);
  const controls = new Element();
  const label = new Element();
  const scope = new Element();
  const status = new Element();
  const detail = new Element();
  canvas.closest = selector => selector === '.atlas-frame' ? frame : scope;
  canvas.hasAttribute = () => true;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
  select.closest = () => label;
  frame.querySelector = () => position;
  scope.querySelector = selector => ({
    '[data-map-feature]': select, '.atlas-controls': controls, '.atlas-status': status, '.atlas-detail': detail
  })[selector];

  let paints = 0, resize, now = 0, id = 0;
  const pending = new Map();
  const labels = new Set();
  const dashedStrokes = [];
  const dots = [];
  const paint = {
    dash: [],
    fillRect(x, y) { if (x === 0 && y === 0) paints++; },
    fillText(text) { labels.add(text); },
    createLinearGradient() { return { addColorStop() {} }; },
    setLineDash(dash) { this.dash = dash; },
    beginPath() { this.path = []; },
    moveTo(x, y) { this.path.push([x, y]); },
    lineTo(x, y) { this.path.push([x, y]); },
    stroke() {
      if (this.dash.length) dashedStrokes.push({ points: this.path, offset: this.lineDashOffset, dash: [...this.dash] });
    },
    arc(x, y, radius) { this.circle = { x, y, radius }; },
    fill() { dots.push({ ...this.circle, color: this.fillStyle }); }
  };
  canvas.getContext = () => new Proxy(paint, { get: (target, name) => target[name] ?? (() => {}) });
  const window = {};
  const document = new Element();
  document.createElement = () => new Element();
  const preference = { matches: false };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/highway-map.js'), 'utf8'), {
    window, document,
    Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    devicePixelRatio: 2, matchMedia: () => preference,
    performance: { now: () => now },
    ResizeObserver: class { constructor(callback) { resize = callback; } observe() {} disconnect() {} },
    requestAnimationFrame: cb => { pending.set(++id, cb); return id; },
    cancelAnimationFrame: id => pending.delete(id)
  });
  function frameAt(time) {
    now = time;
    const [id, draw] = pending.entries().next().value;
    pending.delete(id);
    draw(time);
  }
  function wheel() {
    canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { clientX: 300, clientY: 200, deltaY: -160 }));
  }

  const controller = new AbortController();
  require('node:events').setMaxListeners(24, controller.signal);
  window.thmHighwayMap(canvas, {
    axes: [['E', 100, 0, 30_000_000, 0]], rings: [], diamonds: [], points: [],
    progress: [['diamond-3750000', 3, 0, 1197465, 1875000], ['diamond-3750000', 3, 0, 0, 500000]]
  }, controller.signal);
  resize([{ contentRect: { width: 500, height: 500 } }]);
  frameAt(0);
  assert.equal(canvas.width, 1000);
  assert.ok(labels.has('Overworld Border (3.75M)'));
  assert.ok(labels.has('Nether Border (30M)'));
  const tips = dots.filter(dot => dot.color === '#FFA500' && dot.radius === 4);
  assert.equal(tips.length, 2);
  const overviewScale = 500 * .42 / 30_000_000;
  assert.deepEqual([tips[0].x, tips[0].y], [250 - 2552535 * overviewScale, 250 - 1197465 * overviewScale]);
  assert.deepEqual([tips[1].x, tips[1].y], [250 - 3250000 * overviewScale, 250 - 500000 * overviewScale]);
  wheel();
  frameAt(1);
  const anchor = position.textContent;
  frameAt(80);
  assert.equal(position.textContent, anchor);
  assert.equal(pending.size, 1);
  frameAt(180);
  assert.equal(position.textContent, anchor);
  assert.equal(paints, 4);
  assert.equal(pending.size, 0);
  preference.matches = true;
  wheel();
  frameAt(200);
  assert.equal(pending.size, 0);

  const key = value => canvas.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: value }));
  key('0');
  for (let i = 0; i < 32; i++) key('+');
  for (let i = 0; i < 7; i++) key('ArrowRight');
  dashedStrokes.length = 0;
  frameAt(220);
  assert.equal(dashedStrokes.length, 1);
  const { points, offset } = dashedStrokes[0];
  assert.equal(points.length, 2);
  assert.ok(Math.abs(points[0][0] + 4) < .01 && Math.abs(points[1][0] - 504) < .01);
  assert.ok(points.every(([, y]) => y === 250));
  assert.ok(Math.abs(offset - 6) < .01);

  const checkpoints = options.filter(option => option.label.includes('WIP'));
  assert.equal(checkpoints.length, 2);
  assert.notEqual(checkpoints[0].label, checkpoints[1].label);
  select.value = checkpoints.find(option => option.label.endsWith('X -2,552,535 · Z -1,197,465')).value;
  select.dispatchEvent(new Event('change'));
  dashedStrokes.length = 0;
  frameAt(240);
  const progress = dashedStrokes.find(stroke => stroke.dash[0] === 2 && stroke.dash[1] === 4);
  assert.ok(progress, 'the selected checkpoint renders as a dotted segment');
  const [[ax, ay], [bx, by]] = progress.points;
  assert.ok(Math.hypot(bx - ax, by - ay) > 300);
  assert.match(detail.textContent, /Start X -1,875,000 · Z -1,875,000 End X -2,552,535 · Z -1,197,465/);

  resize([{ contentRect: { width: 3840, height: 2160 } }]);
  assert.equal(canvas.width, 3840);
  assert.equal(canvas.height, 2160);
  controller.abort();
});

test('compression negotiates encodings and keeps all Vary fields', async () => {
  const css = await fetch(origin + '/css/thm.css?v=31', { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(css.headers.get('content-encoding'), 'gzip');
  assert.match(css.headers.get('vary'), /Accept-Encoding/);
  assert.ok((await css.text()).startsWith('@font-face'));
  const png = await fetch(origin + '/images/highway-map.png', { headers: { accept: 'image/webp', 'accept-encoding': 'gzip' } });
  assert.match(png.headers.get('content-type'), /image\/webp/);
  assert.match(png.headers.get('vary'), /Accept/);
});

test('cape URLs cannot be poisoned with Host or forwarding headers', async () => {
  const response = await fetch(origin + '/cape/index', { headers: { host: 'attacker.example', 'x-forwarded-proto': 'javascript' } });
  const data = await response.json();
  assert.ok(data.capes.every(cape => new URL(cape.url).origin === 'https://highwaymen.cc'));
  assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
});

test('cape index IDs can be selected through KitBot', async () => {
  const response = await fetch(origin + '/cape/index');
  const { capes } = await response.json();
  assert.ok(capes.length > 0);
  for (const { id } of capes) assert.match(id, /^[a-zA-Z0-9_-]{1,32}$/);
});

test('old profile redirects and missing pages cannot be cached', async () => {
  const old = await fetch(origin + '/players/Leon_170709/', { redirect: 'manual' });
  assert.equal(old.status, 301);
  assert.equal(old.headers.get('location'), '/players/MagnusKrill/');
  assert.equal((await fetch(origin + old.headers.get('location'))).status, 200);
  const missing = await fetch(origin + '/players/missing/');
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.equal(missing.headers.get('cloudflare-cdn-cache-control'), 'no-store');
});

test('security headers permit only the intended inline boot scripts', async () => {
  const response = await fetch(origin + '/');
  const policy = response.headers.get('content-security-policy');
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.doesNotMatch(policy.split(';').find(part => part.includes('script-src')), /unsafe-inline|unsafe-eval/);
  assert.equal(response.headers.get('x-powered-by'), null);
  const { createHash } = require('node:crypto');
  for (const route of ['/', '/network/', '/players/', '/achievements/', '/about/', '/players/MagnusKrill/', '/players/Ryazor/', '/players/Kyr0zen/', '/players/mingailas/', '/players/xm4nn/', '/players/Volizray/', '/players/fainecio/', '/players/CapyKing10/']) {
    const html = await (await fetch(origin + route)).text();
    for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (match[1]) assert.ok(policy.includes(createHash('sha256').update(match[1]).digest('base64')), route);
    }
  }
});

function skinFixture({ outer = true, modern = true, slim = false, reduced = false } = {}) {
  const THREE = require('../public/js/vendor/three-r128.min.js');
  const pixels = new Uint8ClampedArray(64 * (modern ? 64 : 32) * 4);
  if (outer) for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 200; pixels[i + 1] = 100; pixels[i + 2] = 50; pixels[i + 3] = 255; }
  let scene, disposed = false, lost = false;
  class Renderer {
    setPixelRatio() {} setSize() {}
    render(value) { scene = value; }
    dispose() { disposed = true; }
    forceContextLoss() { lost = true; }
  }
  class Loader {
    setCrossOrigin() {}
    load(_url, receive) { const texture = new THREE.Texture(); texture.image = { width: 64, height: modern ? 64 : 32 }; receive(texture); }
  }
  let observer;
  class Observer {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() { this.callback([{ isIntersecting: true }]); }
    disconnect() {}
  }
  const canvas = new EventTarget();
  canvas.isConnected = true;
  canvas.dataset = { username: 'test', slim: String(slim) };
  const spinButton = new EventTarget();
  spinButton.setAttribute = () => {};
  canvas.closest = () => ({ querySelector: () => spinButton });
  canvas.setPointerCapture = () => {};
  const controller = new AbortController();
  const document = new EventTarget();
  document.createElement = () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: pixels }) }) });
  document.hidden = false;
  const media = new EventTarget();
  media.matches = reduced;
  const frames = new Map();
  let frameId = 0;
  const context = { window: { THREE: { ...THREE, WebGLRenderer: Renderer, TextureLoader: Loader } }, document, IntersectionObserver: Observer,
    matchMedia: () => media, devicePixelRatio: 1, requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id) };
  function step(time) {
    const next = frames.entries().next().value;
    if (!next) return false;
    frames.delete(next[0]);
    next[1](time);
    return true;
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/skin.js'), 'utf8'), context);
  context.window.thmSkin(canvas, controller.signal);
  step(100);
  return { group: scene.children.find(child => child.isGroup), controller, spinButton, document, media, step,
    setVisible: visible => observer.callback([{ isIntersecting: visible }]),
    get pendingFrames() { return frames.size; }, get disposed() { return disposed && lost; } };
}

test('3D layers produce merged voxel meshes with real depth and correct UV sides', () => {
  const fixture = skinFixture();
  assert.equal(fixture.group.children.length, 12);
  const head = fixture.group.children[0];
  assert.ok(Math.abs(head.geometry.attributes.uv.array[0] - 16 / 64) < .0001);
  const layer = fixture.group.children[1];
  layer.geometry.computeBoundingBox();
  assert.ok(layer.geometry.boundingBox.max.x > 4.4);
  assert.ok(layer.geometry.boundingBox.min.x < -4.4);
  for (const mesh of fixture.group.children) for (const value of mesh.geometry.attributes.position.array) assert.ok(Number.isFinite(value));
  fixture.controller.abort();
  assert.equal(fixture.disposed, true);
});

test('transparent skin layers allocate no voxel meshes; slim arms use three pixels', () => {
  const fixture = skinFixture({ outer: false, slim: true });
  assert.equal(fixture.group.children.length, 6);
  assert.equal(fixture.group.children[2].geometry.parameters.width, 3);
  fixture.controller.abort();
});

test('legacy 64x32 skins mirror limbs and only add a hat layer', () => {
  const fixture = skinFixture({ modern: false });
  assert.equal(fixture.group.children.length, 7);
  assert.equal(fixture.group.children[4].scale.x, -1);
  fixture.controller.abort();
});


test('skin rotates automatically, can pause, and stops offscreen or after disposal', () => {
  const f = skinFixture();
  const start = f.group.rotation.y;
  f.step(150);
  assert.ok(f.group.rotation.y > start);
  assert.equal(f.pendingFrames, 1);
  f.setVisible(false);
  assert.equal(f.pendingFrames, 0);
  const offscreen = f.group.rotation.y;
  f.setVisible(true);
  f.step(10000);
  assert.equal(f.group.rotation.y, offscreen);
  f.spinButton.dispatchEvent(new Event('click'));
  for (let time = 10050; time < 12000; time += 50) f.step(time);
  assert.equal(f.pendingFrames, 0);
  assert.equal(f.spinButton.textContent, 'Start rotation');
  f.spinButton.dispatchEvent(new Event('click'));
  assert.equal(f.pendingFrames, 1);
  f.controller.abort();
  assert.equal(f.pendingFrames, 0);
  assert.equal(f.disposed, true);
});

test('reduced motion and hidden tabs have no autonomous skin render loop', () => {
  const f = skinFixture({ reduced: true });
  assert.equal(f.pendingFrames, 0);
  assert.equal(f.spinButton.disabled, true);
  f.media.matches = false;
  f.media.dispatchEvent(new Event('change'));
  f.step(150);
  assert.equal(f.pendingFrames, 1);
  f.document.hidden = true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.pendingFrames, 0);
  f.document.hidden = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.pendingFrames, 1);
  f.media.matches = true;
  f.media.dispatchEvent(new Event('change'));
  f.step(200);
  assert.equal(f.pendingFrames, 0);
  f.controller.abort();
});

test('every internal page link and fragment resolves after splitting the homepage', async () => {
  const routes = ['/', '/network/', '/map', '/players/', '/achievements/', '/about/', '/players/MagnusKrill/', '/players/Ryazor/', '/players/Kyr0zen/', '/players/mingailas/', '/players/xm4nn/', '/players/Volizray/', '/players/fainecio/', '/players/CapyKing10/'];
  const documents = new Map();
  for (const route of routes) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    documents.set(route, await response.text());
  }
  for (const [route, markup] of documents) {
    for (const match of markup.matchAll(/href="([^"]+)"/g)) {
      const url = new URL(match[1], origin + route);
      if (url.origin !== origin || (url.pathname !== '/map' && !url.pathname.endsWith('/'))) continue;
      assert.ok(documents.has(url.pathname), `Missing page: ${route} -> ${url.pathname}`);
      if (url.hash) assert.ok(documents.get(url.pathname).includes(`id="${url.hash.slice(1)}"`), `Missing fragment: ${route} -> ${url.pathname}${url.hash}`);
    }
  }
});

test('moved homepage bookmarks cannot seed their destination cache with homepage HTML', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/thm.js'), 'utf8');
  // Execute real cache initialization, exposing its reader before DOM wiring.
  const cacheScript = source.slice(0, source.lastIndexOf('  initShell();')) + '\n  window.readPage = pageHtml;\n})();';
  for (const [hash, route] of [['#roster', '/players/'], ['#network', '/network/'], ['#log', '/about/']]) {
    const requests = [];
    const context = { window: {}, document: { documentElement: { outerHTML: 'Home document' } },
      location: { href: 'https://highwaymen.cc/' + hash, origin: 'https://highwaymen.cc' }, navigator: {}, URL, AbortSignal,
      matchMedia: () => ({ matches: false }), fetch: async (url, options) => {
        requests.push({ url, cache: options.cache });
        return { ok: true, url, headers: new Headers({ 'content-type': 'text/html' }), text: async () => 'Destination document' };
      } };
    vm.runInNewContext(cacheScript, context);
    assert.equal(await context.window.readPage('https://highwaymen.cc/' + hash), 'Destination document');
    assert.deepEqual(requests, [{ url: 'https://highwaymen.cc' + route, cache: 'no-cache' }]);
    assert.equal(await context.window.readPage('https://highwaymen.cc/'), 'Home document');
  }
});
