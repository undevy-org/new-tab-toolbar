# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- README badge linking to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/quiet-tab/dbcdpffdgfbjmdlomgheeijfkkjkhmma).
- A live city suggestion dropdown in the weather panel: typing two or more
  characters shows matching cities from Open-Meteo's geocoding search;
  selecting one sets the location immediately without a second geocoding
  request. Free-text entry and Save still work exactly as before.
- `weather-metric` items in the widgets layout: temperature, precipitation, air
  quality and UV index are stored next to favorites (order, size and shown/hidden
  only; live weather data stays in its own storage). They are added automatically
  on the first open after updating and are safe to run from several tabs at once.
- A shared tooltip layer for the tiles.

### Changed

- The favorites bar is now a wrapping grid with a configurable number of columns (1–12)
  instead of a single horizontally scrolling row, and can be placed at the top, center
  or bottom of the page (Widgets settings).
- Reordering in the Widgets settings now uses up/down "Move earlier"/"Move later"
  buttons to match the multi-row grid.
- Favorites are stored in a new unified widgets layout (`quietTabWidgetsMeta` /
  `quietTabWidget:<id>`). Existing favorites are migrated automatically on first open; the migration is resumable and
  leaves your data untouched if it fails.
- The "couldn't move your favorites" message shown when a failed migration locks the favorites bar is no longer clipped to two lines, so the "reload this tab" recovery advice is always readable on narrow screens.
- A wide tile is shown as a square while the grid has a single column.
- The weather tiles are now widgets of the same grid as your links: they can be
  resized (square or wide), hidden and shown, reordered together with links, and
  follow the grid's columns and top/center/bottom position. The standalone
  weather panel is gone.
- The city is now set in the Weather block of the settings panel (with a visible
  "City" label and a "Change city" button). While no city is set, the grid shows a
  "Set a city" tile that opens the panel on the city field; it is not shown if all
  four weather tiles are hidden.
- The settings panel is renamed "Widgets" (was "Quick links"); the toolbar is
  labelled "Widgets" for assistive technology.
- Tooltips are edge-aware: one shared layer that stays fully inside the window,
  flips below a tile that is near the top, is never clipped by the scrolling grid,
  and closes on Escape before anything else. After a re-render a tooltip may
  reappear on the tile under a stationary pointer in real Chrome (the tile is
  new and is the current one under the pointer).
- All tiles share one height (52px, 44px on windows up to 600px wide, 36px up to
  360px), so links now shrink on narrow screens together with the weather tiles.
- A new link is inserted after your last link, so it lands before the weather tiles.
- Weather tiles show a loading ("…") and an unavailable ("—") state without moving
  the grid; tiles showing saved data after a failed refresh get a dashed border.
- Widgets written by a newer version of Quiet Tab (for example synced from another
  device) are never overwritten: this build shows a message, keeps the bar
  read-only and writes nothing.
- The Widgets settings panel no longer covers the bar it configures: it docks to
  the edge opposite the bar (the roomier side when the bar is centered) and is limited to
  the free space beside the bar, so grid changes stay visible.
- The whole settings panel body (grid settings, add/edit form, error, list) scrolls
  inside the panel, so Save/Add/Cancel are reachable on short windows.
- Add/edit form errors (for example the 200-favorites limit) now show next to the form
  instead of collapsing to zero height.
- Keyboard focus moves into the settings panel when it opens and returns to a logical
  control after Add link, Cancel, Edit, Move earlier/later, Save and Delete.

### Notes

- Devices that still run the previous build do not know about weather items and may
  drop them from the layout on their next write; the next open of this build adds
  them back with default sizes.

## [0.1.0] - 2026-09-27

### Added

- Initial public release of Quiet Tab: a favorites toolbar and a local
  weather panel on the new tab page. Forked from a personal news-queue
  extension, with the news feature removed entirely and every remaining
  string translated to English.

[0.1.0]: https://github.com/undevy-org/quiet-tab/releases/tag/v0.1.0
