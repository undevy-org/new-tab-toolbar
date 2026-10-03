# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Design system phase 1: overlay styles split into `design-tokens.css`,
  `controls.css`, and `surfaces.css` (loaded before `newtab.css`). Dialogs, the
  city modal, and the Add menu use a unified 40px control height and 8px control
  radius; city modal title spacing matches desktop dialogs (12px below the title).

### Added

- A full-window, macOS-style desktop grid replaces the favorites toolbar: links,
  weather tiles and two fixed tiles (Settings and Add) sit on a 2D grid of
  1×1, 2×1 or 2×2 cells. The number of columns follows the window (2–12) and a
  narrower window repacks the tiles for display only; widening it restores your
  arrangement.
- Edit mode: the Settings tile turns it on (Settings again, Escape or a click on
  the background turns it off). The tiles jiggle, a − badge deletes a link (with a
  confirmation) or hides a weather tile, and any tile can be dragged to a free cell
  with a drop highlight (an occupied or out-of-range cell is rejected and the tile
  slides back).
- Dialogs for adding and editing a link (address, name, icon, color, size), a
  weather edit dialog (size, and the city through the city modal), and an Add menu
  in edit mode that restores hidden weather tiles. A new link takes the first free
  cell from the top left.
- A page status line reports a change that could not be saved; nothing is
  half-applied.
- Weather tiles in the same grid as your links: temperature, precipitation, air
  quality and UV index can be resized, moved, hidden and shown (live weather data
  stays in its own storage). They are added automatically on the first open after
  updating and are safe to run from several tabs at once.
- A dismissible city modal that opens on a new tab when no city is set and at
  least one weather tile is shown. It opens once: any way of closing it
  (Not now, Escape, or a click outside) stops it from returning on that device.
  It is also opened by the "Set a city" tile (shown while no city is set, unless
  all four weather tiles are hidden) and by the weather edit dialog.
- A live city suggestion dropdown in the city modal: typing two or more
  characters shows matching cities from Open-Meteo's geocoding search;
  selecting one fills the field, and Save then stores it without a second
  geocoding request. Free-text entry and Save still work exactly as before.
- A shared tooltip layer for the weather tiles.
- README badge linking to the [Chrome Web Store listing](https://chromewebstore.google.com/detail/quiet-tab/dbcdpffdgfbjmdlomgheeijfkkjkhmma).

### Changed

- Favorites are stored in a new widgets layout (`quietTabWidgetsMeta` /
  `quietTabWidget:<id>`, layout version 2) where every widget stores its own cell
  (`grid: { x, y, w, h }`). Existing favorites are migrated automatically on the
  first open, keeping their arrangement; the migration is chunked and resumable,
  locks the grid with an explanation and "reload this tab" advice (never clipped)
  if it fails, leaves your data untouched in that case, and never runs over data
  written by a newer version. A widget whose cell is missing or broken is kept and
  placed at the first free cell instead of being dropped.
- The Settings and Add tiles are restored automatically if they are ever missing
  from the synced layout.
- Tiles take their size from the grid cell (72px, 64px on windows up to 600px
  wide, 56px up to 360px), links and weather tiles alike.
- The standalone weather panel is gone: the weather is shown in the grid's weather
  tiles, and the city is set in the city modal instead of a form.
- In the city modal a failed city search keeps what you typed, the field and
  buttons are disabled while a request runs, and an empty city name shows a
  message instead of doing nothing. Suggestions open as a popover over the dialog
  (the dialog does not move), with full-width Not now/Cancel and Save below the
  field, a clear button and arrow-key selection.
- The grid is labelled "Widgets" for assistive technology.
- Tooltips are edge-aware: one shared layer that stays fully inside the window,
  flips below a tile that is near the top, and is shown in normal mode only (not
  in edit mode or while dragging). Escape hides it before anything else except an
  active drag. After a re-render a tooltip may reappear on the tile under a
  stationary pointer in real Chrome (the tile is new and is the current one under
  the pointer).
- Weather tiles show a loading ("…") and an unavailable ("—") state without moving
  the grid; tiles showing saved data after a failed refresh get a dashed border.
- Widgets written by a newer version of Quiet Tab (for example synced from another
  device) are never overwritten: this build shows a message, keeps the grid
  read-only and writes nothing.
- Add/edit errors (for example the 200-favorites limit) show inside the dialog,
  and keyboard focus returns to the tile that opened a dialog when it closes.
- Keyboard focus is clearly visible on the grid tiles, the − badge, the Add menu
  and the controls of the link, weather and delete dialogs (contrast of at least
  3:1, also in edit mode and with reduced motion).
- The link, weather and delete dialogs fit a 320 px window; in the Edit link
  dialog the buttons wrap onto two rows at 400 px and below so Save is never cut
  off. The colour field has an accessible name.

### Notes

- Update Quiet Tab on every device that shares your Chrome Sync. Version 0.1.0 does
  not read the new layout (the migration removes the old favorites keys), so a
  device still on 0.1.0 shows no links until it is updated, and a link added there
  in the meantime is not carried over: the updated version treats it as leftover
  old data and removes it.
- If you update with no city set, the city modal appears once on your next new tab.
  Leaving that tab without closing the modal does not count as closing it, so it
  appears again on the next new tab. The choice to close it is remembered per
  device, not synced.

## [0.1.0] - 2026-09-27

### Added

- Initial public release of Quiet Tab: a favorites toolbar and a local
  weather panel on the new tab page. Forked from a personal news-queue
  extension, with the news feature removed entirely and every remaining
  string translated to English.

[0.1.0]: https://github.com/undevy-org/quiet-tab/releases/tag/v0.1.0
