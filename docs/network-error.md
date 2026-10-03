# Network errors in the city flow and weather tiles

## Status

`ready for spec gate` (independent review 1 applied; re-review round 2 found no Critical or Important issues)

## Intake log

| Date | Raw note | Verdict | Reference |
|------|----------|---------|-----------|
| 2026-10-03 | When the network fails, the city search modal shows the raw "Failed to fetch". Found by the design-review final gate of the follow-up run (finding L3-01, rated Minor by the verifier, Important by the protocol definition "misleading text"). | `confirmed` | AS-NE-01..05; cause below (four leaks) |

### Root cause (traced in `src/`)

1. `fetch()` rejects with a `TypeError` whose message is the browser's own text (`Failed to fetch` in Chrome) when the host is unreachable. `src/weatherApi.js` (`geocodeCity`, `searchCities`, `fetchWeather`, `fetchAirQuality`) calls `fetchImpl(url)` bare, so that `TypeError` escapes as is. Only a non-2xx response is wrapped, in a `WeatherApiError` whose message is developer text (`Open-Meteo geocoding request failed with status 503`). Malformed bodies give more developer text (`Open-Meteo response is missing current.time`).
2. `changeCity()` in `src/newtab.js` (~:2405) does `cityModalError = error instanceof Error ? error.message : String(error)`, so whatever was thrown goes to the modal's `role="alert"` slot verbatim. Reachable path: typed name, no suggestion chosen, Save → `weatherService.setCity` → `geocodeCity` rejects.
3. The same raw text leaks a second way that the intake note did not mention. `weatherService.persistAndFetch` stores the city first, then catches a forecast or air-quality failure and returns `{ status: "error", error: errorMessage(error) }` (no throw). `changeCity` treats that as success and closes the modal; `describeWeatherMetric` (`src/weatherTiles.js:70`) then renders `Weather unavailable: Failed to fetch` into the tile's `sr-only` description (and so the screen-reader text, and the stale/error tooltip text where it is used). The boot path (`initialize`) does the same for a cached city.
4. A fourth leak is on boot. `src/newtab.js` (~:2135) stores `error.message` of a failed `weatherLocationStore.getLocation()` in `weatherLocationError`, and `effectiveWeatherResult()` (~:254) returns it as `result.error` of a `{ status: "error" }` result, which `describeWeatherMetric` renders as `Weather unavailable: <raw text>` (for example `Invalid weather location`).
5. The suggestion request in the modal (`searchCities` inside the `input` handler) swallows every failure (`catch { results = null }`), so offline typing shows nothing at all, and only Save reports.

## Default decisions (owner can override)

Picked by the spec author so the pipeline does not wait. Override any of them before the plan starts.

