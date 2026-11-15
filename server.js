// Default to production; an explicit NODE_ENV in the environment still wins.
process.env.NODE_ENV ||= 'production';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { readFile, stat } = require('node:fs/promises');
const { publicNetherMap } = require('./helpers/highway-map.cjs');
const { spawnSync, execFile } = require('child_process');
const { createHash } = require('crypto');
const compression = require('compression');
const app = express();

// Configuration constants
const PORT = Number(process.env.PORT || 3002);
const PUBLIC_DIR = path.join(__dirname, 'public');
const HIGHWAYS_FILE = path.join(__dirname, '..', 'kitbot', 'json', 'highways.jsonc');
const STATS_FILE = path.join(PUBLIC_DIR, 'stats.json');
const SITE_ORIGIN = new URL(process.env.SITE_ORIGIN || 'https://highwaymen.cc').origin;
if (!/^https?:\/\//.test(SITE_ORIGIN)) throw new Error('SITE_ORIGIN must use HTTP or HTTPS');

const inlineScripts = new Set();
for (const file of fs.readdirSync(PUBLIC_DIR, { recursive: true }).filter(file => path.basename(file) === 'index.html').map(file => path.join(PUBLIC_DIR, file))) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (match[1]) inlineScripts.add(`'sha256-${createHash('sha256').update(match[1]).digest('base64')}'`);
  }
}
const csp = [
  "default-src 'self'", `script-src 'self' ${[...inlineScripts].join(' ')} 'inline-speculation-rules'`,
  "style-src 'self'", "style-src-attr 'unsafe-inline'", "font-src 'self'",
  "img-src 'self' https://minotar.net data:", "connect-src 'self' https://minotar.net",
  "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'",
].join('; ');
app.disable('x-powered-by');
app.use(compression({ level: 4, brotli: { params: { [require('zlib').constants.BROTLI_PARAM_QUALITY]: 4 } } }));
app.use((_req, res, next) => {
  res.set({
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Frame-Options': 'DENY',
  });
  next();
});

function staticHeaders(res, file) {
  if (/\.(?:css|js|woff2)$/.test(file)) {
    const version = new URL(res.req.originalUrl, SITE_ORIGIN).searchParams.get('v');
    res.set('Cache-Control', version === '24' ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
  } else if (/\.html$/.test(file)) {
    res.set('Cache-Control', 'public, no-cache, max-age=0, must-revalidate');
    res.set('Cloudflare-CDN-Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
  } else if (/\.(?:json|png|webp)$/.test(file) && /(?:stats|map-meta|highway-map)\./.test(file)) {
    res.set('Cache-Control', 'public, max-age=60, must-revalidate');
    res.set('Cloudflare-CDN-Cache-Control', 'public, max-age=60');
  } else {
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=60');
  }
}

app.get(['/players/Leon_170709', '/players/Leon_170709/', '/players/Leon_170709/index.html'], (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.redirect(301, '/players/MagnusKrill/');
});

// ── PNG → WebP ───────────────────────────────────────────────────────────────
// Every .png under public/ gets a .webp twin on boot, and .png requests are
// answered with the twin when the browser takes webp and the twin is smaller.
// ponytail: system ffmpeg and a boot-time scan, so no image library in the deps
// and no conversion work in the request path. Drop in a new PNG, restart.
function findPngs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    // public/cape/ is watchCapes' job, which deletes the PNG instead of keeping a twin.
    if (entry.isDirectory()) return full === CAPE_DIR ? [] : findPngs(full);
    return entry.isFile() && entry.name.toLowerCase().endsWith('.png') ? [full] : [];
  });
}

function convertPngs() {
  for (const png of findPngs(PUBLIC_DIR)) {
    const webp = png.replace(/\.png$/i, '.webp');
    const rel = path.relative(PUBLIC_DIR, png);
    // Already converted, and the PNG hasn't changed since.
    try {
      if (fs.statSync(webp).mtimeMs >= fs.statSync(png).mtimeMs) continue;
    } catch {}
    // Lossless: some of these are 64px skins, where lossy webp fringes.
    const r = spawnSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-lossless', '1', webp,
    ]);
    if (r.status === 0) console.log(`webp: ${rel} converted`);
    else console.warn(`webp: ${rel} not converted, serving the PNG —`, r.error?.message || r.stderr?.toString().trim());
  }
}

