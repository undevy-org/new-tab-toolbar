# Privacy

## Data Sent

The extension sends requests only to Open-Meteo's public, keyless APIs, to
fetch weather for the city you choose:

```text
https://api.open-meteo.com/v1/forecast
https://air-quality-api.open-meteo.com/v1/air-quality
https://geocoding-api.open-meteo.com/v1/search
```

The city name you type is sent to Open-Meteo's geocoding endpoint to resolve
coordinates. No other request is made by this extension.

For favorites, the extension may ask Chromium for a site's favicon through
the Manifest V3 `_favicon` endpoint. Custom image URLs, if configured by the
user, are loaded by the new tab page so they can be displayed as tile icons.

## Data Stored

The extension stores the following in `chrome.storage.local`, scoped to this
browser profile only:

- a short-lived weather forecast cache;
- one flag recording that you closed the first-run city prompt on this device
  (it holds no personal data and is not synced).

The extension stores the following in `chrome.storage.sync`:

- the weather city you chose (its name, country, and coordinates);
- your favorite links' saved URLs;
- labels;
- domains;
- icon mode and optional custom image URLs;
- tile background colors and tile size;
- each tile's position and size on the grid, and whether a weather tile is shown or hidden;
- creation and update timestamps.

`chrome.storage.sync` is Chrome's own built-in sync feature, not a
project-run service: if the browser is signed into a Google account with
sync enabled, favorites and the chosen city follow the user to their other
signed-in Chromium browsers running this same extension. There is no synchronization service,
project backend, telemetry, or analytics endpoint operated by this
extension — sync, when it happens, is entirely Chrome's own infrastructure.
If sync is off or unavailable, favorites and the chosen city still work
locally, just without cross-device propagation.

## Background Activity

There is no background polling and no scheduled network activity. A weather
request happens only when a new tab opens with a stale cache and a chosen city, or
when you explicitly change the city.

Removing the extension through the browser's extension manager removes its
local extension storage according to the browser's normal extension-data
behavior.
