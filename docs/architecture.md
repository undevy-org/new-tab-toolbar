# Architecture

## Overview

Quiet Tab is a Manifest V3 extension with no service worker. The new tab page
(`src/newtab.js`) owns rendering directly. Favorites and the four weather tiles
are widgets of one grid (widgets store and service); live weather data has its
own small service/store pair. The widgets layout and the chosen weather city
persist to `chrome.storage.sync`; the weather forecast cache and a per-device
"city prompt dismissed" flag persist to `chrome.storage.local`.

## Components

| File | Responsibility |
| --- | --- |
| `src/newtab.js` | Renders the widget grid (favorites, weather tiles, the "Set a city" hint tile), the shared tooltip layer, the Widgets settings panel (a Links card, then a Weather card with the city row and the four metric rows; links and metrics share one 64px row template, and a metric's Show control is an eye toggle with `aria-pressed`), and the city modal (field, clear button, suggestion popover, error line, Not now/Cancel and Save; present in the DOM only while open), and wires their controls to the services. The only file that touches the DOM. |
| `src/widgetsStore.js` | Validates, reads, and writes persisted widgets state (favorites and weather metrics plus grid columns/position), sharded across `chrome.storage.sync` keys; also holds the chunked, resumable migration from the old favorites-only storage, `ensureWeatherMetrics`, `inspectWidgetsMeta` and the newer-version write guard (`assertWritable`). |
| `src/widgetsService.js` | Implements add/update/delete for favorites, `updateWeatherMetric` (size, shown/hidden), move for any widget, and set columns/position, with input normalization, all serialized through a mutation lock; every mutation checks `assertWritable` first. |
| `src/widgetsShared.js` | Shared widget/grid constants (types, weather metric ids and default sizes, positions, column bounds, caps, lock name, newer-version message). |
| `src/widgetsLayout.js` | Pure grid layout rules: effective tile span, default column count, CSS layout values, settings-panel docking, `groupWidgets` (stable partition: favorites first, then weather metrics), `moveTargetIndex` (skip-aware, and only within the item's own group: a link never jumps over a metric or the reverse), and `placeTooltip` (edge-aware tooltip placement). |
| `src/favoritesUiState.js` | Pure state machine for the settings panel: at most one add or edit form open at a time. |
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
key at 8KB — too small to hold all 200 possible favorites in one blob. Storage
is sharded instead:

- `quietTabWidgetsMeta` — `{ version, order: [id, ...], columns, position, createdAt, updatedAt }`,
  the authoritative display order (never trust `chrome.storage`'s object-key
  iteration order) plus the grid's column count (1–12) and vertical position
  (`top`, `bottom` or `center`). A clean install starts at `center`; the legacy
  migration and a corrupted meta that is replaced keep `top`. `newtab.html` carries
  no `data-position`: the bar is hidden by CSS until `newtab.js` has read the state
  and set the attribute, so it never paints at a position that may change.
- `` `quietTabWidget:<id>` `` — one key per widget. Every item carries a `type`:
  `favorite`, or `weather-metric` (`{ id, type, tileSize, enabled }` with one of
  four fixed ids: `weather:temperature`, `weather:precipitation`,
  `weather:airQuality`, `weather:uv`). A weather metric stores only its order,
  size and shown/hidden flag; the values come from the weather cache at render
  time.

`getState()` tolerates a `meta.order` entry whose item key hasn't propagated
from another device yet — it filters that entry out rather than discarding
the whole list, self-healing on the next successful write. `setState()`
rewrites the meta key and every current item in a single batched
`storageArea.set()` call (one write operation regardless of key count), then
removes the per-item keys of any widgets that were deleted. Both return and write
favorites before weather metrics (`groupWidgets` partitions the single stored order;
no schema change), so the grid, the panel and a re-read always agree. Favorites are capped
at 200; the total cap (204) holds the four weather metrics.

On bootstrap, before the first read, `newtab.js` calls `migrateToWidgets()` under
the same mutation lock as every widgets mutation. It moves the previous
favorites-only storage (`quietTabFavoritesMeta` + `quietTabFavorite:<id>` in
sync, or the older single-blob `quietTabFavorites` in `chrome.storage.local`)
into the widgets layout. A valid `quietTabWidgetsMeta` is authoritative and is
never overwritten; leftover legacy keys are then treated as stale and removed.
Because sync storage has a 100KB total quota, items are written in chunks of 25
with each chunk's legacy keys deleted right after it, and the meta key is
written last, so an interrupted run resumes cleanly. If the migration fails, the
favorites UI is locked with an error rather than shown as an editable empty
grid, and the legacy data is left untouched for the next attempt. On a normal
install the migration finds nothing and does nothing.

After the migration, `newtab.js` calls `ensureWeatherMetrics()` under the same
lock. It re-reads the meta and adds whichever of the four weather metrics are
missing (temperature and UV square, precipitation and air quality wide, all
shown), appended after the existing items; item keys are written first and the
meta last, so an interrupted run leaves only orphan items that the next run
adopts. When it appends the whole weather block at once it raises `columns` to at
least 6 (never lowers it), so an upgrader with a small column count keeps the wide
tiles wide. If nothing is missing nothing is written. On a fresh install it
creates the meta with 6 columns, center position and the four metrics. A write
failure is non-fatal: links keep working, no weather tiles render, and the Weather
block shows the error until the next open retries.

A meta whose `version` is newer than this build understands (written by a newer
version on another device) is never touched: the migration and the ensure step
write and delete nothing, every service mutation fails first with the
newer-version message (`assertWritable`), and the bar is locked read-only with
that message. A malformed meta is also left alone by the ensure step; it behaves
as an empty grid and the first mutation writes a fresh meta. Devices that still
run a build without weather metrics can drop them on their next write; the ensure
step restores the missing ones with default sizes on the next open of this build.

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
the forecast arrives.

1. `initialize()` reads the location. With none set, no weather tile is drawn and
   the grid shows one "Set a city" hint tile (unless all four metrics are hidden)
   that opens the city modal.
2. If the cache belongs to the same location and is under 30 minutes old, it
   is shown without any network request.
3. Otherwise the service fetches the forecast and air quality in parallel and
   caches the result. If that fails but an older cache for the same location
   exists, the tiles show it marked as stale (dashed border). With no cache the
   tiles show an unavailable state and the panel's Weather block shows the error.
4. Setting a city, from the city modal, geocodes the typed name (Open-Meteo returns English place
   names), stores the resolved location, and fetches a fresh forecast. Choosing a
   suggestion only fills the field; Save then stores that city without a geocoding
   request (editing the text drops the choice, so Save geocodes it instead). The
   modal is opened by the hint tile or the Weather card's "Set a city" / "Change
   city" button (change mode), or automatically (first-run mode). While a request
   runs the field and buttons are disabled; on failure the modal stays open, keeps
   the typed text and shows the error. Save is always visible and is disabled while
   the field is empty; Enter in an empty field shows "Enter a city name" without a
   request.

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
- **Background.** While open, the grid and the settings panel are `inert`, so the
  modal is the only interactive region.
- **Focus.** In change mode focus moves to the city field at once; the first-run
  modal never takes focus by itself. Tab wraps inside the modal, and Tab from `body`
  or outside it enters the modal; while a request runs every control is disabled, so Tab does nothing and focus stays on `body`.
  On close, focus returns to the control that opened it (change mode), falling
  back to the Weather block button and then the gear button; a first-run modal
  returns focus to the gear button only if focus was inside it.
- **Busy.** While a city request runs the modal ignores every closing gesture,
  and Escape does nothing at all (it does not close the panel behind it).

## Tooltips

One `#tooltip` element (`role="tooltip"`, `position: fixed`) lives on `body`,
outside every scrolling container, and is shared by all tiles. It shows on
pointer hover and on keyboard focus (`:focus-visible`), copies the text of the
tile's hidden description node, and is placed by `placeTooltip`: above the tile
when there is room, otherwise below, centered on the tile and clamped to an 8px
margin inside the viewport. It hides on leave, blur, Escape (first in the Escape
priority: tooltip, then city suggestions, then the city modal, then the panel), grid scroll (except the
scroll caused by focusing a tile), wheel, touch scroll, window resize and every
grid render.

## Concurrency

Multiple new tab pages can exist at once. Favorites mutations are serialized
with the Web Locks API using one extension-wide lock name. A promise-chain
fallback provides deterministic behavior in environments without Web Locks
and in Node.js tests.

## Security Boundaries

- User-provided text (favorite labels, city names) is rendered with DOM text
  nodes, never `innerHTML`. The only `innerHTML` use is `icons.js` inserting
  its own static, vendored SVG paths.
- Favorite and custom-icon URLs must use `http:` or `https:`; anything else
  is rejected during normalization.
- Custom-icon images are never sampled into a canvas, since arbitrary hosts
  rarely send CORS headers.
- Persisted state is schema-validated: on read, malformed favorites fall back
  to an empty list and a malformed location or cache reads as unset; on
  write, invalid state is rejected with an error.
- The extension has no content scripts, remote code, background worker, or
  broad host permissions; its only host access is Open-Meteo's three public
  endpoints.
