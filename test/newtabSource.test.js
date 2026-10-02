import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const NEWTAB_SOURCE = new URL("../src/newtab.js", import.meta.url);

async function source() {
  return readFile(NEWTAB_SOURCE, "utf8");
}

describe("newtab favorites source", () => {
  it("drives the desktop UI from the pure desktopUiState module, not a mode string", async () => {
    const code = await source();
    assert.match(code, /import \{ createDesktopUiState \} from "\.\/desktopUiState\.js";/);
    assert.match(code, /let desktopUi = createDesktopUiState\(\);/);
    assert.doesNotMatch(code, /favoritesMode/);
    assert.doesNotMatch(code, /favoritesUiState\.js/);
  });
  it("renders everything into the one desktop root; the settings panel root is gone", async () => {
    const code = await source();
    assert.match(code, /querySelector\("#favorites"\)/);
    assert.doesNotMatch(code, /#favorites-panel/);
    assert.doesNotMatch(code, /favoritesPanelRoot/);
  });
  it("closes the panel on Escape and returns focus to the gear", async () => {
    const code = await source();
    assert.match(code, /addEventListener\("keydown"/);
    assert.match(code, /"Escape"/);
    assert.match(code, /\.focus\(\)/);
  });

  it("lets favorite URL and custom-icon fields reach service normalization without native URL validation", async () => {
    const code = await source();
    assert.match(code, /\burl\.type = "text";\s+url\.inputMode = "url";/);
    assert.match(code, /customIconUrl\.type = "text";\s+customIconUrl\.inputMode = "url";/);
  });

  it("blocks favorites actions while a request is in flight", async () => {
    const code = await source();
    assert.match(code, /let favoritesBusy = false;/);
    assert.match(code, /let favoritesGeneration = 0;/);
    assert.match(code, /function startFavoritesAction\(\)/);
    assert.match(code, /function finishFavoritesAction\(generation, applyResult\)/);
    assert.match(code, /\|\| favoritesBusy\)\s*\{\s*return;/);
  });

  it("tags every icon with its source for observability", async () => {
    const code = await source();
    assert.match(code, /data-icon-source|dataset\.iconSource/);
  });

  it("re-checks the item is still auto before a late auto-accent write", async () => {
    const code = await source();
    assert.match(code, /backgroundColorSource !== "auto"/);
  });

  it("only samples icon pixels for CORS-safe sources, never arbitrary custom icon URLs", async () => {
    const code = await source();
    assert.match(code, /if \(!iconModel\.sampleable\) \{\s*return fallback;/);
    assert.doesNotMatch(code, /iconModel\.type === "image" \? iconModel\.src : ""/);
  });

  it("consumes --favorite-accent-rgb via legacy rgba() so comma channels stay valid CSS", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /rgb\(var\(--favorite-accent-rgb\)\s*\//);
    assert.match(css, /rgba\(var\(--favorite-accent-rgb\),/);
  });

  it("uses a black/white accent instead of blue, with a theme-aware button contrast color", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /--primary: #111318;/);
    assert.match(css, /--primary-contrast: #ffffff;/);
    assert.doesNotMatch(css, /--primary: #1473e6/);
    assert.doesNotMatch(css, /--primary: #4d9aff/);
    assert.match(css, /\.button--primary\s*\{[^}]*color: var\(--primary-contrast\);/s);
  });

  it("sizes every tile from the cell box (no --tile-height), keeps the weather tile slots, and has no weather panel", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /\.weather-panel/);
    assert.doesNotMatch(css, /--weather-tile-height/);
    assert.doesNotMatch(css, /--weather-reserve/);
    assert.doesNotMatch(css, /--tile-height/);
    assert.match(css, /\.weather-tile__values\s*\{[^}]*max-width: 100%;[^}]*overflow: hidden;/s);
    assert.match(css, /\.weather-tile__secondary\s*\{[^}]*color: var\(--text\);/s);
    assert.match(css, /\.weather-tile\[data-h="2"\] \.weather-tile__primary\s*\{/);
    assert.match(css, /\.sr-only\s*\{/);
  });
  it("derives tile size from the displayed cell and reuses the shared icon module for the chrome tiles and the badge", async () => {
    const code = await source();
    assert.match(code, /from "\.\/icons\.js"/);
    assert.match(code, /node\.dataset\.tileSize = cell\.w === 2 \? "wide" : "square";/);
    assert.match(code, /createIconNode\(settings \? "settings" : "plus", \{ size: 20 \}\)/);
    assert.match(code, /createIconNode\("minus", \{ size: 12 \}\)/);
    assert.doesNotMatch(code, /tileSpan/);
    assert.doesNotMatch(code, /"⚙"/);
    assert.doesNotMatch(code, /"‹"/);
    assert.doesNotMatch(code, /"›"/);
    assert.doesNotMatch(code, /"✎"/);
  });
  it("merges add and edit into one favorite form component", async () => {
    const code = await source();
    assert.doesNotMatch(code, /function createAddForm/);
    assert.doesNotMatch(code, /function createEditForm/);
    assert.match(code, /function createFavoriteForm\(item\)/);
  });

  it("builds icon/color/size choices as native radiogroups instead of <select>", async () => {
    const code = await source();
    assert.doesNotMatch(code, /createNode\("select"/);
    assert.match(code, /function createSegmentedControl\(/);
    assert.match(code, /input\.type = "radio";/);
  });

  it("reads a single form payload shape shared by add and edit submits", async () => {
    const code = await source();
    assert.match(code, /function readFavoriteFormPayload\(data\)/);
    assert.match(code, /tileSize: data\.get\("tileSize"\) === "wide" \? "wide" : "square"/);
  });

  it("gives the favorite form action buttons a leading icon instead of bare text", async () => {
    const code = await source();
    assert.match(code, /createIconButton\("button button--danger", "Delete", "trash2"\)/);
    assert.match(code, /createIconButton\("button", "Cancel", "x"\)/);
  });
  it("drops the dead min-width already overridden for every .favorite-input use site", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /min-width: min\(320px, 100%\);/);
  });

  it("drops the dead close-settings button — Escape and an outside click already close the panel", async () => {
    const code = await source();
    assert.doesNotMatch(code, /"close-settings"/);
    assert.doesNotMatch(code, /favorites-panel__footer/);

    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.doesNotMatch(css, /\.favorites-panel__footer/);
  });

  it("links each form row's label to its control for assistive tech", async () => {
    const code = await source();
    assert.match(code, /labelSpan\.id = `favorite-form-row-label-\$\{formRowIdSeq\+\+\}`;/);
    assert.match(code, /setAttribute\("aria-labelledby", labelSpan\.id\)/);
  });

  it("migrates legacy local favorites into sync storage before the first favorites read", async () => {
    const code = await source();
    assert.match(code, /from "\.\/widgetsStore\.js"/);
    assert.match(code, /migrateToWidgets\(localStorageArea, syncStorageArea\)/);
  });

  it("shows the locked-migration message in full, without the status line clamp", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.status--full\s*\{[^}]*-webkit-line-clamp: unset;/s);
    assert.match(css, /\.status--full\s*\{[^}]*overflow: visible;/s);
    assert.match(css, /\.status--full\s*\{[^}]*white-space: normal;/s);
    assert.match(css, /\.status--full\s*\{[^}]*display: block;/s);
    const code = await source();
    assert.match(code, /createStatus\(favoritesError, \{ error: true, live: "assertive", full: true \}\)/);
    assert.match(code, /status--full/);
  });

  it("keeps keyboard focus across re-renders: the focused tile or badge is found again by widget id", async () => {
    const code = await source();
    assert.match(code, /let pendingFocus = null;/);
    assert.match(code, /function applyPendingFocus\(\)/);
    assert.doesNotMatch(code, /pendingGearFocus/);
    assert.match(code, /function focusedWidgetId\(\)/);
    assert.match(code, /closest\("\[data-widget-id\], \[data-remove-for\]"\)/);
    assert.match(code, /function restoreFocus\(target\)/);
    const render = code.slice(code.indexOf("function renderDesktop()"), code.indexOf("// A resize only re-renders"));
    assert.ok(render.indexOf("const focusTarget = focusedWidgetId();") < render.indexOf("favoritesRoot.replaceChildren(grid);"));
    assert.ok(render.indexOf("favoritesRoot.replaceChildren(grid);") < render.indexOf("restoreFocus(focusTarget);"));
  });
  it("locks the favorites UI when the migration fails instead of exposing an editable empty grid", async () => {
    const code = await source();
    assert.match(code, /let widgetsMigrationFailed = false;/);
    assert.match(code, /widgetsMigrationFailed = true;/);
    assert.match(code, /if \(widgetsMigrationFailed\) \{\s*favoritesRoot\.replaceChildren\(/);
  });

  it("no longer publishes a weather reserve: weather tiles are cells of the desktop grid", async () => {
    const code = await source();
    assert.doesNotMatch(code, /ResizeObserver\(publishWeatherReserve\)/);
    assert.doesNotMatch(code, /--weather-reserve/);
    assert.match(code, /createWeatherMetricTile\(item, cell, view\)/);
  });
  it("locks the grid with the newer-version message before anything else and runs the v2 bootstrap chain in order (R7)", async () => {
    const code = await source();
    assert.match(code, /if \(widgetsNewer\) \{\s*favoritesRoot\.replaceChildren\(createStatus\(NEWER_WIDGETS_MESSAGE/);
    assert.ok(code.indexOf("if (widgetsNewer)") < code.indexOf("if (widgetsMigrationFailed) {\n    favoritesRoot"));
    assert.match(code, /inspectWidgetsMeta\(rawMeta\) === "newer"/);
    assert.match(code, /const migration = await migrateToWidgets\(localStorageArea, syncStorageArea\);\s*if \(migration\?\.newer\) \{\s*widgetsNewer = true;/);
    assert.match(code, /await ensureWidgetsLayout\(syncStorageArea\)/);
    assert.match(code, /widgetsEnsureFailed = true;/);
    const order = ['inspectWidgetsMeta(rawMeta) === "newer"', "await migrateToWidgets(", "await migrateWidgetsToV2(syncStorageArea);", "await ensureWidgetsLayout(syncStorageArea);", "widgetsState = await widgetsService.getState();"].map((n) => code.indexOf(n));
    assert.ok(order.every((i) => i >= 0), order.join());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
  it("starts the bar at a known position before the first render", async () => {
    const html = await readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
    assert.doesNotMatch(html, /id="favorites"[^>]*data-position/);
  });

  it("uses one shared tooltip layer appended to body and placed by placeTooltip", async () => {
    const code = await source();
    assert.match(code, /tooltipLayer\.id = "tooltip";/);
    assert.match(code, /tooltipLayer\.setAttribute\("role", "tooltip"\);/);
    assert.match(code, /document\.body\.appendChild\(tooltipLayer\);/);
    assert.match(code, /placeTooltip\(/);
    assert.doesNotMatch(code, /createTooltip/);
    assert.match(code, /suppressTooltipOnFocus = true;/);
    assert.match(code, /function renderDesktop\(\) \{[\s\S]*?hideTooltip\(\);/);
  });
  it("styles the tooltip as a fixed layer with no per-tile edge rules", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.tooltip \{\s*position: fixed;/);
    assert.doesNotMatch(css, /:first-child > \.tooltip/);
    assert.doesNotMatch(css, /:nth-child\(2\) > \.tooltip/);
    assert.doesNotMatch(css, /:last-child > \.tooltip/);
    assert.doesNotMatch(css, /\[data-tooltip-trigger\]:(hover|focus-visible) > \.tooltip/);
  });
});

describe("newtab city modal source", () => {
  const between = (code, from, to) => {
    const start = code.indexOf(from);
    const end = code.indexOf(to, start + from.length);
    assert.ok(start > -1 && end > start, `${from} .. ${to}`);
    return code.slice(start, end);
  };

  it("renders the modal as its own dialog root under body, present only while open", async () => {
    const code = await source();
    assert.match(code, /function showCityModal\(mode, openerSelector\)/);
    assert.match(code, /function hideCityModal\(\{ dismiss = false \} = \{\}\)/);
    assert.match(code, /function syncCityModal\(\)/);
    assert.match(code, /function attachCityModalListeners\(root\)/);
    assert.match(code, /root\.id = "city-modal";/);
    assert.match(code, /dialog\.setAttribute\("role", "dialog"\);/);
    assert.match(code, /dialog\.setAttribute\("aria-modal", "true"\);/);
    assert.match(code, /dialog\.setAttribute\("aria-labelledby", "city-modal-title"\);/);
    assert.match(code, /document\.body\.appendChild\(root\);/);
    assert.match(code, /cityModalRoot = root;/);
    assert.match(code, /cityModalRoot\.remove\(\);/);
  });

  it("makes the desktop inert while the modal is open and restores it on close", async () => {
    const code = await source();
    const show = between(code, "function showCityModal(", "function hideCityModal(");
    const hide = between(code, "function hideCityModal(", "function onFirstRunDismissed(");
    assert.match(show, /favoritesRoot\.inert = true;/);
    assert.match(show, /hideTooltip\(\);/);
    assert.match(hide, /favoritesRoot\.inert = false;/);
    assert.match(hide, /cityModalHadFocus/);
    assert.doesNotMatch(code, /favoritesPanelRoot/);
  });
  it("focuses the field only in change mode and returns focus to the opener, looked up at close time", async () => {
    const code = await source();
    const show = between(code, "function showCityModal(", "function hideCityModal(");
    assert.match(show, /if \(mode === "change"\) cityModalRoot\.querySelector\(CITY_INPUT_SELECTOR\)\?\.focus\(\);/);
    assert.match(code, /pendingFocus = \[cityModalOpener, SETTINGS_TILE_SELECTOR\]\.filter\(Boolean\);/);
    assert.match(code, /const SETTINGS_TILE_SELECTOR = '\[data-widget-id="chrome:settings"\]';/);
    assert.match(code, /showCityModal\("change", HINT_TILE_SELECTOR\)/);
    assert.match(code, /const HINT_TILE_SELECTOR = '\[data-widget-id="weather:hint"\]';/);
    assert.doesNotMatch(code, /CHANGE_CITY_SELECTOR/);
  });
  it("orders the single Escape handler: tooltip, suggestions, modal", async () => {
    const code = await source();
    const handler = between(code, 'if (event.key !== "Escape")', 'if (event.key !== "Tab"');
    const order = ["hideTooltipIfVisible()", "isSuggestionsOpen(weatherUi)", "cityModalRoot"].map((n) => handler.indexOf(n));
    assert.ok(order.every((i) => i >= 0), order.join());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(handler, /if \(cityModalRoot\) \{\s*if \(!weatherBusy\) hideCityModal\(\{ dismiss: true \}\);\s*return;\s*\}/);
  });
  it("traps Tab inside the modal; open list items are part of the cycle, hidden controls are not", async () => {
    const code = await source();
    const trap = between(code, 'if (event.key !== "Tab" || !cityModalRoot) return;', "});");
    assert.doesNotMatch(trap, /select-city/);
    assert.match(trap, /cityModalRoot\.querySelectorAll\("input, button"\)\]\.filter\(\(el\) => !el\.disabled && !el\.hidden\)/);
  });

  it("modal controls get a transparent 2px outline only while focused, plus the soft ring", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.city-modal :is\(button, input, \.weather-form__suggestion\):focus-visible \{\s*outline: 2px solid transparent;/);
    assert.doesNotMatch(css, /\.city-modal :is\(button, input[^)]*\)\s*\{/); // never on resting controls
    for (const selector of [".city-modal .favorite-input:focus-visible", ".city-modal .icon-button:focus-visible", ".city-modal .weather-form__suggestion:focus-visible"]) {
      const at = css.indexOf(selector);
      assert.ok(at > -1, selector);
      assert.match(css.slice(at, css.indexOf("}", at)), /box-shadow: 0 0 0 2px var\(--soft-ring\);/, selector);
    }
    assert.match(css, /\.city-modal \.button:focus-visible,\s*\.city-modal \.icon-button:focus-visible \{\s*background: var\(--soft-fill-strong\);\s*box-shadow: 0 0 0 2px var\(--soft-ring\);/);
    assert.doesNotMatch(css, /\.weather-form__suggestion:focus-visible \{\s*outline: 3px/);
  });

  it("keeps Tab on the page (preventDefault) when every modal control is disabled", async () => {
    const code = await source();
    const trap = between(code, 'if (event.key !== "Tab" || !cityModalRoot) return;', "});");
    assert.match(trap, /if \(controls\.length === 0\) \{\s*event\.preventDefault\(\);[^\n]*\s*return;\s*\}/);
  });

  it("the automatic prompt never reopens a modal already shown this page load", async () => {
    const code = await source();
    assert.match(code, /let cityModalShownThisLoad = false;/);
    const auto = between(code, "function maybeAutoShowCityPrompt(", "const items");
    assert.match(auto, /cityModalShownThisLoad/);
    const show = between(code, "function showCityModal(", "// `dismiss` is set");
    assert.match(show, /cityModalShownThisLoad = true;/);
  });

  it("ignores backdrop clicks right after opening and remembers focus inside the modal", async () => {
    const code = await source();
    const listeners = between(code, "function attachCityModalListeners(root)", "function showCityModal(");
    assert.match(code, /const CITY_MODAL_BACKDROP_GUARD_MS = 300;/);
    assert.match(listeners, /addEventListener\("focusin"/);
    assert.match(listeners, /cityModalHadFocus = true;/);
    assert.match(listeners, /performance\.now\(\) - cityModalOpenedAt >= CITY_MODAL_BACKDROP_GUARD_MS/);
    assert.match(listeners, /\[data-city-modal-backdrop\]/);
    assert.match(listeners, /addEventListener\("click"/);
    assert.doesNotMatch(listeners, /addEventListener\("(?:mousedown|pointerup)"/);
  });

  it("runs a city change with a timeout, clearing suggestions first, and re-renders the grid", async () => {
    const code = await source();
    const start = code.indexOf("function changeCity(run)");
    assert.ok(start > -1);
    const change = code.slice(start, code.indexOf("\n}\n", start));
    assert.match(change, /activeCityForm\?\.cancelPending\(\);/);
    assert.match(change, /activeCityForm\?\.renderSuggestions\(\);/);
    assert.match(change, /await withTimeout\(run\(\)\)/);
    assert.match(change, /weatherLocationError = "";/);
    assert.match(change, /cityModalError = "";\s*syncCityModal\(\);\s*renderFavorites\(\);/);
    assert.match(code, /const CITY_REQUEST_TIMEOUT_MS = 15000;/);
    assert.match(code, /The request took too long\. Check your connection and try again\./);
  });
  it("builds the modal with text-only buttons, a novalidate form and the approved strings, never innerHTML", async () => {
    const code = await source();
    const modal = between(code, "function createCityForm(mode)", "function createWeatherMetricTile(");
    assert.doesNotMatch(modal, /innerHTML/);
    assert.match(modal, /createIconButton\("button", mode === "first-run" \? "Not now" : "Cancel", "x"\)/);
    assert.match(modal, /createIconButton\("button button--primary", "Save", "check"\)/);
    assert.match(modal, /form\.noValidate = true;/);
    assert.doesNotMatch(modal, /input\.required/);
    assert.match(modal, /input\.value = "";/);
    assert.match(modal, /errorNode\.setAttribute\("role", "alert"\);/);
    for (const text of ["Enter a city name", "Show weather on your new tab?", "Not now", "Change city", "Set a city", "Current: "]) {
      assert.ok(code.includes(text), text);
    }
  });

  it("styles the modal above the panel and tooltip, with a readable placeholder and a visible focus ring", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.city-modal \{[^}]*position: fixed;[^}]*z-index: 100;/s);
    assert.match(css, /\.city-modal__backdrop \{[^}]*background: rgb\(0 0 0 \/ 50%\);/s);
    assert.match(css, /\.city-modal__dialog \{[^}]*width: min\(420px, calc\(100vw - 32px\)\);/s);
    assert.match(css, /\.city-modal__dialog--scroll \{[^}]*max-height: calc\(100vh - 32px\);[^}]*overflow-y: auto;/s);
    assert.match(css, /\.city-modal \.favorite-input::placeholder \{[^}]*color: var\(--muted\);[^}]*opacity: 1;/s);
    assert.doesNotMatch(css, /\.city-modal[^{]*\{[^}]*transition/s);
  });
});

describe("newtab first-run city prompt source", () => {
  function bootstrap(code) {
    const start = code.indexOf("if (favoritesRoot) {\n  void (async () => {");
    assert.ok(start >= 0, "bootstrap start");
    return code.slice(start, code.indexOf("})();", start));
  }

  it("evaluates the automatic prompt exactly once, in the bootstrap, after the first render", async () => {
    const code = await source();
    assert.equal(code.match(/maybeAutoShowCityPrompt\(\{ flagRead, dismissed \}\);/g)?.length, 1); // the one call (the definition has no semicolon)
    assert.equal(code.match(/maybeAutoShowCityPrompt\(/g)?.length, 2); // definition + one call
    const boot = bootstrap(code);
    const call = boot.indexOf("maybeAutoShowCityPrompt({ flagRead, dismissed });");
    assert.ok(call > 0, "called from the bootstrap");
    const lastRender = boot.lastIndexOf("renderFavorites();", call);
    const startWeather = boot.lastIndexOf("void startWeather();", call);
    assert.ok(lastRender > 0 && startWeather > lastRender && call > startWeather, "render, then weather, then the prompt");
    assert.ok(boot.indexOf("weatherPromptStore.isDismissed()") > startWeather, "the flag is read after the first render");
  });

  it("fails closed when the flag cannot be read", async () => {
    const boot = bootstrap(await source());
    assert.match(boot, /let flagRead = false;/);
    assert.match(boot, /catch \{\s*flagRead = false;/);
    assert.match(boot, /dismissed = await weatherPromptStore\.isDismissed\(\);\s*flagRead = true;/);
  });

  it("builds the prompt store only with local storage and writes the flag silently", async () => {
    const code = await source();
    assert.match(code, /import \{ shouldAutoShowCityPrompt \} from "\.\/cityPrompt\.js";/);
    assert.match(code, /const weatherPromptStore = hasStorageArea\(localStorageArea\) \? createWeatherPromptStore\(localStorageArea\) : null;/);
    assert.match(code, /weatherPromptStore\.dismiss\(\)\.catch\(/);
    assert.doesNotMatch(code, /onFirstRunDismissed\(\) \{\}/);
  });

  it("feeds the pure rule with live state and never replaces an open modal", async () => {
    const code = await source();
    const start = code.indexOf("function maybeAutoShowCityPrompt(");
    assert.ok(start >= 0);
    const body = code.slice(start, code.indexOf("\n}\n", start));
    assert.match(body, /^function maybeAutoShowCityPrompt\(\{ flagRead, dismissed \}\) \{\s*if \(cityModalRoot \|\| cityModalShownThisLoad\) return;/);
    for (const part of [
      "locationRead: weatherLocationKnown && !weatherLocationError",
      "hasLocation: Boolean(weatherLocation)",
      'item.type === "weather-metric" && item.enabled === true',
      "weatherAvailable: Boolean(weatherService && weatherPromptStore)",
      "gridLocked: widgetsNewer || widgetsMigrationFailed"
    ]) {
      assert.ok(body.includes(part), part);
    }
  });

  it("opens the first-run modal from one place and never calls focus() on that path", async () => {
    const code = await source();
    assert.equal(code.match(/showCityModal\("first-run"/g)?.length, 1);
    assert.match(code, /if \(show\) showCityModal\("first-run", null\);/);
    const start = code.indexOf("function showCityModal(");
    const guard = code.indexOf('if (mode === "change")', start);
    assert.ok(start >= 0 && guard > start);
    assert.doesNotMatch(code.slice(start, guard), /\.focus\(/); // no focus() call before the change-mode guard
    const guardLine = code.slice(guard, code.indexOf("\n", guard));
    assert.match(guardLine, /\.focus\(\)/);
  });

  it("adds no storage change listener (tabs do not observe each other)", async () => {
    const code = await source();
    assert.doesNotMatch(code, /onChanged/);
  });
});

describe("newtab desktop grid source (DOM contract, normal mode)", () => {
  const css = () => readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
  const html = () => readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
  const fn = (code, name) => {
    const start = code.indexOf(`function ${name}(`);
    assert.ok(start > -1, name);
    return code.slice(start, code.indexOf("\n}\n", start));
  };

  it("pins the page shell: one desktop root, a polite live region and a hidden page-level alert line", async () => {
    const markup = await html();
    assert.match(markup, /<main class="desktop" id="favorites" aria-label="Widgets" data-edit="false"><\/main>/);
    assert.match(markup, /<div class="sr-only" id="desktop-live" role="status" aria-live="polite"><\/div>/);
    assert.match(markup, /<div class="desktop-status" id="desktop-status" role="alert" hidden><\/div>/);
    assert.doesNotMatch(markup, /favorites-panel|favorites-bar|data-position/);
  });

  it("pins the DOM contract names: desktop-grid, chrome role, remove badge, per-tile cell variables", async () => {
    const code = await source();
    assert.match(code, /createNode\("div", "desktop-grid"\)/);
    assert.match(code, /grid\.style\.setProperty\("--grid-columns", String\(columns\)\);/);
    assert.match(code, /grid\.style\.setProperty\("--rows", /);
    assert.match(code, /button\.dataset\.chromeRole = item\.role;/);
    assert.match(code, /createNode\("button", "tile-remove"\)/);
    assert.match(code, /badge\.dataset\.removeFor = item\.id;/);
    for (const v of ["--x", "--y", "--w", "--h"]) assert.ok(fn(code, "placeTile").includes(`setProperty("${v}"`), v);
    assert.match(fn(code, "placeTile"), /node\.dataset\.w = String\(cell\.w\);\s*node\.dataset\.h = String\(cell\.h\);/);
    assert.match(code, /favoritesRoot\.dataset\.edit = String\(desktopUi\.editMode\);/);
  });

  it("names the chrome tiles Settings (with aria-pressed) and Add link, and the badges Remove / Hide", async () => {
    const chrome = fn(await source(), "createChromeTile");
    assert.match(chrome, /settings \? "Settings" : "Add link"/);
    assert.match(chrome, /if \(settings\) button\.setAttribute\("aria-pressed", String\(desktopUi\.editMode\)\);/);
    const badge = fn(await source(), "createRemoveBadge");
    assert.match(badge, /hidden \? `Hide \$\{label\}` : `Remove \$\{label\}`/);
  });

  it("names a link tile Open <label> in normal mode and Edit <label> in edit mode; text only via text nodes", async () => {
    const tile = fn(await source(), "createFavoriteTile");
    assert.match(tile, /editing \? `Edit \$\{item\.label\}` : `Open \$\{item\.label\}`/);
    assert.match(tile, /button\.dataset\.favoriteAction = editing \? "edit" : "open";/);
    assert.match(tile, /if \(cell\.w === 2\) \{/); // 1-wide tiles carry no label text, the label is the accessible name
    assert.match(tile, /createNode\("span", "favorite-tile__label", item\.label\)/);
    assert.match(tile, /if \(cell\.h === 2\) text\.appendChild\(createNode\("span", "favorite-tile__host", item\.domain\)\);/);
  });

  it("renders from displayLayout of the current column count, skips cell-less (hidden) metrics and sorts the DOM by (y, x)", async () => {
    const render = fn(await source(), "renderDesktop");
    assert.match(render, /const layout = displayLayout\(items, columns\);/);
    assert.match(render, /const columns = currentColumns\(\);/);
    assert.match(render, /if \(!cell\) continue;/);
    assert.match(render, /entries\.sort\(\(a, b\) => a\.cell\.y - b\.cell\.y \|\| a\.cell\.x - b\.cell\.x\);/);
    assert.match(render, /if \(desktopUi\.editMode && item\.type !== "chrome"\)/);
    assert.doesNotMatch(render, /widgetsService\./, "a render never writes");
  });

  it("puts one hint tile in the first enabled metric's cell while there is no city; other metrics wait", async () => {
    const code = await source();
    const render = fn(code, "renderDesktop");
    assert.match(render, /view\?\.status === "no-location"\) \{\s*if \(!hintPlaced\) \{\s*tile = createCityHintTile\(cell, item\);/);
    const hint = fn(code, "createCityHintTile");
    assert.match(hint, /if \(cell\.w === 2\) button\.textContent = "Set a city";\s*else button\.appendChild\(createIconNode\("plus"\)\);/);
    assert.match(hint, /button\.setAttribute\("aria-label", "Set a city"\);/);
  });

  it("uses the wide weather model for 2-wide tiles and adds the city line only at 2 high (R6)", async () => {
    const tile = fn(await source(), "createWeatherMetricTile");
    assert.match(tile, /const size = cell\.w === 2 \? "wide" : "square";/);
    assert.match(tile, /if \(cell\.h === 2 && cityName\) tile\.appendChild\(createNode\("span", "weather-tile__city", cityName\)\);/);
  });

  it("leads every weather tile with its decorative metric glyph from the vendored icons, sized by CSS per tile size", async () => {
    const code = await source();
    assert.match(code, /const METRIC_GLYPHS = \{ temperature: "thermometer", precipitation: "droplet", airQuality: "wind", uv: "sun" \};/);
    const tile = fn(code, "createWeatherMetricTile");
    assert.match(tile, /const glyph = createNode\("span", "weather-tile__glyph"\);\s*glyph\.setAttribute\("aria-hidden", "true"\);/);
    assert.match(tile, /glyph\.appendChild\(createIconNode\(METRIC_GLYPHS\[weatherMetricKey\(item\.id\)\]/);
    const styles = await css();
    assert.match(styles, /\.weather-tile__glyph svg \{\s*width: 14px;/);
    assert.match(styles, /\.weather-tile\[data-w="2"\]\[data-h="2"\] \.weather-tile__glyph svg \{\s*width: 24px;/);
  });

  it("forces no minimum page width, so a classic scrollbar at 320 px never scrolls sideways", async () => {
    const styles = await css();
    assert.doesNotMatch(styles, /min-width: 320px/);
  });

  it("sets the grid metrics from JS (R4), never from CSS media queries, and reserves the scrollbar gutter", async () => {
    const code = await source();
    const metrics = fn(code, "applyGridMetrics");
    assert.match(metrics, /const metrics = gridMetrics\(viewportWidth\(\)\);/);
    for (const v of ["--cell-size", "--grid-gap", "--grid-pad"]) assert.ok(metrics.includes(`style.setProperty("${v}"`), v);
    assert.match(code, /return document\.documentElement\.clientWidth;/);
    const styles = await css();
    assert.match(styles, /html \{\s*scrollbar-gutter: stable;\s*\}/);
    assert.doesNotMatch(styles, /--cell-size:\s*\d/, "no CSS sets a cell size");
    assert.doesNotMatch(styles, /--grid-gap:\s*\d/);
  });

  it("positions tiles absolutely from the cell variables inside a centered grid block", async () => {
    const styles = await css();
    assert.match(styles, /\.desktop \{[^}]*min-height: 100vh;[^}]*padding: var\(--grid-pad, 16px\);/s);
    assert.match(styles, /\.desktop-grid \{[^}]*position: relative;[^}]*margin: 0 auto;/s);
    assert.match(styles, /\.desktop-grid > \[data-widget-id\] \{[^}]*position: absolute;[^}]*left: calc\(var\(--x\) \* \(var\(--cell-size\) \+ var\(--grid-gap\)\)\);/s);
    assert.match(styles, /\.desktop-grid > \.tile-remove \{[^}]*width: 24px;[^}]*height: 24px;/s);
    assert.match(styles, /\.favorite-tile__label,\s*\.favorite-tile__host \{[^}]*text-overflow: ellipsis;/s);
    assert.doesNotMatch(styles, /grid-column: span 2/);
  });

  it("re-renders on resize only when the column count or the cell size changed, and a resize never writes", async () => {
    const code = await source();
    const start = code.indexOf('window.addEventListener("resize", () => {');
    assert.ok(start > -1);
    const handler = code.slice(start, code.indexOf("\n});\n", start));
    assert.match(handler, /requestAnimationFrame/);
    assert.match(handler, /currentColumns\(\) !== renderedColumns \|\| gridMetrics\(viewportWidth\(\)\)\.cell !== renderedCell/);
    assert.doesNotMatch(handler, /widgetsService|storage/);
  });

  it("in normal mode handles only link open and the hint; the background and chrome tiles do nothing yet", async () => {
    const click = fn(await source(), "handleFavoritesClick");
    assert.match(click, /if \(action === "set-city"\)/);
    assert.match(click, /\} else if \(action === "open"\) \{/);
    assert.match(click, /window\.location\.assign\(favorite\.url\);/);
    assert.doesNotMatch(click, /moveWidget|deleteFavorite|updateWeatherMetric/);
  });

  it("a failed v1 → v2 migration locks the grid exactly like the legacy migration failure", async () => {
    const code = await source();
    const boot = code.slice(code.indexOf("if (favoritesRoot) {\n  void (async () => {"));
    const tryBlock = boot.slice(0, boot.indexOf("} catch (error) {\n      widgetsMigrationFailed = true;"));
    assert.ok(tryBlock.includes("await migrateWidgetsToV2(syncStorageArea);"), "v2 migration runs inside the locking try");
    assert.ok(tryBlock.indexOf("await migrateToWidgets(") < tryBlock.indexOf("await migrateWidgetsToV2("));
  });

  it("shows a failed ensure in the page-level status line (text only)", async () => {
    const code = await source();
    assert.match(code, /if \(widgetsEnsureFailed\) showDesktopStatus\(ENSURE_FAILED_MESSAGE\);/);
    assert.match(fn(code, "showDesktopStatus"), /desktopStatus\.textContent = text;/);
  });

  it("never uses innerHTML in newtab.js and adds no chrome.storage.onChanged listener", async () => {
    const code = await source();
    assert.doesNotMatch(code, /innerHTML/);
    assert.doesNotMatch(code, /chrome\.storage\.onChanged|storage\.onChanged/);
  });
});
