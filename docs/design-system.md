# Quiet Tab design system

This document is the public source of truth for UI tokens, components, and layout
rules on the new tab page. Phase 1 splits overlay styles into
`src/design-tokens.css`, `src/controls.css`, and `src/surfaces.css`; grid and
tile presentation rules live in `src/newtab.css` and use Phase 2 tokens from
`design-tokens.css`.

**Status:** Phase 1 (controls + surfaces v1) **implemented** (merge `ea00c29`).
**Phase 2** (grid / tiles / page chrome) — **implemented** (PR #2).
See [Phase 2](#phase-2-grid--tiles--page-chrome) and
`docs/plans/2026-10-03-design-system-phase-2.md`.

## Principles

1. **One control height in overlays** — Every interactive control inside desktop
   dialogs, the city modal, add menu, and suggestion lists uses the same outer
   height (`--control-height`). Nested controls (e.g. clear button in a field) may
   be smaller but are centered inside that height.
2. **Token-first** — Components reference `var(--…)` tokens; avoid new magic
   numbers in component CSS.
3. **Two focus modes** — Tiles on the grid use a solid `--focus-ring` outline;
   overlay controls use a soft fill plus `--focus-overlay-ring` box-shadow (see
   Focus).
4. **No build step** — Stylesheets are linked from `newtab.html` in dependency
   order; no preprocessor.

## Stylesheet map (Phase 1)

| File | Contents |
|------|----------|
| `design-tokens.css` | Color, type, spacing, radius, shadow, focus tokens; light/dark |
| `controls.css` | Buttons, inputs, segmented, icon-button, text-button, color input, list/menu rows |
| `surfaces.css` | Modal shells, backdrops, popovers (add menu, suggestions), focus rings scoped to `.desktop-dialog` / `.city-modal` |
| `newtab.css` | Desktop grid, tiles, weather presentation, tooltip, page chrome |

Load order in `newtab.html`: tokens → controls → surfaces → newtab.

## Color tokens

Semantic names are canonical. During migration, legacy aliases (`--bg`, `--panel`,
`--text`, `--muted`, `--border`, `--primary`, `--primary-hover`,
`--primary-contrast`, `--danger`, `--soft-fill`, `--soft-fill-strong`,
`--soft-ring`, `--focus`) remain defined in `design-tokens.css` and map to the
new names where applicable.

| Token | Role |
|-------|------|
| `--color-bg` | Page background |
| `--color-surface` | Panels, modals, inputs |
| `--color-text` | Primary text |
| `--color-text-muted` | Labels, secondary copy |
| `--color-border` | Control and surface borders |
| `--color-primary` | Primary fill, active segmented segment |
| `--color-primary-hover` | Primary hover |
| `--color-on-primary` | Text on primary |
| `--color-danger` | Destructive actions, errors |
| `--color-fill-soft` | Hover list rows, focused input background |
| `--color-fill-soft-strong` | Focused button background |
| `--focus-ring` | Solid focus outline on grid tiles (≥ 3:1, WCAG 1.4.11) |
| `--focus-overlay-ring` | 2px focus ring in overlays (`--soft-ring` alias) |
| `--focus` | 3px focus outline on buttons, inputs and segmented options outside overlays (legacy name, no semantic token yet) |

Dark theme overrides mirror the existing `:root` / `prefers-color-scheme: dark`
values.

## Typography

| Token | Value | Use |
|-------|-------|-----|
| `--font-family` | system UI stack | `body` (declared in Phase 1; `newtab.css` adopts it in Phase 2) |
| `--font-size-body` | inherit (~16px UA) | Body text size on the new tab page |
| `--line-height-page` | **1.45** | `body` in `newtab.css` (Phase 2); not the same as `--line-height-body` |
| `--font-size-sm` | **13px** | Form row labels, segmented labels, tooltip |
| `--font-size-md` | **14px** | Status, dialog body, page status line |
| `--font-size-title` | **18px** | Modal titles |
| `--font-weight-control` | **600** | Buttons, checked segmented, text-button |
| `--line-height-control` | **1.2** | Buttons |
| `--line-height-body` | **1.4** | Status / error text (declared in Phase 1; `newtab.css` adopts it in Phase 2) |

## Layout and spacing

| Token | Value | Use |
|-------|-------|-----|
| `--control-height` | **40px** | Outer border-box height for overlay controls |
| `--control-border-width` | **1px** | Standard control border |
| `--control-padding-x` | **12px** | Text inputs |
| `--control-padding-x-button` | **14px** | Buttons |
| `--control-gap-icon` | **6px** | Icon + label in `.button` |
| `--list-row-padding-y` | **8px** | Vertical padding of suggestion rows (keeps wrapped names off the row edges) |
| `--control-disabled-opacity` | **0.62** | `:disabled` on buttons (including primary) |
| `--form-label-width` | **100px** | Left column in form rows |
| `--form-row-gap` | **12px** | Gap between label and control |
| `--form-row-padding-y` | **12px** | Vertical padding per form row |
| `--form-footer-gap` | **8px** | Gap between footer buttons |
| `--form-footer-padding-y` | **14px** | Footer block padding |
| `--title-margin-bottom` | **12px** | Space below modal titles (all modals) |
| `--surface-modal-padding` | **20px** | Inner padding of dialog cards |
| `--surface-modal-max-width` | **420px** | `min()` with viewport margin |
| `--viewport-margin` | **16px** | Modal viewport inset, scroll margins |
| `--surface-popover-padding` | **6px** | Inner padding of menu / suggestion panel |
| `--surface-popover-gap` | **6px** | Gap between field and floating suggestion list |
| `--space-grid-8` | **8px** | Tile gaps, tooltip vertical padding, remove-badge offset (Phase 2) |
| `--space-grid-10` | **10px** | Tile / tooltip horizontal or block padding where shipped as 10px (Phase 2) |
| `--space-grid-12` | **12px** | Tile inline padding (Phase 2) |

**Runtime grid metrics** (`--cell-size`, `--grid-gap`, `--grid-pad`,
`--grid-columns`, `--rows`, and `:root[data-cell]`) are set on `:root` by
`newtab.js` from `gridMetrics()` — **not** declared in `design-tokens.css`
(Phase 2 documents them here only; no change to the metrics algorithm or JS
unless a future phase explicitly requires it).

## Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-control` | **8px** | Inputs, buttons, segmented, icon-button, text-button, list/menu rows, color input, tooltip |
| `--radius-popover` | **12px** | Add menu, geocode suggestion panel |
| `--radius-modal` | **16px** | Desktop dialog, city modal card |
| `--radius-tile` | **13px** | Favorite, chrome, weather, city-hint tiles (Phase 2) |
| `--radius-drop-highlight` | **14px** | Edit-mode drop target highlight (Phase 2) |
| `--radius-status-chip` | **10px** | Fixed page status line `.desktop-status` (Phase 2) |

Tooltip chrome reuses `--radius-control` (**8px**), not a separate radius token.

## Elevation and backdrop

| Token | Value | Use |
|-------|-------|-----|
| `--surface-backdrop` | `rgb(0 0 0 / 50%)` | Modal backdrops |
| `--shadow-modal` | `0 24px 70px rgb(0 0 0 / 32%)` | Dialog cards |
| `--shadow-popover` | `0 12px 32px rgb(0 0 0 / 18%)` | Menus, suggestions, page status (v2) |
| `--shadow-tooltip` | `0 18px 50px rgb(0 0 0 / 10%)` | Hover tooltip (Phase 2: `.tooltip` in `newtab.css`) |
| `--shadow-status` | `var(--shadow-popover)` | Page status chip (Phase 2; same elevation as popovers) |

Docked suggestion lists use no shadow (in-flow scroll).

## Focus

### Grid / tiles

- Selector family: `.favorite-tile`, `.chrome-tile`, `.weather-tile`,
  `.city-hint-tile`, `.tile-remove`, edit-mode tiles.
- Documented metric names (not CSS custom properties in Phase 2):
  `--focus-tile-width` **3px** solid `var(--focus-ring)`;
  `--focus-tile-offset` **2px** (weather/city-hint pair may use **2px** outline).

### Overlays (desktop dialog, city modal)

- Resting controls: no visible outline (forced-colors uses transparent outline
  placeholder on the shared `:focus-visible` base).
- Focused control: background `--color-fill-soft` or `--color-fill-soft-strong`
  (buttons), plus `box-shadow: 0 0 0 2px var(--focus-overlay-ring)`.
- Primary button focused: keep primary fill; same ring.
- Segmented: ring on the **whole** `.segmented` group when any radio has
  `:focus-visible`; inner option outline suppressed in overlays.
- Color input focused: full opacity when focused (Auto mode dimmed otherwise).

Tests in `test/focusTokens.test.js` guard contrast and overlay replacement rules.

## Components

All heights are **border-box** (`box-sizing: border-box` globally).

### `.button`

- `min-height: var(--control-height)` (**40px**)
- Padding `0 var(--control-padding-x-button)`; gap `var(--control-gap-icon)`
- Border `var(--control-border-width)` solid `var(--color-border)`;
  `border-radius: var(--radius-control)` (**8px**)
- Modifiers: `.button--primary`, `.button--danger`
- Disabled: `opacity: var(--control-disabled-opacity)` (**0.62**), cursor wait when busy

### `.favorite-input`

- Text fields in link forms and city search
- `min-height: var(--control-height)` (**40px**) in all contexts (no taller city field)
- Padding `0 var(--control-padding-x)`; radius **8px**

### `.icon-button`

- Clear control in city field: **36×36px**, `border-radius: 8px`
- Position inside 40px field: **2px** inset from top and right (centered vertically)

### `.segmented` / `.segmented__option`

- Radiogroup pattern (Icon, Color, Size) — not a toggle switch
- Container: 1px border, radius **8px**; **outer height 40px**
- Option: `height: calc(var(--control-height) - 2 * var(--control-border-width))` → **38px**
- Option padding `0 8px` (narrow dialog: `0 6px`)
- Font **13px**; checked segment: primary fill, weight **600**

### `.favorite-color-input`

- **40×48px**, padding **2px**, radius **8px**
- Dimmed when Color = Auto; pointer-events restored for Manual

### `.text-button`

- City row: Change city / Set a city
- `min-height: var(--control-height)` (**40px**); padding `0 4px`; underline; radius **8px**

### `.weather-form__suggestion` / `.add-menu__item`

- `min-height: var(--control-height)` (**40px**)
- Suggestion rows: padding **`8px 12px`** (`--list-row-padding-y`); a one-line row
  stays at the **40px** `min-height`, a long name that wraps keeps 8px above and below
- Add menu rows: padding **`0 12px`** (single-line labels)
- Content centered vertically (`display: flex; align-items: center`)
- Radius **8px**; hover `--color-fill-soft`

### Form chrome (classes unchanged)

- `.favorite-form__row` — label **100px**, `--font-size-sm`, muted color
- `.desktop-dialog .favorite-form` — no outer border (legacy `.favorite-form` box
  reset inside dialogs)
- `.desktop-dialog__city` — row `min-height: 40px`, space-between, text-button + city name

## Surfaces

| Surface | Key rules |
|---------|-----------|
| `.desktop-backdrop` | Fixed full screen, z-index 100, `--surface-backdrop` |
| `.desktop-dialog` | Centered card, z-index 101, modal padding/radius/shadow, max-height `100vh - 32px`, scroll |
| `.city-modal` | Flex center, padding **16px**, z-index 100 (102 when `.city-modal--stacked`) |
| `.city-modal__dialog` | Same width/padding/radius/shadow as desktop dialog |
| `.add-menu` | Popover; `--radius-popover`, `--surface-popover-padding`, `--shadow-popover` |
| `.weather-form__suggestions` | Popover list; docked variant in-flow, no shadow |

Modal titles: `--font-size-title`, `margin: 0 0 var(--title-margin-bottom)` (**12px**).

## Examples by screen

| Screen | Controls (all **40px** outer, **8px** radius unless noted) |
|--------|--------------------------------------------------------------|
| Add link | Link, Name inputs; Icon / Color segmented; Cancel, Add |
| Edit link | Above + Size segmented; Delete, Cancel, Save; color swatch **40px** tall |
| Delete link? | Cancel, Delete |
| Edit weather | City row **40px**; Size segmented; Cancel, Save |
| Change city / Set a city | Search input **40px**; clear **36px** inset **2px**; suggestion rows **40px**; Cancel or Not now, Save |
| Add menu | Each menu item **40px** |

**Metric coverage:** Every row above uses the same overlay control classes as
AS-DS-1 (40px outer height, 8px control radius) except city-modal-specific
rules in AS-DS-2 (clear inset, suggestions). No separate per-screen AS is required
when those classes apply.

## Migration phases

**Phase 1 (this spec):** Add token and component stylesheets; refactor existing
selectors to use tokens; unify heights and radii per tables above; update
`newtab.html` links; extend tests (`focusTokens`, source assertions on token
usage).

**Phase 2:** Tokenize grid/tile/status/tooltip chrome in `newtab.css` (radii,
shadows, typography adoption, spacing for the status chip) without changing grid
engine behavior, drag/repack, or tile focus rules. Implementation plan:
`docs/plans/2026-10-03-design-system-phase-2.md`.

## Phase 2 (grid / tiles / page chrome)

### Goal

Replace magic numbers in `src/newtab.css` for page chrome and grid presentation
with `var(--…)` from `src/design-tokens.css`, matching the values already
shipped. **CSS/token refactor only** — no changes to `desktopLayout.js`,
`widgetsService.js`, grid algorithms, weather tone colors, copy, or overlay
styles in `controls.css` / `surfaces.css`.

### Assumptions

- Tile focus outlines stay **3px** solid `var(--focus-ring)` with **2px**
  offset on grid tiles (and **2px** outline on weather/city-hint where already
  specified). Phase 2 does **not** replace those literals with
  `--focus-tile-width` / `--focus-tile-offset` custom properties (documented
  names only) so `test/focusTokens.test.js` selectors stay stable.
- `body` uses **`--line-height-page` (1.45)** for page rhythm; **`--line-height-body`
  (1.4)** applies to `.status` and `.desktop-status` only (do not set `body` to
  `var(--line-height-body)`). `.status` is unchanged; `.desktop-status` previously
  inherited **1.45** from `body` and now matches `.status` at **1.4** — the one
  intentional visual change in Phase 2.
- Tooltip `line-height` stays **1.35** (accepted exception; no token).
- No new stylesheet file; grid/tile rules remain in `newtab.css`.

### Grid / tile tokens (Phase 2)

| Token | Value | Use in `newtab.css` |
|-------|-------|---------------------|
| `--radius-tile` | **13px** | `.favorite-tile`, `.chrome-tile`, `.weather-tile`, `.city-hint-tile` |
| `--radius-drop-highlight` | **14px** | `.drop-highlight` |
| `--radius-status-chip` | **10px** | `.desktop-status` |
| `--radius-control` | **8px** (existing) | `.tooltip` `border-radius` |
| `--shadow-popover` | (existing) | alias target for status via `--shadow-status` |
| `--shadow-status` | `var(--shadow-popover)` | `.desktop-status` `box-shadow` |
| `--shadow-tooltip` | (existing) | `.tooltip` `box-shadow` |
| `--status-chip-padding-y` | **10px** | `.desktop-status` vertical padding |
| `--status-chip-padding-x` | **14px** | `.desktop-status` horizontal padding |
| `--status-chip-offset-bottom` | **16px** | `.desktop-status` `bottom` inset |
| `--tile-remove-size` | **24px** | `.desktop-grid > .tile-remove` width/height |
| `--tile-remove-offset` | **8px** (same value as `--space-grid-8`) | Negative inset from tile corner for − badge |
| `--space-grid-8` | **8px** | `.favorite-tile` / weather row `gap`; `.tooltip` padding-block; remove offset |
| `--space-grid-10` | **10px** | 2×2 favorite padding-block; weather / city line horizontal padding; `.tooltip` padding-inline |
| `--space-grid-12` | **12px** | 2-wide favorite horizontal padding; 2×2 favorite padding-inline |
| `--font-size-weather-primary-cell-64` | **16px** | `:root[data-cell="64"]` weather primary |
| `--font-size-weather-secondary-cell-64` | **10px** | `:root[data-cell="64"]` weather secondary |
| `--font-size-weather-primary-cell-56` | **14px** | `:root[data-cell="56"]` weather primary |
| `--font-size-weather-secondary-cell-56` | **9px** | `:root[data-cell="56"]` weather secondary |

Typography adoption:

| Location | Phase 2 rule |
|----------|----------------|
| `body` | `font-family: var(--font-family)`; `line-height: var(--line-height-page)` |
| `.status`, `.desktop-status` | `font-size: var(--font-size-md)`; `line-height: var(--line-height-body)` where applicable |
| `.tooltip` | `font-size: var(--font-size-sm)` |

### Non-goals (Phase 2)

- Changing weather tone colors, favorite accent gradients, or tile content layout
  beyond replacing **8 / 10 / 12 px** spacing with `--space-grid-*` (icon sizes,
  **6px** 2×2 tile gap, 2-high weather **28px** primary, etc.).
- Changing `gridMetrics()`, column logic, `--cell-size` / `--grid-gap` values, or
  `newtab.js` custom-property assignment (document runtime vars only).
- New UI flows, dialog/copy changes, or overlay control metrics (Phase 1 scope).
- Altering tile focus selectors, outline widths/offsets, or
  `test/focusTokens.test.js` expectations beyond what is required for unrelated
  CSS moves.
- Splitting `newtab.css` into another file or adding a build step.
- Tokenizing every in-tile literal (e.g. **7px** favorite letter radius, **50%**
  remove badge) — see Accepted exceptions.

### Accepted exceptions (Phase 2)

| Element | Value | Reason |
|---------|-------|--------|
| `.favorite-tile[data-w="2"][data-h="2"]` `gap` | **6px** | Tighter stack inside 2×2; not one of the three grid spacing tokens. |
| `.tooltip` `line-height` | **1.35** | Tighter single-line tooltip; no dedicated token. |
| `.weather-tile[data-h="2"]` primary/secondary | **28px** / **13px** | 2-high tile typography; cell-scaled rules stay separate. |
| `.favorite-letter` `border-radius` | **7px** | Inner glyph chrome, not tile outer radius. |
| `.tile-remove` `border-radius` | **50%** | Circular badge, not `--radius-tile`. |
| Tile focus `outline` / `outline-offset` | **3px** / **2px** (weather pair **2px**) | Locked by `focusTokens.test.js`; not swapped to CSS variables in Phase 2. |
| Runtime grid custom properties | set in JS | Documented only; not duplicated in `design-tokens.css`. |

### Acceptance scenarios (Phase 2)

**Spec gate vs implementation:** Metrics below are the contract. Executable
`Verified by` artifacts are created in
`docs/plans/2026-10-03-design-system-phase-2.md`. Before those tasks, missing
E2E or extended unit assertions are expected.

### AS-DS-11 Tile outer corner radius
- Given: A grid with at least one favorite, chrome (Settings), weather metric,
  and a city-hint tile at **500×800** (seed: no city chosen / harness profile that
  shows `.city-hint-tile`; if the profile has no hint tile, skip only the
  `.city-hint-tile` assertion — other three tile types remain required).
- When: Computed `border-radius` is read on `.favorite-tile`, `.chrome-tile`,
  `.weather-tile`, and `.city-hint-tile` when present.
- Then: Each is **13px** ± **0.5px**.
- Verified by: E2E `.private/e2e/scenarios/dg-42-grid-chrome-metrics.mjs` (plan Task 2)

### AS-DS-12 Drop highlight corner radius
- Given: Edit mode on; user drags a tile so `.drop-highlight` is visible.
- When: Computed `border-radius` on `.drop-highlight`.
- Then: **14px** ± **0.5px**.
- Verified by: E2E `dg-42-grid-chrome-metrics.mjs` (plan Task 2)

### AS-DS-13 Page status chip chrome
- Given: Edit mode on; Chrome Sync `set` is faulted via harness `failStorageInit`
  (sync, `quietTabWidgetsMeta`) and a drag attempt fails to persist — same setup
  as the first block of `dg-37-write-failure.mjs`; `#desktop-status` is visible
  with the sync error text.
- When: Computed styles on `.desktop-status`.
- Then: `border-radius` **10px** ± **0.5px**; `font-size` **14px** ± **0.5px**;
  vertical padding **10px** ± **0.5px** and horizontal padding **14px** ± **0.5px**
  via `var(--status-chip-padding-y)` / `var(--status-chip-padding-x)`; `bottom`
  inset **16px** ± **0.5px** via `var(--status-chip-offset-bottom)`;
  `box-shadow` matches the computed value of `var(--shadow-popover)` on a
  reference element (or token string equality in unit test).
- Verified by: E2E `dg-42-grid-chrome-metrics.mjs` (`failStorageInit` + drag, then
  metrics; plan Task 2)

### AS-DS-14 Tooltip radius and elevation
- Given: Normal mode; weather tooltip visible after hover on a metric tile.
- When: Computed styles on `#tooltip`.
- Then: `border-radius` **8px** ± **0.5px**; `box-shadow` uses the
  `--shadow-tooltip` token value (same as pre-Phase-2 literal).
- Verified by: E2E `dg-42-grid-chrome-metrics.mjs` (plan Task 2)

### AS-DS-15 Body and in-grid status typography tokens
- Given: New tab loaded; a dialog with `.status` visible (e.g. validation error)
  and `.desktop-status` measurable when shown (AS-DS-13 setup or any visible
  status chip).
- When: `getComputedStyle` on `document.body`, `.status`, and `.desktop-status`.
- Then: Body and `.status` use the token names in `newtab.css` source (`--font-family`,
  `--line-height-page`, `--font-size-md`, `--line-height-body`). When
  `#desktop-status` is visible, computed `font-size` is **14px** ± **0.5px**
  (E2E); computed body line-height and dialog `.status` metrics follow the token
  values above (source-verified; optional future computed probes).
- Verified by: `test/designSystem.test.js` source assertions on `newtab.css`
  (Tasks 1–4); E2E `dg-42-grid-chrome-metrics.mjs` for computed
  `#desktop-status` `font-size` when the sync-failure chip is shown.

### AS-DS-16 Grid v2 tokens declared
- Given: Phase 2 token task complete.
- When: `design-tokens.css` is read.
- Then: Declares `--radius-tile`, `--radius-drop-highlight`,
  `--radius-status-chip`, `--shadow-status`, `--line-height-page`,
  `--status-chip-padding-y`, `--status-chip-padding-x`,
  `--status-chip-offset-bottom`, `--tile-remove-size`, `--tile-remove-offset`,
  `--space-grid-8`, `--space-grid-10`, `--space-grid-12`, and the four
  `--font-size-weather-*-cell-*` tokens with values from the table above.
- Verified by: `test/designSystem.test.js` (plan Task 1)

### AS-DS-17 No banned grid chrome literals in `newtab.css`
- Given: Phase 2 migration complete.
- When: `newtab.css` is scanned by unit tests.
- Then: Tokenized selectors use `var(--radius-tile)`, `var(--radius-drop-highlight)`,
  `var(--radius-status-chip)`, `var(--shadow-tooltip)`, `var(--shadow-status)` or
  `var(--shadow-popover)` as specified; tile/tooltip spacing uses
  `var(--space-grid-8|10|12)` where the shipped value was **8**, **10**, or
  **12 px**; `.desktop-status` uses `var(--status-chip-padding-y)`,
  `var(--status-chip-padding-x)`, and `var(--status-chip-offset-bottom)` (no
  literal `padding: 10px 14px` or `bottom: 16px` on that rule); banned patterns
  such as `border-radius: 13px` on tile classes and `border-radius: 14px` on
  `.drop-highlight` are absent.
- Verified by: `test/designSystem.test.js` (plan Task 3)

### AS-DS-18 Tile focus rules unchanged
- Given: Phase 2 CSS edits in `newtab.css` only.
- When: `npm test` runs `focusTokens.test.js` and overlay focus tests.
- Then: Every grid tile type still uses solid `var(--focus-ring)` outlines with
  the same widths/offsets as before Phase 2; overlay focus in `controls.css` /
  `surfaces.css` untouched.
- Verified by: `test/focusTokens.test.js` (plan Task 3); E2E `dg-40-dialog-focus.mjs` (regression, plan Task 6)

### AS-DS-19 Weather cell-scaled type unchanged
- Given: Grid at **500×800** (`data-cell="64"`) and **320×600** (`data-cell="56"`).
- When: Computed font sizes on `.weather-tile__primary` / `__secondary` for a
  1×1 metric tile.
- Then: **64** cell: **16px** / **10px**; **56** cell: **14px** / **9px** (unchanged).
- Verified by: `test/newtabSource.test.js` (existing `data-cell` rules); E2E `dg-10-viewport-320-600.mjs` for column/cell metrics (regression, plan Task 6)

### AS-DS-20 Grid interaction and narrow viewport (unchanged behavior)
- Given: Existing desktop-grid E2E matrix.
- When: Jiggle toggle, drag/drop, repack, and **320×600** / **500×800** layouts run after Phase 2.
- Then: Same pass/fail as pre-Phase-2 baseline; no new horizontal scroll or overlap.
- Verified by: E2E `dg-03-jiggle-toggle.mjs`, `dg-05-drag-widget.mjs`, `dg-10-viewport-320-600.mjs` (plan Task 6)
- Amended by AS-FU-03 (`docs/design-system-followup.md`): no highlight is drawn for a block that does not fit or lies beyond the allowed row; invalid-because-occupied keeps the dashed outline.

### AS-DS-21 Tooltip modes (unchanged behavior)
- Given: Weather tiles with forecast data.
- When: Normal hover shows tooltip; edit mode, keyboard focus, and drag hide it.
- Then: Same behavior as pre-Phase-2; tooltip text and placement unchanged.
- Verified by: E2E `dg-38-tooltip-modes.mjs` (plan Task 6)

### AS-DS-22 Phase 1 overlay metrics (unchanged)
- Given: Phase 2 does not modify overlay stylesheets.
- When: `dg-41-control-metrics.mjs` and `dg-39-dialog-narrow.mjs` run.
- Then: Phase 1 control heights and radii still pass.
- Verified by: E2E `dg-41-control-metrics.mjs`, `dg-39-dialog-narrow.mjs` (plan Task 6)

### Review focus (Phase 2)

- **Visual:** Tile **13px** vs drop highlight **14px** — highlight should still read slightly rounder than tiles; status chip **10px** and popover shadow; tooltip shadow vs modal/popover hierarchy; light/dark parity after token swap (checkpoint/final design review visual lens + `design-tokens.css` dark `@media`, not a separate AS metric).
- **Scenarios:** Drag valid/invalid highlight; status line with long error text; tooltip above/below placement at viewport edges (`placeTooltip`); edit-mode jiggle + remove badge offset (**8px**) unchanged.
- **Accessibility:** No regression on tile keyboard focus rings; status `role="alert"` unchanged; tooltip still `pointer-events: none` and hidden in edit/drag.

## Adding new UI

1. Use existing classes from `controls.css` / `surfaces.css` before adding rules.
2. New overlay controls must use `--control-height` and `--radius-control`.
3. New colors or radii need tokens in `design-tokens.css` and a row in this doc.
4. Overlay focus must follow the soft-ring pattern; grid focus uses `--focus-ring`.
5. Run `npm test` and `npm run check`; UI behavior changes need E2E per project
   design-review protocol.

## Non-goals (phase 1)

- Tokenizing grid/tile/status chrome (phase 2).
- Changing grid metrics, weather tone colors, or dialog copy.
- New components or layout patterns beyond CSS file split and metric unification.
- New keyboard flows, validation rules, or error copy — behavior stays as in
  shipped desktop-grid / weather phases; regression covered by existing E2E
  (`dg-40-dialog-focus.mjs`, dialog scenarios in `dg-39-dialog-narrow.mjs`) and
  unit `test/focusTokens.test.js`, not new acceptance scenarios in this doc.
- First-run onboarding and large favorites grids (140+ tiles) — unchanged; no
  new AS in this phase (still covered by prior phase specs and E2E).

## Accepted exceptions

| Element | Size | Reason |
|---------|------|--------|
| `.icon-button` clear in city field | **36×36px** inside **40px** input | Keeps a square hit target without stretching the glyph button to full row height. |
| `.favorite-color-input` | **48px** wide, **40px** tall | Native color input needs a wider swatch than text fields. |
| Disabled buttons | `opacity: 0.62` | Existing affordance; primary does not get a separate muted fill. |
| `.city-modal__title` margin-bottom | was **8px** before Phase 1 | Unified to **12px** (`--title-margin-bottom`) in Phase 1. |

## User-visible copy (regression guard, unchanged in phase 1)

Phase 1 must not change strings. Key labels (English UI):

| Surface | Strings (representative) |
|---------|--------------------------|
| Add / Edit link | Cancel, Add, Save, Delete; row labels Link, Name, Icon, Color, Size |
| Delete confirm | Cancel, Delete; title asks to confirm removal |
| Edit weather | Cancel, Save; Change city / city name row |
| City modal | Cancel, Not now, Save; search placeholder; geocode error status |
| Add menu | Add link, Add weather, Settings (exact labels per `newtab.js`) |

Regression: existing E2E that open these dialogs; no copy assertions added in
this phase beyond visual/layout checks.

## Acceptance scenarios

**Spec gate vs implementation:** Metrics below are the contract. Executable
`Verified by` artifacts are created in
`docs/plans/2026-10-03-design-system-v1.md` (Tasks 1–2, 5). Before those tasks,
missing files in checkout are expected; spec review judges completeness of the
Given/When/Then text, not file presence.

### AS-DS-1 Overlay control height (Add link)
- Given: A fresh grid; Add link dialog open; custom icon row and manual color visible.
- When: The user inspects visible controls (inputs, segmented groups, footer buttons).
- Then: Each control’s border-box height is **40px** ± **0.5px** (segmented outer box included; radio inputs excluded).
- Verified by: E2E `dg-41-control-metrics.mjs` (plan Task 2)

### AS-DS-2 Overlay control height (city modal)
- Given: Change-city modal open with at least one geocode suggestion visible.
- When: The user inspects the city field, clear button, suggestion rows, and action buttons.
- Then: Field, suggestion rows, and action buttons are **40px** ± **0.5px** tall; clear button is **36px** ± **0.5px** and sits **2px** from the top/right of the field.
- Verified by: E2E `dg-41-control-metrics.mjs` (plan Task 2)

### AS-DS-3 Control corner radius
- Given: Add link dialog open; add menu open on desktop (separate checks).
- When: Computed styles are read for `.favorite-input`, `.button`, `.segmented`,
  `.add-menu__item`, city-modal `.favorite-input` / `.weather-form__suggestion`,
  `.add-menu` (popover shell), and `.desktop-dialog` / `.city-modal__dialog`
  (modal cards).
- Then: `border-radius` is **8px** on those controls; `.add-menu` popover shell
  **12px** ± **0.5px**; desktop dialog and city modal cards **16px** ± **0.5px**.
- Verified by: E2E `dg-41-control-metrics.mjs` (plan Task 2)

### AS-DS-4 Modal title spacing
- Given: Desktop dialog or city modal open.
- When: Title margin-bottom is measured.
- Then: Gap below the title is **12px** ± **1px** in both desktop dialog and city modal.
- Verified by: E2E `dg-41-control-metrics.mjs` (plan Task 2)

### AS-DS-5 Stylesheet load order
- Given: New tab HTML loaded after Phase 1 Task 1.
- When: Stylesheets are listed in document order.
- Then: `design-tokens.css`, `controls.css`, `surfaces.css`, `newtab.css` — in that order.
- Verified by: `test/designSystem.test.js` (plan Task 1)

### AS-DS-6 Focus and theme tokens unchanged
- Given: Existing focus token tests and dialog focus E2E.
- When: `npm test` runs and `dg-40-dialog-focus.mjs` runs after Phase 1 CSS split.
- Then: Overlay soft-ring and tile `--focus-ring` contrast rules still pass; no regression in dialog/city focus selectors.
- Verified by: `test/focusTokens.test.js`; E2E `dg-40-dialog-focus.mjs` (plan Task 4)

### AS-DS-7 Narrow dialogs still fit
- Given: Viewport **320×600** and **500×800** (same matrix as desktop-grid narrow
  dialog E2E `dg-39-dialog-narrow.mjs`).
- When: **Add link** (custom icon + manual color visible) at both widths — outer
  `.segmented` height measured. **Edit link**, **Edit weather**, and **delete
  confirm** at the widths in `dg-39-dialog-narrow.mjs` `otherDialogs` — controls
  inside the dialog content box (including `.segmented__option` rows) audited for
  clip/overflow; segmented uses the same `controls.css` rules as Add link.
- Then: No control clips outside the dialog card; dialog has no horizontal overflow;
  on Add link at **320×600** and **500×800**, each outer `.segmented` group is
  **40px** ± **0.5px** tall and each `.segmented__option` inner height is **38px**
  ± **0.5px** (per Components §
  `calc(var(--control-height) - 2 * var(--control-border-width))`); option labels
  stay on one line at **320px** width on Add link. Edit/weather/delete dialogs:
  same fit rules without a separate outer-height assert (shared segmented CSS).
- Verified by: E2E `dg-39-dialog-narrow.mjs` (Add link segmented heights + `auditBox`
  on edit/weather/delete); `test/designSystem.test.js` asserts `.segmented__option`
  calc height in `controls.css` (inner **38px** at default tokens; plan Task 3
  extension optional)

### AS-DS-8 Overlay keyboard and focus (unchanged behavior)
- Given: Add link or desktop dialog with segmented control open.
- When: User tabs through interactive controls and presses Escape to close.
- Then: Tab order stays within the overlay; Escape closes the top dialog; focus
  returns to a sensible grid/chrome control; segmented group shows overlay focus ring
  per Focus § Overlays (no change to grid tile `--focus-ring` rules).
- Verified by: E2E `dg-40-dialog-focus.mjs` (existing)

### AS-DS-9 Dialog errors and status (unchanged behavior)
- Given: Invalid link in Add link, or geocode failure in city modal.
- When: User triggers validation or failed geocode.
- Then: Error/status appears in `.desktop-dialog__error` or city modal status slot;
  text unchanged from pre-Phase-1; layout does not clip the message.
- Verified by: design review only (validation logic and copy are Non-goals)

### AS-DS-10 Token usage in overlay CSS
- Given: Phase 1 `controls.css` and `surfaces.css` populated.
- When: `npm test` runs design-system source checks.
- Then: Overlay control heights use `var(--control-height)` (or documented calc);
  banned legacy heights (`34px` menu rows, `44px` city field, `36px` menu
  min-height) are absent from `controls.css`; modal titles use
  `var(--title-margin-bottom)`.
- Verified by: `test/designSystem.test.js` extensions (plan Task 3)

## Review focus

- **Visual:** Side-by-side before/after screenshots of Add link, Edit weather, and Change city — segmented height alignment with inputs and buttons; **8px** radius consistency; **city modal title margin 8px → 12px** with desktop dialog.
- **Scenarios:** City modal clear inset after field height drops from 44px to 40px; disabled Save on weather edit (opacity only).
- **Accessibility:** Focus rings on segmented groups in dialogs; suggestion list row height as touch/keyboard target **40px**; no focus regression on grid tiles (phase 1 must not change tile focus rules).
