# The Highway Men

A clan site built around real member artwork, readable records and a short
homepage. Use the original cream, charcoal and orange palette; keep both theme choices.
The Nether shader is retired. Use actual clan artwork and the highway survey.

## Palette and type

| Role | Light | Dark |
| --- | --- | --- |
| Ground | `#f3efe8` | `#0d0b0c` |
| Surface | `#fffcf7` | `#151214` |
| Text | `#1a1614` | `#efe9e3` |
| Secondary | `#57504b` | `#a29a95` |
| Accent | `#a23a03` | `#ee6b1f` |

Use locally hosted Archivo with swap. Keep small and muted text at least 4.5:1
against its actual surface. Prefer clear labels over terminal-style metadata.

## Pages

- `/`: clan artwork, a brief introduction, live activity and two route previews.
- `/network/`: highway map, completion dates and the five-wide standard.
- `/players/`: one complete roster ordered by Kitbot’s configured rank hierarchy, with explicit profile availability and retired/former-owner labels.
- `/players/<name>/`: member history, facts, portfolio and a 3D skin.
- `/achievements/`: recorded highway and member milestones. Date historical claims.
- `/about/`: clan history, timeline, member-built tools and alliances.

Use the full viewport width with 48px desktop edge margins, 32px on smaller
desktops and 20px on mobile. Keep readable prose under 70 characters. Preserve existing
profile records and artwork. Skin stages reserve 280×360 pixels. Mobile pages
keep the heading and introduction before detailed records and the skin stage.

## Motion and loading

Keep navigation and footer mounted. Replace only `main#content`, with a 140ms
transition or an immediate swap for reduced motion. No late content reveals.

Load the main hero artwork eagerly; lazy-load below-fold images, skin code and
map metadata. Reserve image dimensions. Offscreen sections use content visibility.

Skins rotate automatically while visible, with a pause control and pointer/arrow
key rotation. Pause GPU work in hidden tabs and offscreen; reduced motion disables
automatic rotation. Dispose renderer resources when navigating away. Preserve
voxel outer layers, slim skins, legacy skins and local texture fallbacks.
