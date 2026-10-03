# Quiet Tab

A small Manifest V3 extension for Chromium-based browsers that turns the new
tab page into a quiet, full-window desktop of your favorite links and local
weather tiles — nothing else.

[<img src="https://developer.chrome.com/static/docs/webstore/branding/image/UV4C4ybeBTsZt43U4xis.png" alt="Available in the Chrome Web Store" height="58">](https://chromewebstore.google.com/detail/quiet-tab/dbcdpffdgfbjmdlomgheeijfkkjkhmma)

![Quiet Tab](docs/screenshot.png)

## Features

- A full-window, macOS-style desktop grid: links, weather tiles and two fixed
  tiles (Settings and Add) sit on a 2D grid of 1×1, 2×1 or 2×2 cells. The
  number of columns follows the window (2–12); a narrower window repacks the
  tiles for display only, and widening it restores your arrangement.
- Edit mode (turned on by the Settings tile; Settings again, Escape or a click
  on the background turns it off): tiles jiggle, a − badge deletes a link or
  hides a weather tile, and any tile can be dragged to a free cell.
- Add, edit and delete links (address, name, icon, color, size) through small
  dialogs; the Add tile also restores hidden weather tiles.
- Opens saved favorites in the current tab.
- Uses site favicons with letter and custom-image fallbacks.
- Shows current weather for a city you choose as tiles in the same grid:
  temperature, UV index (with a WHO-scale level label), today's rain
  probability, and air quality. Each weather tile can be resized, hidden, and
  moved together with your links.
- Performs no background polling and has no analytics.

## Install

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome or another Chromium-based browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository directory.
6. Open a new tab.

The first launch shows the default tiles (weather, Settings, Add) and asks you
to set a city for the weather tiles in a small dialog (you can close it and set
a city later with the "Set a city" tile or from a weather tile's edit dialog).

## Permissions And Privacy

The manifest requests only:

- `storage` to persist favorites and your chosen weather city via Chrome
  Sync, and a short-lived weather cache and one prompt flag locally;
- `favicon` to display site favicons on link tiles;
- host access to Open-Meteo's forecast, air-quality, and geocoding
  endpoints to fetch weather for the city you choose.

Favorites and the chosen weather city are stored in `chrome.storage.sync`,
so they follow you to any other Chromium browser signed into the same Google
account with sync enabled and running this same extension — that's Chrome's
own built-in sync, not a project-run service. Favorites are not Chrome
bookmarks. A short-lived weather cache and a flag noting that you closed the
first-run city prompt are stored in `chrome.storage.local`, on this browser
profile only.

There is no remote content feed of any kind — no news, no analytics, no
telemetry. See [Privacy](docs/privacy.md) for details.

## Development

Requirements: Node.js 20 or newer.

```bash
npm test
npm run check
```

Both must pass before opening a pull request. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Project Layout

```text
manifest.json         Manifest V3 configuration
src/newtab.html        New tab page markup
src/newtab.css         Grid, tile and page chrome styles
src/design-tokens.css  Design tokens; controls.css and surfaces.css style overlays
src/newtab.js          Renders the desktop grid, dialogs, tooltip layer and city modal
src/desktop*.js        Grid engine and pure UI state (edit mode, dialogs, drag)
src/widgets*.js        Widgets persistence, service, shared constants, tooltip placement
src/favorite*.js       Favorites UI state, icon/color logic
src/weather*.js        Weather persistence, service, API client, presentation
src/icons.js           Vendored SVG icon set
src/mutationLock.js    Serializes concurrent storage writes
src/storeUtils.js      Shared storage-validation helpers
test/                  node:test suite mirroring src/
docs/                  Architecture and privacy documentation
```

## License

MIT — see [LICENSE](LICENSE).
