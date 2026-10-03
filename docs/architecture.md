# Architecture

## Overview

Quiet Tab is a Manifest V3 extension with no service worker. The new tab page
(`src/newtab.js`) owns rendering directly. The page is one full-viewport,
macOS-style desktop grid: links, the four weather tiles and two fixed "chrome"
tiles (Settings and Add) are widgets placed on 2D cells (widgets store and
service); live weather data has its own small service/store pair. The widgets
layout and the chosen weather city persist to `chrome.storage.sync`; the weather
forecast cache and a per-device "city prompt dismissed" flag persist to
`chrome.storage.local`.

## Components

| File | Responsibility |
| --- | --- |
| `src/newtab.js` | Renders the desktop grid (links, weather tiles, the "Set a city" hint tile, the Settings and Add tiles), edit mode (jiggle, − badges, pointer drag with drop highlight and autoscroll), the desktop dialogs (add link, edit link, delete confirm, weather edit), the Add menu, the page status line, the shared tooltip layer and the city modal, and wires them to the services. The only file that touches the DOM. |
| `src/desktopLayout.js` | Pure grid engine: grid metrics and column count for a viewport width, grid validation, the displayed layout (`displayLayout`, a stateless repack of the stored grids for the current column count), placement rules (`canPlace`, `placeResized`, `placeNew`, `cellFromPoint`), default sizes and positions (`placeMissing`) and the v1 → v2 packing (`migrateV1ToV2`). |
| `src/desktopUiState.js` | Pure UI state for edit mode, the Add menu, the open dialog and an active drag, and the Escape layering (`escapeLayer`). |
| `src/widgetsStore.js` | Validates, reads, and writes persisted widgets state (links, weather metrics and chrome tiles, each with a `grid`), sharded across `chrome.storage.sync` keys; reads are lenient about a missing or malformed `grid`. Also holds the legacy favorites → widgets v1 migration, the v1 → v2 migration (`migrateWidgetsToV2`), `ensureWidgetsLayout` (defaults and self-heal), `inspectWidgetsMeta` and the write guard (`assertWritable`) that refuses `newer`, `v1`, and `invalid` metas (only `valid` and `missing` are writable). |
| `src/widgetsService.js` | Add/update/delete for links, `updateWeatherMetric` (size, shown/hidden) and `moveWidget` (drop at a cell, `PlacementError` when the block is taken). Every mutation takes the current column count, runs under the mutation lock, checks `assertWritable` first, applies the action to the displayed layout of fresh storage and persists the displayed grid of every widget. |
| `src/widgetsShared.js` | Shared widget constants (types, weather metric ids, caps, the v1 column bounds and positions still read by the migration, lock name, newer-version message). |
| `src/widgetsLayout.js` | `defaultColumnsForItems` (column count of the legacy favorites → widgets v1 migration) and `placeTooltip` (edge-aware tooltip placement). |
| `src/favoritesShared.js` | Shared favorites constants (icon modes, color sources, tile sizes) and helpers. |
| `src/favoriteIcon.js` | Chooses a favicon, custom image, or letter icon for a tile. |
| `src/favoriteColor.js` | Derives a tile's accent color from its domain or a sampled icon. |
| `src/weatherApi.js` | Calls Open-Meteo's forecast, air-quality, and geocoding endpoints, normalizes responses, and maps UV index and US AQI values to scale labels. |
| `src/weatherStore.js` | Validates, reads, and writes the chosen location and the forecast cache, and reads/writes the per-device city-prompt-dismissed flag. |
| `src/cityPrompt.js` | Pure rule for whether the first-run city modal opens by itself on this page load. |
| `src/weatherService.js` | Serves a fresh cached forecast or fetches and caches a new one; resolves a typed city name to a location. |
| `src/weatherPresentation.js` | Formats readings and picks each tile's color tone. |
| `src/weatherTiles.js` | Pure presentation of one weather tile (label, primary and secondary text, tone, description) for the loading, ready, stale and error states. |
| `src/weatherUiState.js` | Pure state for the city modal (closed, or open in first-run or change mode) and its live suggestion list. |
| `src/icons.js` | Vendored, static SVG icon set. |
| `src/mutationLock.js` | Serializes mutations with the Web Locks API, with a promise-chain fallback. |
| `src/storeUtils.js` | Shared validation and cloning helpers. |

## Widgets Storage

Widgets sync across devices via `chrome.storage.sync`, which caps a single
key at 8KB — too small to hold all 200 possible links in one blob. Storage
is sharded instead (layout version 2):

