# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
node server.js        # Start the server (port 3002)
npm install           # Install dependencies (express, basic-auth)
```

No build step, no bundler, no test suite.

## Architecture

Static site served by a minimal Express server (`server.js`). Everything under `public/` is served as-is.

```
public/
  index.html                 # The landing page
  css/thm.css                # The entire design system, shared by every page
  js/thm.js                  # All behaviour, shared by every page
  js/skin.js                 # 3D Minecraft skin viewer, shared by profile pages
  players/<Name>/index.html  # Per-member profile pages
  players/Kyr0zen/art/       # Kyr0zen's portfolio images
  images/                    # .webp assets (banner, logo, map, kitbot icon)
  stats.json                 # Served live via GET /api/stats
  map-meta.json              # Highway map's last-updated timestamp
```

`server.js` does two things: `express.static('public')`, and a `GET /api/stats`
endpoint that reads `public/stats.json` with `Cache-Control: no-store` so
Cloudflare can't cache it. It retries on `EADDRINUSE` up to 5 times with
exponential backoff.

`stats.json` and `map-meta.json` are written by something outside this repo. If
either fetch fails the page degrades quietly (the plate keeps its `—`
placeholders).

## Frontend conventions

No framework, no build. Plain HTML, one shared stylesheet, one shared script.
CSS and JS are **not** inline — the only inline script is the pre-paint theme
setter in each `<head>`.

**Read `DESIGN.md` before touching anything visual.** It is the source of truth
for tokens, type roles, components, motion budget, and the rules the system
holds to. In short:

- Tokens: `--void` / `--basalt` surfaces, `--bone` / `--ash` / `--ash-dim` text,
  `--rule` / `--rule-2` hairlines, `--signal` orange as the one accent.
  Radius `--r-xs` 5 / `--r-sm` 9 / `--r` 14px, `--s2`–`--s9` spacing.
- Fonts (Google Fonts): **Archivo** at expanded widths (display), **Newsreader**
  (body serif), **IBM Plex Mono** (labels and data).
- No glassmorphism, no `backdrop-filter`, no glows or coloured shadows.
- No illustrated highway. The recurring device is the hairline: `hr.seam`
  between sections, `.road` beside the wordmark, and the `.log-rail` that fills
  as you scroll. There is no cross-section drawing — the copy states the width.
- The map is `.net` (text left, `.map` plate right) and opens full size in the
  `#map-zoom` native `<dialog>`; `thm.js` only wires up open/close.
- Scroll reveal: `.rv` elements get `.in` via `IntersectionObserver`. Profile
  pages use the older `.reveal` / `.visible` pair; `thm.js` handles both.
- Every animation respects `prefers-reduced-motion`; content is never gated on a
  JS class.

**Member profile pages** share `thm.css` and `thm.js` and are built from the same
components as the landing page — `.head`, `.h2`, `.prose`, `.plate`, `.facts`,
`.why` — plus a small `.pf-*` set (`.pf`, `.pf-crumb`, `.pf-head`, `.pf-name`,
`.pf-roles`, `.pf-role`, `.pf-bio`, `.pf-plate`, `.pf-body`, `.pf-prose`) and
`.skin-hint` / `#skin-canvas` for the 3D viewer.

When adding a player, copy any existing profile — they are all built from one
template. Keep the font `<link>`, the pre-paint theme script, `/js/skin.js`, and
`/js/thm.js?v=6`.

The skin viewer is `public/js/skin.js`, shared by every profile and configured
from the canvas element, so there is no per-page copy of it:

```html
<canvas id="skin-canvas" data-username="Ryazor" data-slim="false"></canvas>
```

Skins come live from `minotar.net/skin/<username>.png`, with a flat Steve
fallback if the request fails. `data-slim="true"` gives 3px (Alex) arms.

**Roster links:** on the landing page a name is an `<a href="/players/<Name>/">`
only when that page exists; everything else is a plain `<span>` so the roster has
no dead links. When you add a profile, switch its roster entry to a link.

The v2 profile classes are **gone from the CSS**: `.glass`, `.glass-hover`,
`.profile-*`, `.wiki-*`, `.role-badge`, `.facts-table`, `.stat-table`, `.ach-*`
and `.chip`. A page still written against those will render unstyled — port it to
the classes above.

Anchors on the landing page: `#about`, `#log`, `#network`, `#standard`,
`#alliance`, `#roster`. Profile pages link back to `#roster`.
