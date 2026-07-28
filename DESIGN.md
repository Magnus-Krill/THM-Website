---
name: The Highway Men
description: The Nether highway clan on 6b6t. Five blocks wide, spawn to the world border.
colors:
  void:           "#0d0b0c"
  basalt:         "#151214"
  bone:           "#efe9e3"
  ash:            "#a29a95"
  ash-dim:        "#837b77"
  rule:           "rgba(239, 233, 227, 0.09)"
  rule-2:         "rgba(239, 233, 227, 0.19)"
  signal:         "#ee6b1f"
  signal-hi:      "#ff7d33"
  signal-line:    "rgba(238, 107, 31, 0.45)"
  signal-wash:    "rgba(238, 107, 31, 0.10)"
  discord:        "#5865f2"
  discord-hi:     "#4a56d8"
  discord-ink:    "#8b95f6"
  discord-line:   "rgba(88, 101, 242, 0.45)"
  on-signal:      "#17100b"
  on-signal-light: "#fff"
  void-light:        "#f3efe8"
  basalt-light:      "#e9e3d9"
  bone-light:        "#1a1614"
  ash-light:         "#57504b"
  ash-dim-light:     "#6f6862"
  rule-light:        "rgba(26, 22, 20, 0.13)"
  rule-2-light:      "rgba(26, 22, 20, 0.26)"
  signal-light:      "#b34305"
  signal-hi-light:   "#932f00"
  signal-line-light: "rgba(179, 67, 5, 0.45)"
  signal-wash-light: "rgba(179, 67, 5, 0.06)"
  discord-ink-light: "#3b45c9"
typography:
  display:
    fontFamily: "'Archivo', system-ui, sans-serif"
    fontSize:   "clamp(2.75rem, 9vw, 6.75rem)"
    fontWeight: 800
    fontStretch: "120%"
    lineHeight: 0.85
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "'Archivo', system-ui, sans-serif"
    fontSize:   "clamp(1.9rem, 4.2vw, 3.1rem)"
    fontWeight: 700
    fontStretch: "112%"
    lineHeight: 0.96
    letterSpacing: "-0.025em"
  title:
    fontFamily: "'Archivo', system-ui, sans-serif"
    fontSize:   "1.05rem"
    fontWeight: 700
    fontStretch: "106%"
    lineHeight: 1.25
    letterSpacing: "0.005em"
  numeral:
    fontFamily: "'Archivo', system-ui, sans-serif"
    fontSize:   "clamp(1.5rem, 3vw, 1.9rem)"
    fontWeight: 700
    fontStretch: "100%"
    letterSpacing: "-0.03em"
  body:
    fontFamily: "'Newsreader', Georgia, serif"
    fontSize:   "1.0625rem"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize:   "0.6875rem"
    fontWeight: 500
    letterSpacing: "0.15em"
  label-sm:
    fontFamily: "'IBM Plex Mono', ui-monospace, monospace"
    fontSize:   "0.625rem"
    fontWeight: 500
    letterSpacing: "0.18em"
rounded:
  xs: "5px"
  sm: "9px"
  default: "14px"
spacing:
  s2: "0.5rem"
  s3: "0.75rem"
  s4: "1rem"
  s5: "1.5rem"
  s6: "2rem"
  s7: "3rem"
  s8: "4rem"
  s9: "6rem"
  section:       "clamp(3.5rem, 6.5vw, 5.5rem)"
  container-max: "1180px"
  container-wide: "1520px"
  container-pad: "clamp(1.25rem, 4vw, 3rem)"
components:
  btn-signal:
    backgroundColor: "{colors.signal}"
    textColor:       "{colors.on-signal}"
    rounded:         "{rounded.sm}"
    padding:         "0 1.5rem"
  btn-signal-hover:
    backgroundColor: "{colors.signal-hi}"
    textColor:       "{colors.on-signal}"
  btn-line:
    borderColor: "{colors.rule-2}"
    textColor:   "{colors.bone}"
    rounded:     "{rounded.sm}"
    padding:     "0 1.5rem"
  plate:
    backgroundColor: "{colors.basalt}"
    borderColor:     "{colors.rule-2}"
    rounded:         "{rounded.default}"
  lanes:
    borderColor: "{colors.rule-2}"
  tool:
    backgroundColor: "{colors.basalt}"
    borderColor:     "{colors.rule}"
    rounded:         "{rounded.default}"
    padding:         "1.5rem"
  pf-role-lead:
    borderColor: "{colors.signal-line}"
    textColor:   "{colors.signal}"
    rounded:     "{rounded.xs}"
  pf-role-dev:
    borderColor: "{colors.discord-line}"
    textColor:   "{colors.discord-ink}"
    rounded:     "{rounded.xs}"
---

