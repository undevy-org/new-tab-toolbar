# Network errors in the city flow and weather tiles

## Status

`draft` (stage 0; awaiting independent spec review)

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-03 | When the network fails, the city search modal shows the raw "Failed to fetch". Found by the design-review final gate of the follow-up run (finding L3-01, rated Minor by the verifier, Important by the protocol definition "misleading text"). | `confirmed` | AS-NE-01..05; cause below |

### Root cause (traced in `src/`)

1. `fetch()` rejects with a `TypeError` whose message is the browser's own text (`Failed to fetch` in Chrome) when the host is unreachable. `src/weatherApi.js` (`geocodeCity`, `searchCities`, `fetchWeather`, `fetchAirQuality`) calls `fetchImpl(url)` bare, so that `TypeError` escapes as is. Only a non-2xx response is wrapped, in a `WeatherApiError` whose message is developer text (`Open-Meteo geocoding request failed with status 503`). Malformed bodies give more developer text (`Open-Meteo response is missing current.time`).
2. `changeCity()` in `src/newtab.js` (~:2405) does `cityModalError = error instanceof Error ? error.message : String(error)`, so whatever was thrown goes to the modal's `role="alert"` slot verbatim. Reachable path: typed name, no suggestion chosen, Save → `weatherService.setCity` → `geocodeCity` rejects.
3. The same raw text leaks a second way that the intake note did not mention. `weatherService.persistAndFetch` stores the city first, then catches a forecast or air-quality failure and returns `{ status: "error", error: errorMessage(error) }` (no throw). `changeCity` treats that as success and closes the modal; `describeWeatherMetric` (`src/weatherTiles.js:70`) then renders `Weather unavailable: Failed to fetch` into the tile's `sr-only` description (and so the screen-reader text, and the stale/error tooltip text where it is used). The boot path (`initialize`) does the same for a cached city.
4. The suggestion request in the modal (`searchCities` inside the `input` handler) swallows every failure (`catch { results = null }`), so offline typing shows nothing at all, and only Save reports.

## Default decisions (owner can override)

Picked by the spec author so the pipeline does not wait. Override any of them before the plan starts.

1. **Classify, never echo.** User-facing text is chosen by the kind of failure, never by `error.message`. Kinds: `network` (fetch rejected), `timeout` (existing 15 s guard), `http` (non-2xx), `notFound` (geocoder returned no match), and everything else (`unknown`: malformed body, storage errors, a plain `Error`). The kind is carried on `WeatherApiError.details.kind`; one pure function `weatherErrorMessage(error)` in `src/weatherApi.js` owns the table below. *Reason:* browsers word the same failure differently (Chrome "Failed to fetch", Firefox "NetworkError when attempting to fetch resource.", Safari "Load failed"), and matching on message text would be a locale- and browser-fragile patch.
2. **Message table (English, sentence case, calm, one sentence plus one instruction, like the existing timeout text):**

   | Kind | Text |
   |------|------|
   | `network` | `Can't reach the weather service. Check your connection and try again.` |
   | `timeout` | `The request took too long. Check your connection and try again.` (unchanged) |
   | `http` | `The weather service isn't responding right now. Try again in a moment.` |
   | `notFound` | `City "<name>" was not found` (unchanged; the name is inserted with `textContent` only) |
   | `unknown` | `Couldn't load weather. Try again in a moment.` |

   No technical words (`fetch`, `TypeError`, `Open-Meteo`, status codes), no apology, no exclamation mark.