// ── New capes ────────────────────────────────────────────────────────────────
// public/cape/ is watched: a .png dropped in becomes a lossless .webp and the
// .png is deleted, so /cape/index lists it with no restart. The index only reads
// .webp, so a cape PNG is dead weight — unlike the twins above, it goes.
// The settle delay lets an upload finish writing before ffmpeg reads it.
const CAPE_DIR = path.join(PUBLIC_DIR, 'cape');
const CAPE_SETTLE_MS = 2000;
const capeTimers = new Map();

function convertCape(png) {
  const name = path.basename(png);
  const webp = png.replace(/\.png$/i, '.webp');
  execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', png, '-c:v', 'libwebp', '-lossless', '1', webp], (err, _out, stderr) => {
    // Delete only once the webp really exists — a failed encode keeps the PNG.
    let ok = !err;
    try { ok = ok && fs.statSync(webp).size > 0; } catch { ok = false; }
    if (!ok) return console.warn(`cape: ${name} not converted, PNG kept —`, err?.message || stderr.trim());
    fs.rm(png, { force: true }, () => console.log(`cape: ${name} -> ${path.basename(webp)}, PNG deleted`));
  });
}

function watchCapes() {
  let pngs;
  try { pngs = fs.readdirSync(CAPE_DIR).filter((f) => /\.png$/i.test(f)); } catch { return; }
  pngs.forEach((f) => convertCape(path.join(CAPE_DIR, f))); // dropped in while the server was down
  fs.watch(CAPE_DIR, (_event, name) => {
    if (!name || !/\.png$/i.test(name)) return;
    clearTimeout(capeTimers.get(name));
    capeTimers.set(name, setTimeout(() => {
      capeTimers.delete(name);
      const png = path.join(CAPE_DIR, name);
      if (fs.existsSync(png)) convertCape(png);
    }, CAPE_SETTLE_MS));
  }).on('error', (e) => console.warn('cape: watcher stopped —', e.message));
}

app.use((req, res, next) => {
  if (!req.path.toLowerCase().endsWith('.png')) return next();
  if (!req.headers.accept?.includes('image/webp')) return next();

  // req.path is still percent-encoded; without decoding, a PNG with a space in
  // its name never finds its twin and silently ships the PNG.
  let rel;
  try {
    rel = decodeURIComponent(req.path);
  } catch {
    return next(); // malformed escape — let static deal with it
  }
  const png = path.join(PUBLIC_DIR, rel);
  if (!png.startsWith(PUBLIC_DIR + path.sep)) return next(); // ../ escapes
  const webp = png.replace(/\.png$/i, '.webp');

  res.vary('Accept');
  try {
    if (fs.statSync(webp).size < fs.statSync(png).size) {
      staticHeaders(res, webp);
      return res.sendFile(webp);
    }
  } catch {}
  next();
});

// Live stats endpoint — Cache-Control: no-store prevents Cloudflare from caching it
app.get('/api/stats', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    res.json(stats);
  } catch {
    res.status(503).json({ error: 'stats unavailable' });
  }
});

let highwayMap;
app.get('/api/highway-map', async (_req, res) => {
  try {
    const { mtimeMs, size, ino } = await stat(HIGHWAYS_FILE);
    const revision = `${ino}:${size}:${mtimeMs}`;
    if (highwayMap?.revision !== revision) {
      const { parseJsonc } = require('../kitbot/helpers/jsonFiles.cjs');
      const source = await readFile(HIGHWAYS_FILE, 'utf8');
      highwayMap = { revision, data: JSON.stringify(publicNetherMap(parseJsonc(source))) };
    }
    res.set('Cache-Control', 'public, max-age=60, must-revalidate');
    res.set('Cloudflare-CDN-Cache-Control', 'public, max-age=60');
    res.type('json').send(highwayMap.data);
  } catch {
    res.set('Cache-Control', 'no-store');
    res.set('Cloudflare-CDN-Cache-Control', 'no-store');
    res.status(503).json({ error: 'Highway map unavailable' });
  }
});