# Design System: The Highway Men (v3)

Implemented entirely in `public/css/thm.css`; behaviour in `public/js/thm.js`.

> The machine-readable sidecar `.impeccable/design.json` still describes v2
> (glass / Bricolage / fire-lava-coal) and needs regenerating.

## The idea

THM's one lasting contribution to 6b6t is a **standard**: main Nether highways
are five blocks wide. So the site is built out of the vernacular of
infrastructure documentation rather than of gaming clan pages: survey plates,
mileposts, dimension lines, plan views, block grids, coordinate labels.

Four rules the system holds to:

1. **Signal orange is ink, never light.** It colours text, borders and small
   fills. No glows, no coloured drop-shadows, no orange gradients.
2. **The highway is drawn, not rendered.** THM paves five wide in obsidian with
   nothing marked in the middle, and the page says so in hairlines and copy. An
   earlier version filled the motif with an obsidian block texture; it read as
   heavy and cheap next to the type, so it was cut. Line work only.
3. **Surfaces are materials, not glass.** Two steps (`--void`, `--basalt`) plus
   hairline rules. No `backdrop-filter` anywhere.
4. **Round the chrome.** Panels, buttons and badges carry real radius; only the
   hairline drawings have hard corners.

Dark is the default; light mode is a supported toggle, not the primary.

## The recurring device: the hairline

There is no illustrated highway. Everything that would have been a graphic is a
measured line instead:

| Where | Class | Role |
|---|---|---|
| Between sections | `hr.seam` | One full-bleed hairline |
| Beside the wordmark | `.road` | A 1px line out of "MEN" to `3.75M · border reached`; draws itself on load |
| Standard section | `.plan` / `.lanes` / `.lane` | Ruled cross-section: six hairlines, five bands, dimension line down the left |
| Log | `.log-rail` | A 1px rule that fills `--signal` as you read, with a leader line off each date |

## Colour

Every text token clears WCAG AA (≥4.5:1) against its own theme's ground.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--void` | `#0d0b0c` | `#f3efe8` | Page ground |
| `--basalt` | `#151214` | `#e9e3d9` | Raised surface: plate, lanes, tool strip, join band |
| `--bone` | `#efe9e3` | `#1a1614` | Primary text |
| `--ash` | `#a29a95` | `#57504b` | Body copy (7.1 / 6.9) |
| `--ash-dim` | `#837b77` | `#6f6862` | Mono labels, meta, captions (4.7 / 4.8) |
| `--rule` | white 9% | ink 13% | Hairlines, cell borders |
| `--rule-2` | white 19% | ink 26% | Outer frames, button borders |
| `--signal` | `#ee6b1f` | `#b34305` | Kickers, log dates, links, primary button (6.3 / 4.9) |
| `--signal-hi` | `#ff7d33` | `#932f00` | Primary button hover only |
| `--signal-line` | signal 45% | signal 45% | Leader badge border |
| `--discord-ink` | `#8b95f6` | `#3b45c9` | Discord as text/border |

`--discord` / `--discord-hi` are kept for a Discord-branded fill but nothing
uses them: Discord blurple was the loudest thing on a warm page, so the CTAs
are orange and blurple survives as nav ink only.

## Type

Three families, three jobs.

| Role | Family | Setting |
|---|---|---|
| Display (`.display`) | **Archivo** 800 @ `wdth 120%` | `clamp(2.75rem, 9vw, 6.75rem)`, `lh 0.85`, uppercase |
| Section head (`.h2`) | Archivo 700 @ `112%` | `clamp(1.9rem, 4.2vw, 3.1rem)`, `lh 0.96`, sentence case |
| Sub-head (`.h3`) | Archivo 700 @ `106%` | `1.05rem` |
| Numerals (`.num`) | Archivo 700 @ `100%` | `tabular-nums` |
| Body | **Newsreader** 400/500 + italic | `1.0625rem`, `lh 1.7` |
| Labels, data, nav (`.mono` / `.mono-sm`) | **IBM Plex Mono** 500 | `0.6875` / `0.625rem`, `ls 0.15–0.18em`, uppercase |

Archivo is held at **expanded** widths — wide and stamped, like road signage,
not the usual condensed display face. The serif body against it is deliberate:
an editorial, on-the-record voice for a page that doubles as the clan's history.

Google Fonts request (identical in `index.html` and every profile page):

```
Archivo:wdth,wght@100..125,400..800
IBM+Plex+Mono:wght@400;500
Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500
```

## Space, radius, motion