1. **Classify, never echo.** User-facing text is chosen by the kind of failure, never by `error.message`. Kinds: `network` (fetch rejected), `timeout` (existing 15 s guard), `http` (non-2xx), `notFound` (geocoder returned no match), and everything else (`unknown`: malformed body, storage errors, a plain `Error`). The kind is carried on `WeatherApiError.details.kind`; one pure function `weatherErrorMessage(error)` in `src/weatherApi.js` owns the table below. *Reason:* browsers word the same failure differently (Chrome "Failed to fetch", Firefox "NetworkError when attempting to fetch resource.", Safari "Load failed"), and matching on message text would be a locale- and browser-fragile patch. The `timeout` text exists only in this table in `weatherApi.js`: `withTimeout` in `newtab.js` throws `new WeatherApiError("Request timed out", { kind: "timeout" })` and contains no user string. The `notFound` name comes from `details.name` (the typed name, trimmed for display, never from `error.message`); long names wrap, as already covered by `LONG` in `13-city-modal`. A `WeatherApiError` with no `kind` or an unknown `kind` is `unknown`.
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
4. **Screen reader.** The existing `role="alert"` slot (`[data-city-modal-error]`) stays the single announcer. It is emptied when a request starts (`syncCityModal` in `changeCity`) and filled on failure, so each failed attempt is a fresh empty → text change and is announced again, including a second identical failure. No new live region, no `aria-live` on the input. Focus returns to the input; no `aria-describedby` change. The observable contract is the state sequence in AS-NE-03; spoken output is not tested.
5. **Forecast failure after a successful pick keeps today's flow.** The city is saved (the user did choose it), the modal closes, tiles show the `—` unavailable state with the calm text in their description: `Weather unavailable: Can't reach the weather service. Check your connection and try again.` (the prefix `Weather unavailable: ` stays, as `test/weatherTiles.test.js` encodes it). `weatherService` stores the already-mapped text in `result.error`, so every consumer is safe by construction. The error text reaches the user only for status `error`: in the tile's `sr-only` description (`aria-describedby`) and its tooltip text. A `stale` result carries the text in `result.error` but `describeWeatherMetric` does not render it, so that case is a service-level unit check, not user-visible. *Overridable:* alternatively keep the modal open and not save; rejected as a larger behavior change (the cache-less boot path would still need the tile text anyway).
6. **Suggestion failures stay silent.** Autocomplete is an aid; the typed name still works, and Save reports the failure once, in the one place with an announcement. New in the API wrapper: an `AbortError` from our own cancellation is rethrown unwrapped (today nothing distinguishes it; the modal's `catch { results = null }` swallows everything). Recorded under Accepted exceptions.
7. **Colors and layout untouched.** The slot keeps `status status--error status--full` (`--danger` text). The text must wrap in the dialog at 320 px width without clipping (it is `--full`, so it does). Contrast of `--danger` is a separate task (border/contrast follow-up) and is not changed here.

## Scope

- `src/weatherApi.js`: wrap a rejected `fetchImpl` (except `AbortError`) into `WeatherApiError` with `details.kind = "network"`; add `details.kind` (`http`, `notFound`, `unknown`-by-default) at the existing throw sites; export `weatherErrorMessage(error)`. Message strings of existing `WeatherApiError`s stay developer-facing and are never shown.
- `src/weatherService.js`: `errorMessage` returns `weatherErrorMessage(error)`, so `result.error` is user-safe.
- `src/newtab.js` (import `WeatherApiError`, `weatherErrorMessage`): `changeCity` catch (~:2405) uses `weatherErrorMessage(error)`; `withTimeout` (~:2368) throws `WeatherApiError` of kind `timeout` with no user string in `newtab.js`; the `startWeather` catch (~:2351) and the saved-city read (`weatherLocationError`, ~:2135, which feeds `result.error` at ~:254) both store `weatherErrorMessage(error)`, never `error.message` / `String(error)`.
- Tests that break or are added (names, not "as needed"): `test/weatherApi.test.js` (new: rejected `fetchImpl` gives `kind === "network"` for all four calls, `AbortError` rethrown; existing `error.message.includes(...)` checks at ~:134, 413, 498, 648 stay valid because developer messages are kept, verify they still pass); `test/weatherService.test.js:137` (`"network down"`), `:201` (`/503/`), `:216` (`/500/`) now expect the mapped texts; `test/weatherSource.test.js:51` (`/cityModalError = error instanceof Error/`) is replaced by a check for `weatherErrorMessage(error)`; `test/newtabSource.test.js:492` is rewritten to assert `kind: "timeout"` in `newtab.js` and the exact timeout string in `weatherApi.js`, and gains the no-raw-message rule of AS-NE-05; `test/weatherTiles.test.js:29,95` (`boom`) stay green (the string passes through).
- E2E: new `dg-45-city-network-error.mjs` in `quiet-tab-notes/e2e/scenarios/` (details in AS-NE-01..04).
- Docs: `docs/architecture.md` § Weather (item 3 now says descriptions carry the user-safe error text; one item: failures are classified and shown as fixed texts; `result.error` is user-safe) and the file table row for `weatherApi.js`; `CHANGELOG.md` `[Unreleased]` → Fixed.
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
- `favoritesError` and the desktop dialog error slots (`newtab.js` ~:1592, ~:2126) belong to the widgets store and are out of this spec.
- The `notFound` text does not change (`City "<name>" was not found`, no full stop).
- A connection dropped mid-response is read by `parseJson` as invalid JSON and shows the `unknown` text, not the `network` one; accepted.

## Accepted exceptions

- **Silent suggestion failures (decision 6).** L3-01 is closed for the Save path only; while typing offline no error is shown. Reason: autocomplete is optional, Save reports once with an announcement. Design review should not reopen it unless the owner overrides decision 6.

## Acceptance scenarios

All E2E scenarios use the harness default: `launch()` already routes `/open-meteo\.com/` to `route.abort("failed")`, which makes Chrome reject `fetch` with `TypeError: Failed to fetch`, the exact raw text of the bug. A scenario changes the network by `context.unroute(...)` and a new `context.route(...)` (`routeWeatherData` for success, `route.fulfill({ status: 503 })` for http). Seeds: groups 1-3 run in first-run mode (`launch(..., { autoPrompt: true })`, no city; this is the path that reproduced L3-01). Groups 2, 4 and 5 need a suggestion pick or a double Save and run in change mode (`openChange` pattern of `13-city-modal.mjs`, seed without a city); group 1 is also repeated once in change mode.

### AS-NE-01 Geocoding unreachable: calm text, modal stays, text kept

- Given: no city stored; the city modal is open (change mode); network aborted (harness default).
- When: the user types `Tbilisi` and presses Save without choosing a suggestion (the suggestion request also fails, so the list never opens).
- Then: `[data-city-modal-error]` is visible with text exactly `Can't reach the weather service. Check your connection and try again.`; the page text does not match `/Failed to fetch|TypeError|NetworkError|Load failed|Open-Meteo|fetch/i` anywhere inside `#city-modal`; the modal is still open; the input value is still `Tbilisi` and is `document.activeElement`; Save and the input are enabled and the dialog's `aria-busy` is `"false"`; `quietTabWeatherLocation` is absent from sync storage; no page error; at viewport 320×600 `modalInfo(page).errorClamped === false` for this text and Save is fully inside the viewport (`rect.bottom <= innerHeight`).
- Verified by: `dg-45` (check group 1); `test/weatherApi.test.js` (a rejecting `fetchImpl` gives `WeatherApiError` with `details.kind === "network"` for all four calls; `AbortError` is rethrown unchanged); `test/newtabSource.test.js`. Expected before the fix: the error slot reads `Failed to fetch`.

