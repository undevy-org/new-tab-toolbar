# Quiet Tab design system

This document is the public source of truth for UI tokens, components, and layout
rules on the new tab page. Implementation lives in `src/design-tokens.css`,
`src/controls.css`, and `src/surfaces.css`; grid and tile styling remains in
`src/newtab.css` until a later migration phase.

**Status:** Adopted 2026-10-03 (controls + surfaces v1). Grid/tile tokens are
planned (v2).

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

## Stylesheet map

| File | Contents |
|------|----------|
| `design-tokens.css` | Color, type, spacing, radius, shadow, focus tokens; light/dark |
| `controls.css` | Buttons, inputs, segmented, icon-button, text-button, color input, list/menu rows |
| `surfaces.css` | Modal shells, backdrops, popovers (add menu, suggestions) |
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
| `--focus-halo` | Legacy inner focus for segmented on grid (`--focus` alias) |

Dark theme overrides mirror the existing `:root` / `prefers-color-scheme: dark`
values.

## Typography

| Token | Value | Use |
|-------|-------|-----|
| `--font-family` | system UI stack | `body` |
| `--font-size-body` | inherit (~16px UA) | Body; line-height **1.45** on `body` |
| `--font-size-sm` | **13px** | Form row labels, segmented labels, tooltip |
| `--font-size-md` | **14px** | Status, dialog body, page status line |
| `--font-size-title` | **18px** | Modal titles |
| `--font-weight-control` | **600** | Buttons, checked segmented, text-button |
| `--line-height-control` | **1.2** | Buttons |
| `--line-height-body` | **1.4** | Status / error text |

## Layout and spacing

| Token | Value | Use |
|-------|-------|-----|
| `--control-height` | **40px** | Outer border-box height for overlay controls |
| `--control-border-width` | **1px** | Standard control border |
| `--control-padding-x` | **12px** | Text inputs |
| `--control-padding-x-button` | **14px** | Buttons |
| `--control-gap-icon` | **6px** | Icon + label in `.button` |
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

Grid metrics (`--cell-size`, `--grid-gap`, `--grid-pad`, `--grid-columns`,
`--rows`) are set on `:root` by `newtab.js` from `gridMetrics()` — not part of
controls v1.

## Radius

| Token | Value | Use |
|-------|-------|-----|
| `--radius-control` | **8px** | Inputs, buttons, segmented, icon-button, text-button, list/menu rows, color input, tooltip |
| `--radius-popover` | **12px** | Add menu, geocode suggestion panel |
| `--radius-modal` | **16px** | Desktop dialog, city modal card |

**v2 (grid):** tile chrome ~**13px**, drop highlight ~**14px**, desktop status
chip ~**10px** — to be tokenized later in `newtab.css`.

## Elevation and backdrop

| Token | Value | Use |
|-------|-------|-----|
| `--surface-backdrop` | `rgb(0 0 0 / 50%)` | Modal backdrops |
| `--shadow-modal` | `0 24px 70px rgb(0 0 0 / 32%)` | Dialog cards |
| `--shadow-popover` | `0 12px 32px rgb(0 0 0 / 18%)` | Menus, suggestions, page status (v2) |
| `--shadow-tooltip` | `0 18px 50px rgb(0 0 0 / 10%)` | Hover tooltip |

Docked suggestion lists use no shadow (in-flow scroll).

## Focus

### Grid / tiles

- Selector family: `.favorite-tile`, `.chrome-tile`, `.weather-tile`,
  `.city-hint-tile`, `.tile-remove`, edit-mode tiles.
- `--focus-tile-width`: **3px** solid `var(--focus-ring)`.
- `--focus-tile-offset`: **2px**.

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
- Padding **`0 12px`** (vertical centering via flex on parent column)
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

## Migration phases

**Phase 1 (this spec):** Add token and component stylesheets; refactor existing
selectors to use tokens; unify heights and radii per tables above; update
`newtab.html` links; extend tests (`focusTokens`, source assertions on token
usage).

**Phase 2:** Move grid/tile/status/tooltip dimensions to tokens in `newtab.css`
without changing grid behavior.

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

## Accepted exceptions

| Element | Size | Reason |
|---------|------|--------|
| `.icon-button` clear in city field | **36×36px** inside **40px** input | Keeps a square hit target without stretching the glyph button to full row height. |
| `.favorite-color-input` | **48px** wide, **40px** tall | Native color input needs a wider swatch than text fields. |
| Disabled buttons | `opacity: 0.62` | Existing affordance; primary does not get a separate muted fill. |

## Acceptance scenarios

### AS-DS-1 Overlay control height (Add link)
- Given: A fresh grid; Add link dialog open; custom icon row and manual color visible.
- When: The user inspects visible controls (inputs, segmented groups, footer buttons).
- Then: Each control’s border-box height is **40px** ± **0.5px** (segmented outer box included; radio inputs excluded).
- Verified by: E2E `dg-41-control-metrics.mjs`

### AS-DS-2 Overlay control height (city modal)
- Given: Change-city modal open with at least one geocode suggestion visible.
- When: The user inspects the city field, clear button, suggestion rows, and action buttons.
- Then: Field, suggestion rows, and action buttons are **40px** ± **0.5px** tall; clear button is **36px** ± **0.5px** and sits **2px** from the top/right of the field.
- Verified by: E2E `dg-41-control-metrics.mjs`

### AS-DS-3 Control corner radius
- Given: Add link dialog open.
- When: Computed styles are read for `.favorite-input`, `.button`, and `.segmented`.
- Then: `border-radius` is **8px** on those controls (popover surfaces may use **12px**; modal shell **16px**).
- Verified by: E2E `dg-41-control-metrics.mjs`

### AS-DS-4 Modal title spacing
- Given: Desktop dialog or city modal open.
- When: Title margin-bottom is measured.
- Then: Gap below the title is **12px** ± **1px** in both desktop dialog and city modal.
- Verified by: E2E `dg-41-control-metrics.mjs`

### AS-DS-5 Stylesheet load order
- Given: New tab HTML loaded.
- When: Stylesheets are listed in document order.
- Then: `design-tokens.css`, `controls.css`, `surfaces.css`, `newtab.css` — in that order.
- Verified by: `test/designSystem.test.js`

### AS-DS-6 Focus and theme tokens unchanged
- Given: Existing focus token tests.
- When: `npm test` runs.
- Then: Overlay soft-ring and tile `--focus-ring` contrast rules still pass; no regression in dialog/city focus selectors.
- Verified by: `test/focusTokens.test.js` (existing)

### AS-DS-7 Narrow dialogs still fit
- Given: Viewport **320×600** and **500×800** (unchanged from AS-10).
- When: Add link and other dialogs are opened with all optional rows visible.
- Then: No control clips outside the dialog; segmented labels remain readable (inherits AS-10).
- Verified by: E2E `dg-39-dialog-narrow.mjs` (update height assertion to 40px where needed)

## Review focus

- **Visual:** Side-by-side before/after screenshots of Add link, Edit weather, and Change city — segmented height alignment with inputs and buttons; **8px** radius consistency.
- **Scenarios:** City modal clear inset after field height drops from 44px to 40px; disabled Save on weather edit (opacity only).
- **Accessibility:** Focus rings on segmented groups in dialogs; suggestion list row height as touch/keyboard target **40px**; no focus regression on grid tiles (phase 1 must not change tile focus rules).
