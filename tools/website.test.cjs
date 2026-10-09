'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const app = require('../server');
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
  const css = await fetch(origin + '/css/thm.css?v=19');
  assert.match(css.headers.get('cache-control'), /immutable/);
  const unversioned = await fetch(origin + '/css/thm.css');
  assert.doesNotMatch(unversioned.headers.get('cache-control'), /immutable/);
  const stats = await fetch(origin + '/api/stats');
  assert.match(stats.headers.get('cache-control'), /no-store/);
  const map = await fetch(origin + '/images/highway-map.webp');
  assert.match(map.headers.get('cache-control'), /max-age=60,/);
});

test('compression negotiates encodings and keeps all Vary fields', async () => {
  const css = await fetch(origin + '/css/thm.css?v=19', { headers: { 'accept-encoding': 'gzip' } });
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
  for (const route of ['/', '/network/', '/players/', '/achievements/', '/about/', '/players/MagnusKrill/', '/players/Ryazor/', '/players/Kyr0zen/', '/players/mingailas/', '/players/xm4nn/', '/players/Volizray/', '/players/fainecio/', '/players/CapyKing10/', '/players/MeganByte_/']) {
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
  const routes = ['/', '/network/', '/players/', '/achievements/', '/about/', '/players/MagnusKrill/', '/players/Ryazor/', '/players/Kyr0zen/', '/players/mingailas/', '/players/xm4nn/', '/players/Volizray/', '/players/fainecio/', '/players/CapyKing10/', '/players/MeganByte_/'];
  const documents = new Map();
  for (const route of routes) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 200, route);
    documents.set(route, await response.text());
  }
  for (const [route, markup] of documents) {
    for (const match of markup.matchAll(/href="([^"]+)"/g)) {
      const url = new URL(match[1], origin + route);
      if (url.origin !== origin || !url.pathname.endsWith('/')) continue;
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
