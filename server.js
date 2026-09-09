// Default to production; an explicit NODE_ENV in the environment still wins.
process.env.NODE_ENV ||= 'production';

const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const app = express();

// Configuration constants
const PORT = 3002;
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATS_FILE = path.join(PUBLIC_DIR, 'stats.json');

// ── PNG → WebP ───────────────────────────────────────────────────────────────
// Every .png under public/ gets a .webp twin on boot, and .png requests are
// answered with the twin when the browser takes webp and the twin is smaller.
// ponytail: system ffmpeg and a boot-time scan, so no image library in the deps
// and no conversion work in the request path. Drop in a new PNG, restart.
function findPngs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findPngs(full);
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

  res.setHeader('Vary', 'Accept'); // so a cache can't hand the webp to a client that can't read it
  try {
    if (fs.statSync(webp).size < fs.statSync(png).size) return res.sendFile(webp);
  } catch {}
  next();
});

// Live stats endpoint — Cache-Control: no-store prevents Cloudflare from caching it
app.get('/api/stats', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  try {
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
    res.json(stats);
  } catch {
    res.status(503).json({ error: 'stats unavailable' });
  }
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
app.get('/cape/index', (req, res) => {
  const base =
    process.env.SITE_ORIGIN ||
    `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  let files = [];
  try {
    files = fs.readdirSync(path.join(PUBLIC_DIR, 'cape')).filter((f) => f.endsWith('.webp'));
  } catch {}
  res.json({ capes: files.map((f) => ({ id: path.basename(f, '.webp'), url: `${base}/cape/${f}` })) });
});

// Serve all static files from the 'public' folder.
// No Cache-Control of our own, so Cloudflare caches at its own defaults and the
// traffic stays off this box. The cost is that a changed thm.css or thm.js can
// be served stale — bump the `?v=` on the thm.css and thm.js links when you
// change them, and no CDN purge is needed.
app.use(express.static(PUBLIC_DIR));

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

convertPngs();
listen();