- `quietTabWidgetsMeta` — `{ version: 2, order: [id, ...], createdAt, updatedAt }`.
  `order` is the stable iteration order and the tie-break of the repack (never
  trust `chrome.storage`'s object-key iteration order); it is not the layout.
  Version 1 also stored `columns` and `position`; both are gone.
- `` `quietTabWidget:<id>` `` — one key per widget, each with a `type` and a
  `grid: { x, y, w, h }` (cell coordinates; `w` and `h` are 1 or 2):
  - `favorite` — a link (URL, label, icon mode, color);
  - `weather-metric` — `{ id, type, enabled, grid }` with one of four fixed ids
    (`weather:temperature`, `weather:precipitation`, `weather:airQuality`,
    `weather:uv`); hidden is `enabled: false` (no cell, its grid is a placeholder).
    A metric stores only its place, size and shown/hidden flag; the values come
    from the weather cache at render time;
  - `chrome` — `{ id, type, role, grid }`, `chrome:settings` and `chrome:add`,
    always 1×1. They can be moved but never deleted or hidden.

Caps: 200 links, 4 metrics, 2 chrome tiles (206 widgets in all).

**Reading a grid.** An item whose other fields are valid but whose `grid` is
missing, malformed or out of range is kept and shown "unplaced": the read drops
the bad grid, never the item or its key. Items with invalid other fields are left
out of the read state as before. Writing an invalid grid is rejected.

**Displayed layout.** The grid shows `displayLayout(stored widgets, C)`, where
`C` is the column count that fits the viewport (2–12, from
`document.documentElement.clientWidth`; the cell size, gap and padding come from
the same width and are set by `newtab.js`, not by CSS media queries). Widgets are
taken in `(y, x, order)` order; each keeps its stored cell if the block fits and
is free, else takes the first free block scanning from its own row; unplaced
widgets follow at the first free block from (0,0). It is a pure function of the
stored grids and `C`: viewport changes never write, and widening the window
restores the stored arrangement.

**Writes.** Every explicit action (drag, add, edit, resize, delete, hide,
restore) is a read-modify-write under the mutation lock: read fresh storage,
compute the displayed layout for the current `C`, apply the action to it (a drop
on a block that is taken in fresh storage is rejected) and persist the displayed
grid of every widget in one batched `set()`, then remove the keys of deleted
widgets. Editing while the window is narrow therefore re-bases the stored layout
to the narrow arrangement. `getState()` tolerates a `meta.order` entry whose item
key hasn't propagated from another device yet by filtering it out; the next write
drops that id from `order` (and removes its key), so an item that arrives after that
write is no longer listed. The v1 → v2 migration, by contrast, keeps such absent ids
in the new `order`, so an item that syncs in late is still shown (unplaced). There
is no `storage.onChanged` listener: a tab that is open while another writes shows
stale data until its own next action or reload.

**Bootstrap.** Before the first read, `newtab.js` runs, under the same mutation
lock as every mutation:

1. `migrateToWidgets()` (needs `chrome.storage.local` too): moves the old
   favorites-only storage (`quietTabFavoritesMeta` + `quietTabFavorite:<id>` in
   sync, or the older single-blob `quietTabFavorites` in local) into the widgets
   v1 layout. A valid widgets meta is authoritative; leftover legacy keys are
   removed. Items are written in chunks of 25 with each chunk's legacy keys
   deleted right after, and the meta last.
2. `migrateWidgetsToV2()` (sync only): packs a valid v1 layout with the v1 column
   count, so the user's arrangement is kept. Links then metrics, enabled ones
   only, each at the first free block (a v1 `wide` tile is 2×1); then
   `chrome:settings` and `chrome:add`. Items are written in chunks of 25 (keeping
   their legacy `tileSize` for one release, so a not-yet-updated device can still
   read them), then the meta `version: 2` last; listed ids whose key has not synced
   yet are kept at the end of its `order`. Until the meta is v2 the run
   repeats; items that already carry a grid keep it, so a resumed run ends with
   the grids of an uninterrupted one.
3. `ensureWidgetsLayout()`: adds any missing weather metric and chrome tile at the
   first free block over 12 columns with the default sizes (temperature 1×1,
   precipitation 2×1, air quality 2×1, UV 1×1, Settings and Add 1×1), item keys
   before the meta; idempotent. On a fresh install this creates temperature
   (0,0), precipitation (1,0), air quality (3,0), UV (5,0), Settings (6,0), Add
   (7,0). It writes nothing for a newer or malformed meta. A write failure is
   non-fatal: the grid renders without the missing tiles and the page status line
   says so until the next open retries.

If step 1 or 2 fails, the grid is locked with an error and a reload advice
instead of an editable empty grid, and the stored data is left untouched for the
next attempt.

A meta whose `version` is newer than this build understands (written by a newer
version on another device) is never touched: the migrations and the ensure step
write and delete nothing, every service mutation fails first with the
newer-version message (`assertWritable`), and the grid is locked read-only with
that message, also after a resize. Every write is likewise refused while the stored
meta is still v1 (an upgrade in progress, possibly on another device) or malformed,
with a message to reload the tab: from those metas a read is empty, so a write would
orphan every stored widget. A build from before the desktop grid reads a
v2 meta the same way (newer, read-only). A malformed meta is left alone by the
ensure step.

Chrome assigns the extension id; `manifest.json` does not pin a `key`. Two
separate "Load unpacked" installs from different directories therefore get
different ids and do not share synced storage — sync between devices applies
to installs of the same published extension.

## Weather

The chosen location (`quietTabWeatherLocation`: name, country, latitude,
longitude) is stored in `chrome.storage.sync`. The last forecast
(`quietTabWeatherCache`) and the city-prompt flag (`quietTabWeatherPromptDismissed`)
are stored in `chrome.storage.local`. Only the exact value `true` counts as
dismissed; the flag is per device and not synced.

Weather values are not part of the widgets store. Each metric tile in the grid is
matched to the forecast by its metric id at render time; the grid re-renders when
the forecast arrives. A 2-wide tile shows the primary and secondary values, a
2-high one larger type and the city name; type sizes follow the cell size.

1. `initialize()` reads the location. With none set, no weather tile is drawn and
   the first shown metric's cell holds one "Set a city" hint tile (unless all four
   metrics are hidden); the other metrics' cells stay reserved. In normal mode the
   hint opens the city modal; in edit mode it stands for its metric.
