# Chrome Web Store Privacy Disclosure — Quiet Tab

Drafted from `docs/privacy.md` and `manifest.json` as of this repository's
`0.1.0` tag. Re-check both files before reusing this draft for a future
version.

## Single purpose

Quiet Tab replaces the new tab page with a personal favorites toolbar and a
local weather panel.

## Permission justification

- `storage`: persists favorites and the chosen weather city
  (`chrome.storage.sync`) and a short-lived weather forecast cache
  (`chrome.storage.local`).
- `favicon`: displays each favorite's site favicon via the Manifest V3
  `_favicon` endpoint.
- Host permissions (`api.open-meteo.com`, `air-quality-api.open-meteo.com`,
  `geocoding-api.open-meteo.com`): fetch weather, air quality, and city
  coordinates for the city the user sets. All three are Open-Meteo's
  public, keyless APIs — no API key or account is involved.

## Data usage disclosure

- **Personally identifiable information:** not collected.
- **Health information:** not collected.
- **Financial and payment information:** not collected.
- **Authentication information:** not collected.
- **Personal communications:** not collected.
- **Location:** the city name the user types is sent to Open-Meteo's
  geocoding API to resolve coordinates for the weather request, and the
  resolved city (name, country, coordinates) is stored in
  `chrome.storage.sync`, so Chrome's own sync carries it to the user's other
  signed-in browsers. No browser geolocation API is used; the extension
  never reads the device's actual location. Declare as: location data
  limited to a user-chosen city, used only to fetch weather, never sold or
  used for advertising.
- **Web history:** not collected.
- **User activity:** not collected.
- **Website content:** favorite URLs/labels the user explicitly saves are
  stored (via Chrome's own sync infrastructure, not a project-run server)
  and are never transmitted anywhere except to Chrome's own sync.

## Certifications

- Does not sell or transfer user data to third parties outside approved use
  cases: true.
- Does not use or transfer user data for purposes unrelated to the
  extension's single purpose: true.
- Does not use or transfer user data to determine creditworthiness or for
  lending purposes: true.