app.get('/map', (_req, res, next) => {
  const file = path.join(PUBLIC_DIR, 'map', 'index.html');
  staticHeaders(res, file);
  res.sendFile(file, error => { if (error) next(error); });
});

// Cape index for THM-Addons — its CapeManager GETs this and expects
// {"capes":[{"id","url"}]}, then saves each download as <id>.webp. Built from
// the directory at request time, so dropping a .webp into public/cape/ is the
// whole job of adding a cape.
// ponytail: x-forwarded-proto because Cloudflare terminates TLS and the client
// is HttpURLConnection, which won't follow the http→https redirect — it sees
// the 301, gives up, and no cape loads. SITE_ORIGIN pins the host when set,
// since the Host header these URLs are otherwise built from is the client's to
// choose — set it in production and the mod can't be pointed elsewhere.
app.get('/cape/index', (_req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.set('Cloudflare-CDN-Cache-Control', 'no-store');
  let files = [];
  try {
    files = fs.readdirSync(path.join(PUBLIC_DIR, 'cape')).filter((f) => f.endsWith('.webp'));
  } catch {}
  res.json({ capes: files.map((f) => ({ id: path.basename(f, '.webp'), url: `${SITE_ORIGIN}/cape/${encodeURIComponent(f)}` })) });
});

app.use(express.static(PUBLIC_DIR, { dotfiles: 'deny', setHeaders: staticHeaders }));
app.use((_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Cloudflare-CDN-Cache-Control', 'no-store');
  res.status(404).type('html').send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Page not found · THM</title><link rel="stylesheet" href="/css/thm.css?v=24"><main class="wrap pf"><h1 class="h2">Page not found.</h1><p>The page may have moved.</p><a class="btn btn-signal" href="/">Go to the homepage</a></main></html>');
});
app.use((err, _req, res, _next) => {
  const status = err.status === 400 ? 400 : 500;
  res.set('Cache-Control', 'no-store');
  res.set('Cloudflare-CDN-Cache-Control', 'no-store');
  res.status(status).type('text').send(status === 400 ? 'Bad request' : 'Website temporarily unavailable');
});

// Bind retry. Do not remove: 3002 comes back EADDRINUSE for a few seconds after
// a restart even when nothing is listening on it — the previous process still
// holds the socket while its keep-alive connections drain, so `ss` shows the
// port free while `bind()` still refuses. Dying here doesn't help, because the
// supervisor's own restart lands in the same window. Five attempts, 1s doubling
// to 16s, then give up loudly.
function listen(attempt = 1, wait = 1000, maxAttempts = 5) {
  const server = app.listen(PORT);

  // 'listening', not app.listen's callback: Express 5 treats a trailing function
  // as a node-style callback and also registers it for 'error', so the old
  // success line printed on every failed bind too. This event only fires when
  // the port is actually ours.
  server.once('listening', () =>
    console.log(`THM Website running on http://localhost:${PORT}`)
  );

  server.once('error', (err) => {
    if (err.code !== 'EADDRINUSE' || attempt >= maxAttempts) {
      console.error(`Failed to bind port ${PORT} after ${attempt} attempt(s):`, err.message);
      process.exit(1);
    }
    console.warn(`Port ${PORT} in use, retrying in ${wait}ms... (attempt ${attempt}/${maxAttempts})`);
    setTimeout(() => listen(attempt + 1, wait * 2, maxAttempts), wait);
  });

  // The other half of the same problem: release the port on the way out instead
  // of leaving the next boot to retry through the drain window. Without
  // closeAllConnections an idle keep-alive from Cloudflare holds it open.
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.once(sig, () => {
      server.closeAllConnections();
      server.close(() => process.exit(0));
    });
  }
}

if (require.main === module) {
  convertPngs();
  watchCapes();
  listen();
}
module.exports = app;