2. If the cache belongs to the same location and is under 30 minutes old, it
   is shown without any network request.
3. Otherwise the service fetches the forecast and air quality in parallel and
   caches the result. If that fails but an older cache for the same location
   exists, the tiles show it marked as stale (dashed border). With no cache the
   tiles show an unavailable state and their descriptions carry the error.
4. Setting a city, from the city modal, geocodes the typed name (Open-Meteo returns English place
   names), stores the resolved location, and fetches a fresh forecast. Choosing a
   suggestion only fills the field; Save then stores that city without a geocoding
   request (editing the text drops the choice, so Save geocodes it instead). The
   modal is opened by the hint tile, by the weather edit dialog's "Set a city" /
   "Change city" button (change mode, stacked over that dialog), or automatically
   (first-run mode). While a request runs the field and buttons are disabled; on
   failure the modal stays open, keeps the typed text and shows the error. Save is
   always visible and is disabled while the field is empty; Enter in an empty field
   shows "Enter a city name" without a request.

### City modal

- **First-run rule.** After the first grid render, once per page load,
  `shouldAutoShowCityPrompt` opens the modal in first-run mode only when the
  stored city was read and is unset, the flag was read and is not set, at least one
  weather tile is shown, weather is available, and the grid is not locked (newer
  meta or failed migration). Any unknown input (a failed read) means it does not open.
  It never replaces, duplicates or reopens a modal that was already opened (and closed)
  during this page load.
- **Dismissal.** Closing the first-run modal by any route (Not now, Escape, a click
  on the backdrop) writes the flag; a failed write is silent, so the modal may show
  again next time. Choosing a city does not write it (a city being set is what
  stops the modal). Leaving the tab without closing the modal is not a dismissal.
  Backdrop clicks in the first 300 ms after opening are ignored.
- **Layout.** The dialog holds the city field with a clear button (shown while the
  field has text and no request runs), then the error line, then full-width
  Not now (first-run) or Cancel (change mode) and Save buttons with icons. Typing
  two or more characters opens the suggestion list as an absolutely positioned
  popover over the dialog, so the dialog does not move. When under 96px is free
  below the input (measured as if the list were an overlay) the list is docked in
  the dialog's flow instead and the dialog scrolls.
- **Keyboard.** ArrowDown in the field moves into the list; ArrowDown/ArrowUp move
  between suggestions and ArrowUp from the first returns to the field; Tab also
  reaches the suggestion buttons in DOM order.
- **List focus rule.** The list closes only when focus leaves the field wrapper
  (field, clear button and list), not when the window loses focus. A pointer press
  inside the dialog (Save, Not now/Cancel) does not close it before the click is
  delivered; it closes after the release. After choosing a suggestion, a click
  with a pointer (not Enter/Space) on the backdrop, Not now/Cancel or Save within 350 ms is
  ignored, so the second click of a double click cannot dismiss or submit.
- **Background.** While open, the grid is `inert` (and, when stacked, the weather
  edit dialog under it), so the modal is the only interactive region.
- **Focus.** In change mode focus moves to the city field at once; the first-run
  modal never takes focus by itself. Tab wraps inside the modal, and Tab from `body`
  or outside it enters the modal; while a request runs every control is disabled, so Tab does nothing and focus stays on `body`.
  On close, focus returns to the control that opened it (change mode), falling
  back to the Settings tile; a first-run modal returns focus to the Settings tile
  only if focus was inside it.
