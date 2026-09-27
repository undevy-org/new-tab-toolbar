# Architecture

## Overview

Quiet Tab is a Manifest V3 extension with no service worker. The new tab page
(`src/newtab.js`) owns rendering directly; favorites and weather each have
their own small service/store pair. Favorites and the chosen weather city
persist to `chrome.storage.sync`; the weather forecast cache persists to
`chrome.storage.local`.

## Components

| File | Responsibility |
| --- | --- |
| `src/newtab.js` | Renders the favorites toolbar, its settings panel, and the weather panel, and wires their controls to the services. |
| `src/favoritesStore.js` | Validates, reads, and writes persisted favorites state, sharded across `chrome.storage.sync` keys; also holds a one-time local-to-sync migration. |
| `src/favoritesService.js` | Implements add/update/delete/move with input normalization, all serialized through a mutation lock. |
| `src/favoritesUiState.js` | Pure state machine for the settings panel: at most one add or edit form open at a time. |
| `src/favoritesShared.js` | Shared favorites constants (icon modes, color sources, tile sizes) and helpers. |
| `src/favoriteIcon.js` | Chooses a favicon, custom image, or letter icon for a tile. |
| `src/favoriteColor.js` | Derives a tile's accent color from its domain or a sampled icon. |
| `src/weatherApi.js` | Calls Open-Meteo's forecast, air-quality, and geocoding endpoints, normalizes responses, and maps UV index and US AQI values to scale labels. |
| `src/weatherStore.js` | Validates, reads, and writes the chosen location and the forecast cache. |
| `src/weatherService.js` | Serves a fresh cached forecast or fetches and caches a new one; resolves a typed city name to a location. |
| `src/weatherPresentation.js` | Formats readings and picks each tile's color tone. |
| `src/weatherUiState.js` | Pure state for the city form (open or closed). |
| `src/icons.js` | Vendored, static SVG icon set. |
| `src/mutationLock.js` | Serializes mutations with the Web Locks API, with a promise-chain fallback. |
| `src/storeUtils.js` | Shared validation and cloning helpers. |

## Favorites Storage

Favorites sync across devices via `chrome.storage.sync`, which caps a single
key at 8KB — too small to hold all 200 possible favorites in one blob. Storage
is sharded instead:

- `quietTabFavoritesMeta` — `{ version, order: [id, ...], createdAt, updatedAt }`,
  the authoritative display order (never trust `chrome.storage`'s object-key
  iteration order).
- `` `quietTabFavorite:<id>` `` — one key per favorite item.

`getState()` tolerates a `meta.order` entry whose item key hasn't propagated
from another device yet — it filters that entry out rather than discarding
the whole list, self-healing on the next successful write. `setState()`
rewrites the meta key and every current item in a single batched
`storageArea.set()` call (one write operation regardless of key count), then
removes the per-item keys of any favorites that were deleted.

On bootstrap, before the first favorites read, `newtab.js` calls
`migrateLegacyFavorites()`, which moves a single-blob favorites value stored
under `quietTabFavorites` in `chrome.storage.local` into the sharded sync
layout, clearing the local key only after the sync write succeeds. Current
versions never write that local key, so on a normal install the migration
finds nothing and does nothing.

Chrome assigns the extension id; `manifest.json` does not pin a `key`. Two
separate "Load unpacked" installs from different directories therefore get
different ids and do not share synced storage — sync between devices applies
to installs of the same published extension.

## Weather

The chosen location (`quietTabWeatherLocation`: name, country, latitude,
longitude) is stored in `chrome.storage.sync`. The last forecast
(`quietTabWeatherCache`) is stored in `chrome.storage.local`.

1. `initialize()` reads the location. With none set, the panel asks for a city.
2. If the cache belongs to the same location and is under 30 minutes old, it
   is shown without any network request.
3. Otherwise the service fetches the forecast and air quality in parallel and
   caches the result. If that fails but an older cache for the same location
   exists, the panel shows it marked as stale.
4. Setting a city geocodes the typed name (Open-Meteo returns English place
   names), stores the resolved location, and fetches a fresh forecast.

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