- **Scale** (4px base): `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 24 · `--s6` 32
  · `--s7` 48 · `--s8` 64 · `--s9` 96.
- **Container**: `.wrap` 1180px, everywhere. Nothing breaks out of it — the map
  used to sit at 1520px and read as a foreign object dropped on the page.
- **Section rhythm**: `.band { padding-block: clamp(3.5rem, 6.5vw, 5.5rem) }`;
  `.band-tight` for the Kitbot strip.
- **Radius**: `--r-xs` 5px (badges, chips), `--r-sm` 9px (buttons, controls),
  `--r` 14px (panels, plates, frames, map).
- **Ease**: `--ease: cubic-bezier(0.22, 0.9, 0.24, 1)`.

Motion is rationed to four things:

1. **One load sequence** in the hero — eyebrow, wordmark, then thesis and plate,
   ending with `.road` drawing itself out toward the border (`@keyframes draw`).
   Nothing else on the page animates on load.
2. **`.rv` reveal** on scroll: 14px rise + fade, `.d1`–`.d3` stagger.
3. **The log rail draws itself** against scroll position (`--fill`, set by JS
   from the reading line at 60% viewport height), and each entry's date has a
   leader line to the rail that turns `--signal` once the entry is seen.
4. **Hover micro-interactions**: nav underline grows from the left, `.arw` nudges
   4px, roster names shift 4px into signal.

`prefers-reduced-motion` collapses all of it: the rail is fully drawn and the
stat counters print their final value.

## Components

- **`.btn`** — `.btn-signal` (solid orange, dark label) and `.btn-line`
  (hairline border, orange on hover). No lift, no shadow. Optional `.arw`.
- **`.head`** — kicker left, a **fact** right (`Founded 19 Oct 2024`,
  `4 leads · 36 listed`, `Adopted March 2025`), hairline under. The right slot
  always carries real information, never decoration.
- **`.plate`** — a labelled panel: a `.plate-head` row of two mono facts over the
  content. Used for the hero telemetry (a 2×2 grid of live numbers that counts up
  once on load), the map figure, and the skin viewer on profiles.
- **`.map`** — the highway map inside a `.plate`, with the caption as a footer
  row. Its saturation is pulled to 82% so the imported magenta and cyan sit in
  the page's palette instead of fighting it.
- **`.facts`** — `<dl>` of clan facts, mono both sides, hairline rows.
- **`.log`** — date column, rail, body. Mobile collapses the date above the title
  and pulls the rail to the left edge by cancelling `--date-w`.
- **`.why`** — the six reasons for the standard: `columns: 2`, ruled rows,
  Archivo caps term over serif description. No cards.
- **`.roster`** — `.leads` (4-up, hairline separated, filled square marker) then
  `.roster` (`columns: 4`, mono, hairline rows).
- **`.reg`** — the alliance register: name and the date it was signed, two ruled
  columns, closed entries dropped to `--ash` with the date in `--signal`.
- **`.archive`** — a closed record: heading in `--ash` rather than `--bone`, a
  `DISBANDED` plate, a tally row. Past tense, visually.
- **`.tool`** — a tool strip, capped at 780px so a stack of them reads as a list
  rather than as full-width cards.

## Page order

1. Hero — eyebrow, wordmark + road, thesis + CTAs, survey plate, `hr.seam`
2. Clan — mark + facts column | serif prose
3. Log — six milepost entries against the rail
4. Network — the map inside a `.plate` (header, image, caption as one figure)
5. Standard — prose, ruled cross-section, six reasons in two columns
6. Tooling — Kitbot and the Meteor add-on, two capped strips
7. Alliances — the dated register, then The Watchmen as an archived record
8. Roster — leads, then the named list
9. Join — one line and one button
10. Footer — banner (edge-masked), leads, sign-off

## Copy

Plain verbs, concrete nouns, no hype. "Roads, not bases." "Crews run daily.
Bring a pickaxe." Numbers are real or absent; the map's own figures are cited
rather than restated. Captions teach the reader how to read the thing above
them. No em-dashes stacked in body copy.

## Files

| Path | Contents |
|---|---|
| `public/css/thm.css` | The whole system: tokens, roles, components, profile pages |
| `public/index.html` | The page |
| `public/js/thm.js` | Theme, menu, reveal, rail fill, counters, timestamps |
| `public/players/<Name>/index.html` | Profiles; model new ones on `Leon_170709` |

## Don't

- Don't add `backdrop-filter`, glass fills, or coloured shadows. The v2 glass
  system is gone on purpose.
- Don't paint a centreline, lane marking or median on the highway. There isn't
  one; THM paves five wide in plain obsidian.
- Don't reintroduce a rendered or textured highway graphic. It was tried and cut.
- Don't square off the chrome; the radii are deliberate.
- Don't put a decorative section number, orb, or floating icon on the page;
  structural devices must encode something true.
- Don't fill a section with repeated identical cards — every section here has
  its own layout, and that is the point.
- Don't let a `.head` meta slot hold filler text.
