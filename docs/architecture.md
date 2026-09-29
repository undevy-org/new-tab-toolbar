# Architecture

## Overview

Quiet Tab is a Manifest V3 extension with no service worker. The new tab page
(`src/newtab.js`) owns rendering directly. Favorites and the four weather tiles
are widgets of one grid (widgets store and service); live weather data has its
own small service/store pair. The widgets layout and the chosen weather city
persist to `chrome.storage.sync`; the weather forecast cache persists to
`chrome.storage.local`.

## Components

| File | Responsibility |
| --- | --- |
| `src/newtab.js` | Renders the widget grid (favorites, weather tiles, the "Set a city" hint tile), the shared tooltip layer, and the Widgets settings panel with its Weather block (city form), and wires their controls to the services. The only file that touches the DOM. |
| `src/widgetsStore.js` | Validates, reads, and writes persisted widgets state (favorites and weather metrics plus grid columns/position), sharded across `chrome.storage.sync` keys; also holds the chunked, resumable migration from the old favorites-only storage, `ensureWeatherMetrics`, `inspectWidgetsMeta` and the newer-version write guard (`assertWritable`). |
| `src/widgetsService.js` | Implements add/update/delete for favorites, `updateWeatherMetric` (size, shown/hidden), move for any widget, and set columns/position, with input normalization, all serialized through a mutation lock; every mutation checks `assertWritable` first. |
| `src/widgetsShared.js` | Shared widget/grid constants (types, weather metric ids and default sizes, positions, column bounds, caps, lock name, newer-version message). |
| `src/widgetsLayout.js` | Pure grid layout rules: effective tile span, default column count, CSS layout values, settings-panel docking, skip-aware move targets, and `placeTooltip` (edge-aware tooltip placement). |
| `src/favoritesUiState.js` | Pure state machine for the settings panel: at most one add or edit form open at a time. |
| `src/favoritesShared.js` | Shared favorites constants (icon modes, color sources, tile sizes) and helpers. |
| `src/favoriteIcon.js` | Chooses a favicon, custom image, or letter icon for a tile. |
| `src/favoriteColor.js` | Derives a tile's accent color from its domain or a sampled icon. |
| `src/weatherApi.js` | Calls Open-Meteo's forecast, air-quality, and geocoding endpoints, normalizes responses, and maps UV index and US AQI values to scale labels. |
| `src/weatherStore.js` | Validates, reads, and writes the chosen location and the forecast cache. |
| `src/weatherService.js` | Serves a fresh cached forecast or fetches and caches a new one; resolves a typed city name to a location. |
| `src/weatherPresentation.js` | Formats readings and picks each tile's color tone. |
| `src/weatherTiles.js` | Pure presentation of one weather tile (label, primary and secondary text, tone, description) for the loading, ready, stale and error states. |
| `src/weatherUiState.js` | Pure state for the city form (open or closed). |
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
  (`top`, `bottom` or `center`).
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
removes the per-item keys of any widgets that were deleted. Favorites are capped
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
creates the meta with 6 columns, top position and the four metrics. A write
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
(`quietTabWeatherCache`) is stored in `chrome.storage.local`.

Weather values are not part of the widgets store. Each metric tile in the grid is
matched to the forecast by its metric id at render time; the grid re-renders when
the forecast arrives.

1. `initialize()` reads the location. With none set, no weather tile is drawn and
   the grid shows one "Set a city" hint tile (unless all four metrics are hidden)
   that opens the Widgets panel on the city field.
2. If the cache belongs to the same location and is under 30 minutes old, it
   is shown without any network request.
3. Otherwise the service fetches the forecast and air quality in parallel and
   caches the result. If that fails but an older cache for the same location
   exists, the tiles show it marked as stale (dashed border). With no cache the
   tiles show an unavailable state and the panel's Weather block shows the error.
4. Setting a city, from the Weather block of the settings panel, geocodes the typed name (Open-Meteo returns English place
   names), stores the resolved location, and fetches a fresh forecast.

## Tooltips

One `#tooltip` element (`role="tooltip"`, `position: fixed`) lives on `body`,
outside every scrolling container, and is shared by all tiles. It shows on
pointer hover and on keyboard focus (`:focus-visible`), copies the text of the
tile's hidden description node, and is placed by `placeTooltip`: above the tile
when there is room, otherwise below, centered on the tile and clamped to an 8px
margin inside the viewport. It hides on leave, blur, Escape (first in the Escape
priority: tooltip, then city suggestions, then the panel), grid scroll (except the
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
