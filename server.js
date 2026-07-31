// Set environment to production mode
process.env.NODE_ENV = 'production';

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

  const png = path.join(PUBLIC_DIR, req.path);
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
// the 301, gives up, and no cape loads.
app.get('/cape/index', (req, res) => {
  const base = `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;
  let files = [];
  try {
    files = fs.readdirSync(path.join(PUBLIC_DIR, 'cape')).filter((f) => f.endsWith('.webp'));
  } catch {}
  res.json({ capes: files.map((f) => ({ id: path.basename(f, '.webp'), url: `${base}/cape/${f}` })) });
});

// Serve all static files from the 'public' folder.
// No Cache-Control of our own, so Cloudflare caches at its own defaults and the
// traffic stays off this box. The cost is that a changed thm.css or thm.js can
// be served stale — bump the `?v=` on the script tags when you change them, and
// purge the CDN for CSS, which has no version query.
app.use(express.static(PUBLIC_DIR));

// Initialize server with retry on EADDRINUSE
function startServer(port, attempt = 1, maxAttempts = 5, delayMs = 1000) {
  const server = app.listen(port, () => {
    console.log(`THM Website running on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
      console.warn(`Port ${port} in use, retrying in ${delayMs}ms... (attempt ${attempt}/${maxAttempts})`);
      setTimeout(() => startServer(port, attempt + 1, maxAttempts, delayMs * 2), delayMs);
    } else {
      console.error(`Failed to bind port ${port} after ${attempt} attempt(s):`, err.message);
      process.exit(1);
    }
  });
}

convertPngs();
startServer(PORT);
