# THM Website

Live checkout mounted from `/home/umbrel/umbrel/home/THM-Website`. Static files
reach the public server immediately; server changes require restarting only the
`THM-Website` process through PM3. Keep unrelated bot processes running.

## Commands

- `node server.js`: Express server, port 3002 (`PORT` overrides for previews).
- `node --test tools/website.test.cjs`: HTTP caching/security and skin geometry checks.
- `node --check server.js`, `node --check public/js/thm.js`, `node --check public/js/skin.js`.
- `git diff --check`. Verify navigation and WebGL in the browser after visual changes.
- No build step. Dependencies: Express 5 and compression. Node on the Pi: 22.13.0.

## Frontend

Read `DESIGN.md` before visual changes. Plain HTML, shared `public/css/thm.css`
and `public/js/thm.js`. No framework, inline behaviour, or per-profile scripts.
Each head has only the hashed pre-paint theme script;
`thm.js` is deferred. Keep these heads consistent across all pages.

- Routes: `/`, `/network/`, `/map`, `/players/`, `/achievements/`, `/about/` and individual
  member profiles. Keep the homepage brief and details on their dedicated pages.
- Navigation preserves the shell and replaces only `main#content`. `initShell()`
  runs once; `initPage()` runs after each swap. Page listeners use the page
  AbortSignal; observers and renderers must dispose when it aborts.
- Keep the router's bounded, expiring cache, latest-click guard, failure fallback,
  head metadata updates, hash links, keyboard focus and back/forward restoration.
- Old homepage section bookmarks map to the dedicated pages. Seed the initial
  page cache with the actual document URL, never a remapped fragment destination.
- Every URL in markup is root-relative. New profiles use the existing template.
  Keep canonical/Open Graph metadata and `public/sitemap.xml` synchronized.
- Bump the shared `?v=` on every page and the asset version in `staticHeaders()`
  when changing JS/CSS/fonts. Versioned assets cache for a year; HTML revalidates. Client HTML fetches use `no-cache` to avoid
  extended browser TTLs while retaining the bounded memory cache.
- Images have dimensions and `decoding="async"`. Lazy-load below-fold images;
  the nav mark and main hero artwork are eager. Headings and text remain visible
  without JS. Offscreen sections use
  `content-visibility: auto`. Use the local licensed Archivo font.
- `skin.js` loads with the pinned local Three.js vendor only near a skin canvas.
  Outer layers use merged voxels, not expanded transparent cubes. Preserve slim
  and legacy skins, live Minotar textures, local fallbacks, pointer/keyboard
  control, automatic rotation with a pause button, and complete GPU disposal.
  Rotation stops offscreen, in hidden tabs and with reduced motion.
- `highway-map.js` draws Canvas 2D previews and the interactive Nether map from
  `/api/highway-map`. Previews open the map in a dialog using the `/map` layout.
  Render on resize or interaction and dispose on dialog close or page abort.
- Profile `MagnusKrill` replaces `Leon_170709`; the server redirects the old URL.
  Roster names link only to profiles that exist. Use live Kitbot Discord ranks at
  Highway Man and above; Retired takes precedence. Keep retired records and the
  explicit Volizray, xm4nn_, CapyKing10 and mingailas exceptions. MagnusKrill stays
  an active co-owner even if Discord assigns Retired. Prince rank means Co-owner. New names must come from
  `../kitbot/json/verified_players.json` accounts; never publish Discord-name fallbacks.
  Keep one roster sorted by `../kitbot/json/config.json` rank order, alphabetically
  within each rank. Retired entries use the Retired rank; retained unranked members
  follow configured ranks. Preserve existing retired Minecraft names. Publish no IDs or credentials.

## Server and mutable data

- Preserve port bind retries and shutdown connection draining. Express 5's
  `listening` event confirms a successful bind; a listen callback also receives
  failures. Preview via `require('./server').listen(...)` avoids cape conversion.
- `SITE_ORIGIN` defaults to `https://highwaymen.cc`. Never derive cape URLs from
  client Host or forwarding headers. `/cape/index` is used by THM-Addons.
- PNG twins use system ffmpeg. Keep the path-containment check and `Vary: Accept`.
  New cape PNGs settle for 2 seconds, convert to WebP, and are deleted only after
  a successful encode. Failed conversions preserve the PNG.
- `stats.json`, `map-meta.json` and highway-map images are written externally.
  Preserve them. `/api/stats` is no-store; map data caches for only 60 seconds.
- `/api/highway-map` reads Kitbot’s highway JSONC and serves a cached projection
  of public Nether geometry and work-in-progress loop segments. It shares KitBot’s
  loop visibility rules with the Discord map. Keep hidden routes and builder metadata private.
- Security headers include a CSP with hashed boot scripts and local script/font
  sources. Do not add unsafe-inline/unsafe-eval to script-src. Compression
  negotiates Brotli/gzip. 404/error responses must stay no-store.
- Cloudflare currently overrides HTML browser TTL to four hours. Its dashboard
  needs Browser Cache TTL set to Respect Existing Headers for origin freshness.
  Verify public headers; a CDN HIT does not prove the browser policy is correct.