### AS-NE-02 Retry after the network returns

- Given: the state after AS-NE-01.
- When: the harness restores the network (`unroute`, then `routeWeatherData` plus a geocoding `fulfill` returning Tbilisi) and the user presses Save again without retyping.
- Then: the modal closes, the error slot is gone with it, `quietTabWeatherLocation.name === "Tbilisi"`, the weather tiles render real values (primary text is not `—`).
- Verified by: `dg-45` (check group 2). Expected before the fix: green (characterization of today's retry behavior).

### AS-NE-03 Screen-reader announcement, including a repeated failure

- Given: the modal open (first-run), network aborted with a 150 ms delay (the geocoding route does `await sleep(150)` before `route.abort("failed")`) so that the cleared state and the message are never batched together. Before the first Save, `page.evaluate` installs a `MutationObserver` on `[data-city-modal-error]` (`childList`, `characterData`, `subtree`, `attributes: ["hidden"]`) that appends `{ text: node.textContent, hidden: node.hidden }` to `window.__alertLog`; the first snapshot is written at install time.
- When: the user presses Save twice in a row with the network still down (the second after the first message is visible).
- Then: the node has `role="alert"` and no `aria-live="off"`; after collapsing consecutive identical snapshots `window.__alertLog` equals `[ {empty, hidden}, {M, visible}, {empty, hidden}, {M, visible} ]` where `M` is the AS-NE-01 text, so the second identical failure is a fresh empty → text change; the dialog `aria-busy` is `"true"` during each request and `"false"` after; no other element in the modal has `role="alert"` or `aria-live` set by this flow.
- Verified by: `dg-45` (check group 3). Expected before the fix: the structure checks are green (characterization of the alert slot), only the check that `M` equals the new text is red. Design review (screen-reader lens): the observed sequence is the contract.

### AS-NE-04 Server error and the saved-city-but-no-forecast case

- Given: (a) geocoding answers `503`; (b) in a separate run geocoding answers Tbilisi but both weather endpoints are aborted.
- When: (a) the user types a city and presses Save; (b) two runs: (b1) the user chooses a suggestion and presses Save (`selectLocation`, no geocoding request), (b2) types the name and presses Save (`setCity`, geocodes). Both paths are checked.
- Then: (a) the slot reads `The weather service isn't responding right now. Try again in a moment.`, modal stays open, nothing stored, and at 320×600 `errorClamped === false` with Save inside the viewport. (b1, b2) The modal closes, `quietTabWeatherLocation.name === "Tbilisi"`, the four weather tiles show `—`, and each tile's `sr-only` description equals `Weather unavailable: Can't reach the weather service. Check your connection and try again.`; no tile text anywhere matches the raw-text regex from AS-NE-01.
- Verified by: `dg-45` (check groups 4 and 5); `test/weatherService.test.js` (`persistAndFetch` and `initialize` return the mapped `error`; a stale fallback carries the mapped text in `result.error`, not user-visible); `test/weatherTiles.test.js`. Expected before the fix: (a) `/status 503/` developer text, (b) `Weather unavailable: Failed to fetch`.

### AS-NE-05 Mapping table is total and never echoes

- Given: `weatherErrorMessage` from `src/weatherApi.js`.
- When: called with `WeatherApiError`s of each kind, a plain `Error("boom")`, a `TypeError("Failed to fetch")` that was not wrapped, `null`, `undefined`, a string, a `WeatherApiError` with no `kind` and one with `kind: "x"`, and a `WeatherApiError` of kind `notFound` with `details.name` `<b>x</b>`.
- Then: the five table texts are returned for their kinds; every other input (including no or unknown `kind`) returns the `unknown` text; none of the outputs contains the input's message (except the deliberate `notFound` name); the `notFound` text for `<b>x</b>` contains the literal characters and is only ever assigned through `textContent` (source test: no `innerHTML` in the modal error path). Source test in `test/newtabSource.test.js`: `newtab.js` has no assignment of `error.message` or `String(error)` to `cityModalError`, `weatherLocationError`, or the `error:` field of the `startWeather` result.
- Verified by: new cases in `test/weatherApi.test.js`; `test/newtabSource.test.js`.

## Review focus

- **Copy:** are the three new texts calm, short and consistent with `The request took too long. Check your connection and try again.`; no technical words; sentence case; no clash with the stale/unavailable tile wording.
- **Completeness:** the four leaks (modal catch, `persistAndFetch` result, `startWeather`, `weatherLocationError`) all go through `weatherErrorMessage`; look for a fifth. Open for the owner (not blocking): `Weather unavailable: Couldn't load weather. Try again in a moment.` repeats "weather"; `Couldn't load the forecast. Try again in a moment.` is an alternative `unknown` text.
- **Announcements:** the empty → text transition per attempt; focus returns to the input; no double announcement from a second live region.
- **Regression:** `dg-13`/`dg-15`/`dg-25`/`dg-29`/`dg-41`, scenario `13-city-modal`/`15-city-modal-layout` (timeout and `Enter a city name` texts unchanged), AS-DS tile-state checks.