- **Busy.** While a city request runs the modal ignores every closing gesture,
  and Escape does nothing at all (it does not close the dialog behind it).

## Desktop grid UI

- **Normal mode.** A link tile opens its URL; the hint tile opens the city modal;
  Settings enters edit mode; Add opens the add-link dialog. A click on the
  background does nothing.
- **Edit mode** (Settings, `aria-pressed`): tiles jiggle (not with reduced
  motion), links and weather tiles get a − badge (links: delete confirm; weather:
  hide), a tap on a link or weather tile opens its edit dialog (link: URL, name,
  icon, color, size; weather: city row and size), and any tile can be dragged.
  A drop highlight shows the target cell (dashed error outline when that cell is
  occupied or outside the page margin left of or above the grid); it is drawn
  only for a block that lies inside the grid and at most one row below the lowest
  tile, otherwise there is no highlight. Any invalid drop returns the tile and
  writes nothing. Escape, a viewport
  change, a pointer cancel or leaving the window cancels a drag. Settings, a
  background click or Escape leaves edit mode.
- **Add.** In edit mode with at least one hidden metric, Add opens a menu
  (`role="menu"`, "Add link", "Add weather tile…" → one item per hidden metric);
  otherwise it opens the add-link dialog. A new link and a restored metric take the
  first free block.
- **Dialogs.** One at a time, `role="dialog"`, `aria-modal`, focus trapped, the
  grid inert; a write failure inside a dialog is shown in its alert line; a failed
  drag, delete, hide or restore is shown in the page status line (`role="alert"`,
  cleared by the next action or after 8 s) and nothing is persisted.
- **DOM order and focus.** Tiles are in `(y, x)` order of the displayed layout,
  each − badge right after its tile; after a delete or hide focus moves to the next
  tile, else the previous, else Settings.
- **Escape order** (one document handler): drag, tooltip, city suggestions, city
  modal, dialog, Add menu, edit mode.

## Tooltips

One `#tooltip` element (`role="tooltip"`, `position: fixed`) lives on `body`,
outside every scrolling container, and is shared by the weather tiles. In normal
mode only, it shows on pointer hover and on keyboard focus (`:focus-visible`),
copies the text of the tile's hidden description node, and is placed by
`placeTooltip`: above the tile when there is room, otherwise below, centered on
the tile and clamped to an 8px margin inside the viewport. It hides on leave,
blur, Escape, grid scroll (except the scroll caused by focusing a tile), wheel,
touch scroll, window resize, entering edit mode or a drag, and every grid render.

## Concurrency

Multiple new tab pages can exist at once. Widgets mutations (and the bootstrap
migrations) are serialized
with the Web Locks API using one extension-wide lock name. A promise-chain
fallback provides deterministic behavior in environments without Web Locks
and in Node.js tests.

## Stylesheets (new tab)

The new tab page loads CSS in dependency order from `src/newtab.html`:

| File | Role |
| --- | --- |
| `design-tokens.css` | Color, typography, spacing, radius, shadow, and focus tokens (light/dark), including Phase 2 grid/page chrome tokens (`--radius-tile`, `--space-grid-*`, status chip, weather cell type). |
| `controls.css` | Overlay controls: buttons, inputs, segmented groups, add-menu rows, city field, and each control's own base focus style. |
| `surfaces.css` | Dialog and modal shells, backdrops, popovers, and the focus rings scoped to `.desktop-dialog` / `.city-modal`. |
| `newtab.css` | Desktop grid, tiles, weather presentation, tooltip, page chrome (Phase 2: grid radii, shadows, spacing, and typography via tokens). |

Public spec: [`docs/design-system.md`](design-system.md) (phase 1: controls + surfaces; phase 2: grid/tile/page chrome in `design-tokens.css` + `newtab.css`).

## Security Boundaries

- User-provided text (favorite labels, city names) is rendered with DOM text
  nodes, never `innerHTML`. The only `innerHTML` use is `icons.js` inserting
  its own static, vendored SVG paths.
- Favorite and custom-icon URLs must use `http:` or `https:`; anything else
  is rejected during normalization.
- Custom-icon images are never sampled into a canvas, since arbitrary hosts
  rarely send CORS headers.
- Persisted state is schema-validated: on read, a malformed widget is left out
  (a widget whose only fault is its `grid` is kept, unplaced), a malformed meta
  reads as an empty grid, and a malformed location or cache reads as unset; on
  write, invalid state is rejected with an error.
- The extension has no content scripts, remote code, background worker, or
  broad host permissions; its only host access is Open-Meteo's three public
  endpoints.