3. **Retry = the user presses Save (or Enter) again.** The modal stays open, the typed text and any chosen suggestion are kept, controls are re-enabled, focus returns to the city input (this is today's behavior; it is now pinned by a test). No automatic retry and no extra "Retry" button: Save already is the retry, and the one-line modal has no room for a second primary action. *Overridable:* an inline "Try again" button would be additive and does not change the table.
4. **Screen reader.** The existing `role="alert"` slot (`[data-city-modal-error]`) stays the single announcer. It is emptied when a request starts (`syncCityModal` in `changeCity`) and filled on failure, so each failed attempt is a fresh empty → text change and is announced again, including a second identical failure. No new live region, no `aria-live` on the input. Focus returns to the input; no `aria-describedby` change.
5. **Forecast failure after a successful pick keeps today's flow.** The city is saved (the user did choose it), the modal closes, tiles show the `—` unavailable state with the calm text in their description: `Weather unavailable: Can't reach the weather service. Check your connection and try again.` (the prefix `Weather unavailable: ` stays, as `test/weatherTiles.test.js` encodes it). `weatherService` stores the already-mapped text in `result.error`, so every consumer (tile description, stale text) is safe by construction. *Overridable:* alternatively keep the modal open and not save; rejected as a larger behavior change (the cache-less boot path would still need the tile text anyway).
6. **Suggestion failures stay silent.** Autocomplete is an aid; the typed name still works, and Save reports the failure once, in the one place with an announcement. Only an `AbortError` from our own cancellation is treated as "not an error" inside the API wrapper, as today.
7. **Colors and layout untouched.** The slot keeps `status status--error status--full` (`--danger` text). The text must wrap in the dialog at 320 px width without clipping (it is `--full`, so it does). Contrast of `--danger` is a separate task (border/contrast follow-up) and is not changed here.

## Scope

- `src/weatherApi.js`: wrap a rejected `fetchImpl` (except `AbortError`) into `WeatherApiError` with `details.kind = "network"`; add `details.kind` (`http`, `notFound`, `unknown`-by-default) at the existing throw sites; export `weatherErrorMessage(error)`. Message strings of existing `WeatherApiError`s stay developer-facing and are never shown.
- `src/weatherService.js`: `errorMessage` returns `weatherErrorMessage(error)`, so `result.error` is user-safe.
- `src/newtab.js`: `changeCity` catch uses `weatherErrorMessage(error)`; `withTimeout` rejects with a `WeatherApiError` of kind `timeout` carrying the existing text; the `startWeather` catch uses the same mapper.
- Tests: `test/weatherApi.test.js`, `test/weatherService.test.js` (the cases asserting raw `network down` / `/503/` / `/500/` now assert the mapped text), `test/weatherTiles.test.js` (a mapped string flows through unchanged), `test/newtabSource.test.js` (no `error.message` or `String(error)` assigned to `cityModalError`; the timeout text still present), `test/weatherSource.test.js` as needed.
- E2E: new `dg-45-city-network-error.mjs` in `quiet-tab-notes/e2e/scenarios/` (details in AS-NE-01..04).
- Docs: `docs/architecture.md` § Weather (one item: failures are classified and shown as fixed texts; `result.error` is user-safe) and the file table row for `weatherApi.js`; `CHANGELOG.md` `[Unreleased]` → Fixed.
- Public storefront check: no screenshot or store text depends on this state; README/store copy need no change (state in the plan).

## Process

This changes text the user sees, so it follows the full UI-phase cycle: spec, plan in `quiet-tab-notes/superpowers/plans/`, independent design review (`design-review/PROTOCOL.md`, copy lens included), E2E, then merge by the pipeline rules.

## Non-goals

- Retry with backoff, offline detection (`navigator.onLine`), a persistent offline banner, or caching geocoding results.
- Changing the weather cache, the 30-minute TTL, or the stale fallback rules.
- Messages for storage failures of the city write beyond the `unknown` text (they share the generic message; a dedicated one belongs with a storage-error task).
- Localization (the UI is English).
- New design tokens or colors; the border/city-field contrast problem is a separate task.
- Surfacing suggestion-request failures (decision 6).

## Accepted exceptions

- (none yet)

## Acceptance scenarios

All E2E scenarios use the harness default: `launch()` already routes `/open-meteo\.com/` to `route.abort("failed")`, which makes Chrome reject `fetch` with `TypeError: Failed to fetch`, the exact raw text of the bug. A scenario changes the network by `context.unroute(...)` and a new `context.route(...)` (`routeWeatherData` for success, `route.fulfill({ status: 503 })` for http). Seeds: first-run modal with `launch(..., { autoPrompt: true })`; change modal by clicking the hint tile or the weather dialog's "Change city" as `dg-29` does.

### AS-NE-01 Geocoding unreachable: calm text, modal stays, text kept

- Given: no city stored; the city modal is open (change mode); network aborted (harness default).
- When: the user types `Tbilisi` and presses Save without choosing a suggestion (the suggestion request also fails, so the list never opens).
- Then: `[data-city-modal-error]` is visible with text exactly `Can't reach the weather service. Check your connection and try again.`; the page text does not match `/Failed to fetch|TypeError|NetworkError|Load failed|Open-Meteo|fetch/i` anywhere inside `#city-modal`; the modal is still open; the input value is still `Tbilisi` and is `document.activeElement`; Save and the input are enabled and the dialog's `aria-busy` is `"false"`; `quietTabWeatherLocation` is absent from sync storage; no page error.
- Verified by: `dg-45` (check group 1); `test/weatherApi.test.js` (a rejecting `fetchImpl` gives `WeatherApiError` with `details.kind === "network"` for all four calls; `AbortError` is rethrown unchanged); `test/newtabSource.test.js`. Expected before the fix: the error slot reads `Failed to fetch`.

### AS-NE-02 Retry after the network returns

- Given: the state after AS-NE-01.
- When: the harness restores the network (`unroute`, then `routeWeatherData` plus a geocoding `fulfill` returning Tbilisi) and the user presses Save again without retyping.
- Then: the modal closes, the error slot is gone with it, `quietTabWeatherLocation.name === "Tbilisi"`, the weather tiles render real values (primary text is not `—`).
- Verified by: `dg-45` (check group 2). Expected before the fix: green (characterization of today's retry behavior).

### AS-NE-03 Screen-reader announcement, including a repeated failure

- Given: the modal open, network aborted; a `MutationObserver` installed on `[data-city-modal-error]` (`childList`, `characterData`, `attributes: ["hidden"]`) before the first Save.
- When: the user presses Save twice in a row with the network still down.
- Then: the node has `role="alert"` (and no `aria-live` override to `off`); the recorded states show, for each attempt, an empty-and-hidden state followed by the message and `hidden === false` (two separate empty → text transitions, so the second identical failure is announced again); the dialog `aria-busy` is `"true"` during each request and `"false"` after; no other element in the modal has `role="alert"` or `aria-live` set by this flow.
- Verified by: `dg-45` (check group 3). Manual lens for design review (screen-reader semantics): the observed sequence is the contract; actual speech output is not tested.

### AS-NE-04 Server error and the saved-city-but-no-forecast case

- Given: (a) geocoding answers `503`; (b) in a separate run geocoding answers Tbilisi but both weather endpoints are aborted.
- When: (a) the user types a city and presses Save; (b) the user chooses the suggestion or presses Save.
- Then: (a) the slot reads `The weather service isn't responding right now. Try again in a moment.`, modal stays open, nothing stored. (b) The modal closes, `quietTabWeatherLocation.name === "Tbilisi"`, the four weather tiles show `—`, and each tile's `sr-only` description equals `Weather unavailable: Can't reach the weather service. Check your connection and try again.`; no tile text anywhere matches the raw-text regex from AS-NE-01.
- Verified by: `dg-45` (check groups 4 and 5); `test/weatherService.test.js` (`persistAndFetch` and `initialize` return the mapped `error`; a stale fallback carries the mapped text); `test/weatherTiles.test.js`. Expected before the fix: (a) `/status 503/` developer text, (b) `Weather unavailable: Failed to fetch`.

### AS-NE-05 Mapping table is total and never echoes

- Given: `weatherErrorMessage` from `src/weatherApi.js`.
- When: called with `WeatherApiError`s of each kind, a plain `Error("boom")`, a `TypeError("Failed to fetch")` that was not wrapped, `null`, `undefined`, a string, and a `WeatherApiError` of kind `notFound` for `<b>x</b>`.
- Then: the five table texts are returned for their kinds; every other input returns the `unknown` text; none of the outputs contains the input's message (except the deliberate `notFound` name); the `notFound` text for `<b>x</b>` contains the literal characters and is only ever assigned through `textContent` (source test: no `innerHTML` in the modal error path).
- Verified by: new cases in `test/weatherApi.test.js`; `test/newtabSource.test.js`.

## Review focus

- **Copy:** are the three new texts calm, short and consistent with `The request took too long. Check your connection and try again.`; no technical words; sentence case; no clash with the stale/unavailable tile wording.
- **Completeness:** every path from a rejected request to user-visible text goes through `weatherErrorMessage` (modal, `startWeather`, `result.error`, tile description); look for a fourth leak.
- **Announcements:** the empty → text transition per attempt; focus returns to the input; no double announcement from a second live region.
- **Regression:** `dg-13`/`dg-15`/`dg-25`/`dg-29`/`dg-41`, scenario `13-city-modal`/`15-city-modal-layout` (timeout and `Enter a city name` texts unchanged), AS-DS tile-state checks.
