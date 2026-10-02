import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function source() {
  return readFile(new URL("../src/newtab.js", import.meta.url), "utf8");
}

async function html() {
  return readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
}

async function css() {
  return readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
}

describe("newtab weather source", () => {
  it("renders weather as grid tiles from weatherTiles.js instead of a separate root", async () => {
    const code = await source();
    assert.doesNotMatch(code, /querySelector\("#weather"\)/);
    assert.doesNotMatch(code, /weatherRoot/);
    assert.match(code, /from "\.\/weatherTiles\.js"/);
    assert.match(code, /describeWeatherMetric\(\{ metricKey: weatherMetricKey\(item\.id\)/);
  });

  it("wires weatherApi/weatherStore/weatherService/weatherUiState modules", async () => {
    const code = await source();
    assert.match(code, /from "\.\/weatherUiState\.js"/);
    assert.match(code, /from "\.\/weatherApi\.js"/);
    assert.match(code, /from "\.\/weatherService\.js"/);
    assert.match(code, /from "\.\/weatherStore\.js"/);
  });

  it("initializes weather independently of the favorites boot", async () => {
    const code = await source();
    assert.match(code, /result = await weatherService\.initialize\(\);/);
    assert.match(code, /weatherResult = result;/);
    assert.match(code, /void startWeather\(\);/);
  });

  it("submits the modal's city form through setCity and keeps the modal open with the error on failure", async () => {
    const code = await source();
    assert.match(code, /form\.dataset\.weatherForm !== "city"/);
    assert.match(code, /changeCity\(\(\) => weatherService\.setCity\(cityName\)\)/);
    assert.match(code, /cityModalError = error instanceof Error/);
    assert.doesNotMatch(code, /weatherFormError/);
  });

  it("opens the city modal via data-weather-action and closes it from its own dismiss button, with no editing state", async () => {
    const code = await source();
    assert.match(code, /dataset\.weatherAction = "open-city-modal"/);
    assert.match(code, /showCityModal\("change", OPEN_CITY_MODAL_SELECTOR\)/);
    assert.match(code, /dataset\.cityModalAction = mode === "first-run" \? "dismiss" : "cancel"/);
    assert.doesNotMatch(code, /"edit-city"/);
    assert.doesNotMatch(code, /"cancel-edit-city"/);
    assert.doesNotMatch(code, /startEditingCity|stopEditingCity|isEditingCity/);
  });

  it("blocks weather actions while a request is in flight", async () => {
    const code = await source();
    assert.match(code, /let weatherBusy = false;/);
    assert.match(code, /\|\| weatherBusy\) return;/);
    assert.match(code, /if \(weatherBusy \|\| !weatherService\) return;/);
    assert.match(code, /if \(!cityName\) \{\s*cityModalError = "Enter a city name";/);
  });

  it("has no weather panel markup, and labels the bar and panel as widgets", async () => {
    const markup = await html();
    assert.doesNotMatch(markup, /id="weather"/);
    assert.doesNotMatch(markup, /weather-panel/);
    assert.match(markup, /<nav class="favorites-bar" id="favorites" aria-label="Widgets"/);
    assert.match(markup, /aria-label="Widgets settings"/);
    assert.doesNotMatch(markup, /data-position/);
    assert.doesNotMatch(markup, /id="app"/);
    assert.doesNotMatch(markup, /<main\b/);
  });

  it("describes temperature, rain, air, and UV tiles in toolbar order", async () => {
    const tiles = await readFile(new URL("../src/weatherTiles.js", import.meta.url), "utf8");

    assert.deepEqual(
      [...tiles.matchAll(/tone: (\w+)\(/g)].map((match) => match[1]),
      ["temperatureTone", "rainTone", "usAqiTone", "uvTone"]
    );
    assert.deepEqual(
      [...tiles.matchAll(/metricKey === "(\w+)"/g)].map((match) => match[1]),
      ["temperature", "precipitation", "airQuality"]
    );
    assert.match(
      tiles,
      /Currently \$\{formatTemperature\(data\.temperature\)\}°\. Today at 15:00 — \$\{formatTemperature\(data\.temperatureTodayAt15\)\}°, yesterday at 15:00 — \$\{formatTemperature\(data\.temperatureYesterdayAt15\)\}°\./
    );
    assert.match(tiles, /Chance of rain for the rest of the day — \$\{primary\}, expected from \$\{start\}\./);
    assert.match(tiles, /Chance of rain for the rest of the day — \$\{primary\}\./);
    const shared = await readFile(new URL("../src/widgetsShared.js", import.meta.url), "utf8");
    assert.deepEqual(
      [...shared.matchAll(/"weather:(\w+)": "(square|wide)"/g)].map((match) => `${match[1]}:${match[2]}`),
      ["temperature:square", "precipitation:wide", "airQuality:wide", "uv:square"]
    );
    assert.match(tiles, /US AQI \$\{data\.usAqi\} \(\$\{usAqiCategory\(data\.usAqi\)\}\), PM2\.5 \$\{formatPm25\(data\.pm2_5\)\} µg\/m³\./);
    assert.match(tiles, /Current UV index \$\{data\.uvIndex\} \(\$\{uvIndexLevel\(data\.uvIndex\)\}\)\. Today's peak/);
  });

  it("builds focusable weather tiles described by a screen-reader-only text", async () => {
    const code = await source();
    const start = code.indexOf("function createWeatherMetricTile(");
    const end = code.indexOf("function createCityHintTile(", start);
    const tile = code.slice(start, end);

    assert.ok(start > -1 && end > start);
    assert.match(tile, /tile\.tabIndex = 0;/);
    assert.match(tile, /tile\.setAttribute\("role", "group"\);/);
    assert.match(tile, /tile\.setAttribute\("aria-label", model\.label\);/);
    assert.match(tile, /createNode\("span", "sr-only", model\.description\)/);
    assert.match(tile, /description\.dataset\.tooltipText = "";/);
    assert.match(tile, /tile\.setAttribute\("aria-describedby", description\.id\);/);
    assert.match(tile, /tile\.dataset\.tooltipTrigger = "";/);
    assert.match(tile, /tile\.dataset\.widgetId = item\.id;/);
    assert.doesNotMatch(code, /function createTooltip\(/);
  });

  it("shows the city and the change-city control in the settings Weather block, not on the tiles", async () => {
    const code = await source();
    const start = code.indexOf("function createWeatherMetricTile(");
    const end = code.indexOf("function createCityHintTile(", start);
    const tile = code.slice(start, end);
    const blockStart = code.indexOf("function mountWeatherBlockContent(");
    const block = code.slice(blockStart);

    assert.doesNotMatch(tile, /location\.(?:name|country)/);
    assert.match(block, /const cityLine = block\.querySelector\("\[data-weather-city\]"\);/);
    assert.match(block, /const cityLabel = block\.querySelector\("\[data-weather-city-label\]"\);/);
    assert.match(block, /cityLine\.textContent = location \? location\.name : weatherLocationError \? "" : "No city set";/);
    assert.match(block, /cityLabel\.hidden = !location;/);
    assert.match(block, /button\.dataset\.weatherAction = "open-city-modal";/);
    assert.match(block, /button = createNode\("button", "button"\);/);
    assert.match(block, /button\.replaceChildren\(createIconNode\("mapPin"\), document\.createTextNode\(location \? "Change city" : "Set a city"\)\);/);
    assert.match(code, /favoritesPanelRoot\?\.addEventListener\("click"/);
    assert.match(code, /\broot\.addEventListener\("submit"[\s\S]{0,200}dataset\.weatherForm !== "city"/);
  });

  it("styles wide weather tiles by spanning two grid columns of the shared tile height", async () => {
    const styles = await css();
    assert.match(styles, /\.weather-tile\[data-tile-size="wide"\]\s*\{[^}]*grid-column: span 2;/s);
    assert.doesNotMatch(styles, /\.weather-tile--wide/);
    assert.doesNotMatch(styles, /--weather-tile-height/);
  });

  it("leaves tooltip placement to the shared layer: no per-tile tooltip boxes or edge rules remain", async () => {
    const styles = await css();
    assert.doesNotMatch(styles, /\.weather-tile:first-child > \.tooltip/);
    assert.doesNotMatch(styles, /\.weather-tile:last-child > \.tooltip/);
    assert.doesNotMatch(styles, /\.weather-tile:nth-child\(2\) > \.tooltip/);
    assert.doesNotMatch(styles, /\.weather-status/);
  });

  it("marks stale tiles with data-stale and a dashed border instead of a floating status", async () => {
    const code = await source();
    const styles = await css();

    assert.match(code, /if \(model\.stale\) tile\.dataset\.stale = "true";/);
    assert.match(styles, /\.weather-tile\[data-stale="true"\]\s*\{[^}]*border-style: dashed;/s);
    assert.match(code, /Couldn't refresh weather - showing saved data/);
  });

  it("wires searchCities for live city suggestions with debounce, minimum length, and request cancellation", async () => {
    const code = await source();
    assert.match(code, /searchCities/);
    assert.match(code, /query\.length < 2/);
    assert.match(code, /new AbortController\(\)/);
    assert.match(code, /}, 250\);/);
  });

  it("resets suggestion state on every fresh mount of the city form and guards stale async responses", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    assert.ok(formStart > -1 && formEnd > formStart);
    assert.match(form, /weatherFormGeneration \+= 1;/);
    assert.match(form, /const formGeneration = weatherFormGeneration;/);
    assert.match(form, /weatherUi = hideSuggestions\(weatherUi\);/);
    assert.match(form, /formGeneration !== weatherFormGeneration/);
  });

  it("selects a suggested city without a separate geocoding round-trip", async () => {
    const code = await source();
    assert.match(code, /"select-city"/);
    assert.match(code, /weatherService\.selectLocation\(\{/);
  });

  it("keeps the input focused when clicking a suggestion, so the click is not lost to a blur race", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    assert.ok(formStart > -1 && formEnd > formStart);
    assert.match(
      form,
      /suggestionsList\.addEventListener\("mousedown", \(event\) => \{\s*event\.preventDefault\(\);\s*\}\);/
    );
  });

  it("cancels a pending suggestion request when focus leaves the field wrapper or Escape is pressed (Escape is central)", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    const helperStart = form.indexOf("function cancelPendingSuggestionRequest()");
    const helperBody = form.slice(helperStart, form.indexOf('input.addEventListener("input"'));
    assert.ok(helperStart > -1);
    assert.match(helperBody, /clearTimeout\(debounceTimer\)/);
    assert.match(helperBody, /abortController\.abort\(\)/);

    // The old 150 ms blur timer is gone: the field wrapper's focusout closes the list only when focus leaves the wrapper.
    assert.doesNotMatch(form, /input\.addEventListener\("blur"/);
    const focusoutStart = form.indexOf('field.addEventListener("focusout"');
    assert.ok(focusoutStart > -1);
    const focusout = form.slice(focusoutStart, form.indexOf("});", focusoutStart));
    assert.match(focusout, /field\.contains\(event\.relatedTarget\)\) return;/);
    assert.match(focusout, /if \(!document\.hasFocus\(\)\) return;/);
    assert.match(focusout, /cancelPendingSuggestionRequest\(\)/);
    assert.match(form, /suggestionsList\.addEventListener\("focusin", cancelPendingSuggestionRequest\)/);

    const keydownStart = form.indexOf('input.addEventListener("keydown"');
    assert.ok(keydownStart > -1);
    const keydownHandler = form.slice(keydownStart, form.indexOf('suggestionsList.addEventListener("keydown"'));
    assert.doesNotMatch(keydownHandler, /Escape/);

    const formObject = form.slice(form.indexOf("activeCityForm = {"));
    for (const key of ["cancelPending", "renderSuggestions", "refresh", "place", "focusField", "dispose", "choose", "chosen", "recentlyChosen"]) {
      assert.match(formObject, new RegExp(`\\b${key}\\b`), key);
    }
    assert.match(
      code,
      /if \(isSuggestionsOpen\(weatherUi\)\) \{\s*activeCityForm\?\.cancelPending\(\);\s*weatherUi = hideSuggestions\(weatherUi\);\s*activeCityForm\?\.renderSuggestions\(\);\s*activeCityForm\?\.focusField\(\);/
    );
  });

  it("ignores a suggestion response that arrives while focus is on a list item", async () => {
    const code = await source();
    assert.match(
      code,
      /if \(signal\.aborted \|\| formGeneration !== weatherFormGeneration \|\| weatherBusy \|\| suggestionsList\.contains\(document\.activeElement\)\) \{/
    );
  });

  it("choosing a suggestion fills the field and closes the list; it does not save (D9)", async () => {
    const code = await source();
    const listeners = code.slice(code.indexOf("function attachCityModalListeners(root) {"), code.indexOf("let cityModalShownThisLoad"));
    const branchStart = listeners.indexOf('const suggestion = target.closest(\'[data-weather-action="select-city"]\');');
    assert.ok(branchStart > -1);
    const branch = listeners.slice(branchStart, listeners.indexOf("root.addEventListener(\"submit\""));
    assert.match(branch, /activeCityForm\?\.choose\(\{/);
    assert.doesNotMatch(branch, /changeCity/);
    const form = code.slice(code.indexOf("function createCityForm(mode) {"), code.indexOf("function buildCityModal("));
    const choose = form.slice(form.indexOf("choose(city) {"), form.indexOf("chosen: () =>"));
    assert.match(choose, /^choose\(city\) \{\s*closeList\(\);/);
    assert.match(choose, /input\.focus\(\)/);
    assert.match(form, /function closeList\(\) \{\s*cancelPendingSuggestionRequest\(\);/);
    // Save uses the remembered choice without a second geocoding request; edited text drops it.
    assert.match(listeners, /const picked = activeCityForm\?\.chosen\(\);\s*if \(picked\) \{\s*changeCity\(\(\) => weatherService\.selectLocation\(/);
    assert.match(form, /chosen: \(\) => \(chosenCity && chosenCity\.label === input\.value \? chosenCity : null\)/);
  });

  it("the clear button empties the field, closes the list, cancels the request, forgets the choice and focuses the field", async () => {
    const code = await source();
    const form = code.slice(code.indexOf("function createCityForm(mode) {"), code.indexOf("function buildCityModal("));
    const start = form.indexOf('clear.addEventListener("click"');
    assert.ok(start > -1);
    const handler = form.slice(start, form.indexOf("});", start));
    assert.match(handler, /input\.value = "";/);
    assert.match(handler, /chosenCity = null;/);
    assert.match(handler, /closeList\(\);/);
    assert.match(handler, /input\.focus\(\);/);
  });

  it("ignores the second click of a double click on an item, but never a keyboard activation", async () => {
    const code = await source();
    const listeners = code.slice(code.indexOf("function attachCityModalListeners(root) {"), code.indexOf("let cityModalShownThisLoad"));
    assert.match(listeners, /event\.detail > 0 &&\s*activeCityForm\?\.recentlyChosen\(\) &&/);
    assert.match(listeners, /\[data-city-modal-action\], button\[type="submit"\]/);
    assert.match(code, /recentlyChosen: \(\) => performance\.now\(\) - chosenAt < 350/);
  });

  it("disambiguates suggestions with the same name using admin1", async () => {
    const code = await source();
    const formStart = code.indexOf("function createCityForm(mode) {");
    const formEnd = code.indexOf("function createWeatherMetricTile(");
    const form = code.slice(formStart, formEnd);

    assert.ok(formStart > -1 && formEnd > formStart);
    assert.match(
      form,
      /const labelParts = \[suggestion\.name, suggestion\.admin1, suggestion\.country\]\.filter\([\s\S]*?\(part\) => part[\s\S]*?\);/
    );
    assert.match(form, /const label = labelParts\.join\(", "\);/);
  });

  it("never replaces a mounted city form or a stale first load when weather results arrive late", async () => {
    const code = await source();

    assert.doesNotMatch(code, /formHost/);
    assert.match(code, /if \(!button\) \{/);
    assert.match(code, /renderFavoritesToolbar\(\);\s*syncWeatherBlock\(\);/);
    assert.match(code, /if \(generation !== weatherGeneration\) \{\s*return;\s*\}/);
    assert.match(code, /const result = await withTimeout\(run\(\)\);[\s\S]*?weatherGeneration \+= 1;\s*weatherResult = result;/);
    assert.doesNotMatch(code, /function changeCity\(run\) \{\s*weatherGeneration \+= 1;/);
    assert.match(code, /if \(weatherChanging && currentLocation\(\)\) return null;/);
  });

  it("styles the city suggestion dropdown", async () => {
    const styles = await css();
    assert.match(styles, /\.weather-form__suggestions\s*\{/);
    assert.match(styles, /\.weather-form__suggestion\s*\{/);
  });
});
