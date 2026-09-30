import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const NEWTAB_SOURCE = new URL("../src/newtab.js", import.meta.url);

async function source() {
  return readFile(NEWTAB_SOURCE, "utf8");
}

describe("newtab favorites source", () => {
  it("drives the favorites UI from the pure state machine, not a mode string", async () => {
    const code = await source();
    assert.match(code, /from "\.\/favoritesUiState\.js"/);
    assert.match(code, /let favoritesUi = createInitialFavoritesUiState\(\);/);
    assert.doesNotMatch(code, /favoritesMode/);
  });

  it("has no add tile — the only management entry is the settings gear", async () => {
    const code = await source();
    assert.doesNotMatch(code, /createFavoriteAddButton/);
    assert.match(code, /data-favorite-action/);
    assert.match(code, /"open-settings"/);
  });

  it("renders the toolbar and the settings panel into separate roots", async () => {
    const code = await source();
    assert.match(code, /querySelector\("#favorites"\)/);
    assert.match(code, /querySelector\("#favorites-panel"\)/);
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

  it("closes the settings panel on an outside pointerdown", async () => {
    const code = await source();
    assert.match(code, /addEventListener\("pointerdown"/);
    assert.match(code, /\.contains\(event\.target\)/);
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

  it("lets the toolbar hug its content instead of a fixed width, and keeps the settings panel above it", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorites-bar\s*\{[^}]*width: fit-content;/s);
    assert.match(css, /\.favorites-bar\s*\{[^}]*max-width: calc\(100vw - 32px\);/s);
    assert.doesNotMatch(css, /\.favorites-bar\s*\{[^}]*920px/s);
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 600px)"));
    assert.doesNotMatch(mobileBlock, /\.favorites-bar\s*\{[^}]*max-width:/s);
    assert.match(css, /:root\s*\{[^}]*--tile-height: 52px;/s);
    assert.doesNotMatch(css, /\.favorites-bar\s*\{[^}]*--tile-height:/s, "a copy on the bar would shadow the :root media overrides");
    assert.doesNotMatch(css, /\.favorites-grid\s*\{[^}]*--tile-height:\s*\d/s);
    assert.doesNotMatch(css, /--favorite-tile-height/);
    assert.match(css, /\.favorites-grid\s*\{[^}]*grid-template-columns: repeat\(var\(--columns, 6\), var\(--tile-height\)\);/s);
    assert.match(css, /\.favorites-panel\s*\{[^}]*z-index: 40;/s);
  });

  it("scales one tile height for favorites, weather tiles and the gear, and has no weather panel", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");

    assert.doesNotMatch(css, /\.weather-panel/);
    assert.doesNotMatch(css, /--weather-tile-height/);
    assert.doesNotMatch(css, /--weather-reserve/);

    const mobileBlock = css.slice(css.indexOf("@media (max-width: 600px)"));
    assert.match(mobileBlock, /:root\s*\{[^}]*--tile-height: 44px;/s);
    assert.match(css, /@media \(max-width: 360px\)\s*\{[\s\S]*?:root\s*\{[^}]*--tile-height: 36px;/);
    assert.match(css, /\.weather-tile\s*\{[^}]*width: var\(--tile-height\);[^}]*height: var\(--tile-height\);/s);
    assert.match(css, /\.weather-tile\[data-tile-size="wide"\]\s*\{[^}]*grid-column: span 2;/s);
    assert.match(css, /\.city-hint-tile\[data-tile-size="wide"\]\s*\{[^}]*grid-column: span 2;/s);
    assert.match(css, /\.weather-tile__values\s*\{[^}]*max-width: 100%;[^}]*overflow: hidden;/s);
    assert.match(css, /\.weather-tile__secondary\s*\{[^}]*color: var\(--text\);/s);
    assert.match(css, /\.sr-only\s*\{/);
  });

  it("renders tile size from data and reuses the shared icon module for the gear and panel controls", async () => {
    const code = await source();
    assert.match(code, /from "\.\/icons\.js"/);
    assert.match(code, /dataset\.tileSize = tileSpan\(item\.tileSize, columns\) === 2 \? "wide" : "square";/);
    assert.match(code, /createIconNode\("settings"/);
    assert.match(code, /createIconNode\("chevronUp"\)/);
    assert.match(code, /createIconNode\("chevronDown"\)/);
    assert.match(code, /createIconNode\("pencil"\)/);
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

  it("gives every panel action button a leading icon instead of bare text", async () => {
    const code = await source();
    assert.match(code, /createIconButton\("button button--primary", "Add link", "plus"\)/);
    assert.match(code, /createIconButton\("button button--danger", "Delete", "trash2"\)/);
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

  it("skips the empty favorites-grid box when there are no favorites, so the gear sits flush against the bar padding", async () => {
    const code = await source();
    assert.match(code, /if \(list\.childElementCount > 0\) \{\s*fragment\.appendChild\(list\);/);
  });

  it("positions the bar with data-position variants that read --bar-inset and no weather reserve", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorites-bar\[data-position="top"\]\s*\{[^}]*top: var\(--bar-inset\);/s);
    assert.match(css, /\.favorites-bar\[data-position="bottom"\]\s*\{[^}]*bottom: var\(--bar-inset\);/s);
    assert.match(css, /\.favorites-bar\[data-position="center"\]\s*\{[^}]*top: 50%;/s);
    assert.doesNotMatch(css, /--weather-reserve/);
    assert.doesNotMatch(css, /\.favorites-bar\s*\{[^}]*\btop:/s, "the base rule no longer pins top");
    assert.match(css, /\.favorites-bar\s*\{[^}]*--bar-inset: 16px;/s);
  });

  it("overrides the bar inset (not top) on narrow screens so it cannot lose a specificity fight", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    const mobileBlock = css.slice(css.indexOf("@media (max-width: 600px)"));
    assert.match(mobileBlock, /\.favorites-bar\s*\{[^}]*--bar-inset: 10px;/s);
    assert.doesNotMatch(mobileBlock, /\.favorites-bar\s*\{[^}]*\btop:/s);
  });

  it("spans a wide tile over grid columns instead of a fixed pixel width", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorite-tile\[data-tile-size="wide"\]\s*\{[^}]*grid-column: span 2;/s);
    assert.doesNotMatch(css, /\.favorite-tile\[data-tile-size="wide"\]\s*\{[^}]*calc\(var\(--tile-height\) \* 2\)/s);
  });

  it("scrolls the grid in both axes instead of clipping it, and caps its height", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorites-grid\s*\{[^}]*max-height: var\(--grid-max-height\);/s);
    assert.match(css, /\.favorites-grid\s*\{[^}]*overflow: auto;/s);
  });

  it("docks the settings panel to the edge opposite the bar", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorites-panel\[data-dock="bottom"\]\s*\{[^}]*bottom: var\(--panel-inset\);/s);
    const code = await source();
    assert.match(code, /favoritesPanelRoot\.dataset\.barPosition = gridLayout\(widgetsState\)\.position;/);
  });

  it("limits the panel to the free space beside the bar, published from a read-only measurement", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorites-panel\s*\{[^}]*max-height: var\(--panel-max-height, calc\(100vh - 2 \* var\(--panel-inset\)\)\);/s);
    const code = await source();
    assert.match(code, /panelDock\(/);
    assert.match(code, /favoritesRoot\.getBoundingClientRect\(\)/);
    assert.match(code, /setProperty\("--panel-max-height"/);
    assert.match(code, /favoritesPanelRoot\.dataset\.dock = /);
    assert.match(code, /new ResizeObserver\(publishPanelDock\)\.observe\(favoritesRoot\)/);
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

  it("scrolls the whole panel body (grid settings, form, error, list) inside the panel", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.favorites-panel__body\s*\{[^}]*overflow-y: auto;/s);
    assert.match(css, /\.favorites-panel__body\s*\{[^}]*min-height: 0;/s);
    assert.doesNotMatch(css, /\.favorites-panel__list\s*\{[^}]*overflow-y: auto;/s);
    assert.match(css, /\.favorites-panel__body \.status\s*\{[^}]*flex-shrink: 0;/s);
    assert.match(css, /\.favorites-panel__body\s*\{[^}]*flex-direction: column;/s);
    assert.match(css, /\.favorites-panel__body > \*\s*\{[^}]*flex: 0 0 auto;/s);
    const code = await source();
    assert.match(code, /"favorites-panel__body"/);
  });

  it("places the favorites error with the form, ahead of the list, and keeps the scroll position across re-renders", async () => {
    const code = await source();
    const panel = code.slice(code.indexOf("function renderFavoritesPanel"), code.indexOf("function renderFavorites()"));
    assert.ok(panel.indexOf("favoritesError") < panel.indexOf('createNode("div", "favorites-panel__list")'), "error precedes the list");
    assert.match(panel, /scrollTop/);
    assert.match(code, /scrollIntoView\(\{ block: "nearest" \}\)/);
  });

  it("moves focus into the panel and back to a logical control after each re-render", async () => {
    const code = await source();
    assert.match(code, /let pendingFocus = null;/);
    assert.match(code, /function applyPendingFocus\(\)/);
    assert.match(code, /heading\.tabIndex = -1|tabIndex = -1/);
    assert.doesNotMatch(code, /pendingGearFocus/);
    assert.match(code, /\[data-favorite-action="start-add"\]/);
    assert.match(code, /itemActionSelector\("edit", movedId\)/);
    assert.match(code, /itemActionSelector\(action, movedId\)/);
    assert.match(code, /title\.tabIndex = -1/);
  });

  it("renders the reorder buttons as move-earlier/move-later instead of spatial left/right", async () => {
    const code = await source();
    assert.match(code, /"move-earlier"/);
    assert.match(code, /"move-later"/);
    assert.doesNotMatch(code, /"move-left"/);
    assert.doesNotMatch(code, /"move-right"/);
    assert.match(code, /widgetsService\.moveWidget\(/);
  });

  it("offers columns and position controls that update only the grid, without re-rendering the panel", async () => {
    const code = await source();
    assert.match(code, /function createGridSettingsRow\(state\)/);
    assert.match(code, /dataset\.gridSetting = "columns"/);
    assert.match(code, /dataset\.gridSetting = "position"/);
    assert.match(code, /function syncGridSettingInputs\(\)/);
    assert.match(code, /\[data-grid-error\]/);

    const handler = code.slice(code.indexOf('favoritesPanelRoot?.addEventListener("change"'));
    const handlerBody = handler.slice(0, handler.indexOf("\n  });"));
    assert.doesNotMatch(handlerBody, /startFavoritesAction\(/, "would reset an open add/edit form");
    assert.match(handlerBody, /renderFavoritesToolbar\(\)/);
  });

  it("locks the favorites UI when the migration fails instead of exposing an editable empty grid", async () => {
    const code = await source();
    assert.match(code, /let widgetsMigrationFailed = false;/);
    assert.match(code, /widgetsMigrationFailed = true;/);
    assert.match(code, /if \(widgetsMigrationFailed\) \{\s*favoritesRoot\.replaceChildren\(/);
  });

  it("no longer publishes a weather reserve: weather lives in the grid", async () => {
    const code = await source();
    assert.doesNotMatch(code, /ResizeObserver\(publishWeatherReserve\)/);
    assert.doesNotMatch(code, /--weather-reserve/);
    assert.match(code, /createWeatherMetricTile\(item, layout\.columns, view\)/);
  });

  it("locks the bar with the newer-version message before anything else, and keeps focus across grid re-renders", async () => {
    const code = await source();
    assert.match(code, /if \(widgetsNewer\) \{\s*favoritesRoot\.replaceChildren\(\s*createStatus\(NEWER_WIDGETS_MESSAGE/);
    assert.ok(code.indexOf("if (widgetsNewer)") < code.indexOf("if (widgetsMigrationFailed) {\n    favoritesRoot"));
    assert.match(code, /inspectWidgetsMeta\(rawMeta\) === "newer"/);
    assert.match(code, /const migration = await migrateToWidgets\(localStorageArea, syncStorageArea\);\s*if \(migration\?\.newer\) \{\s*widgetsNewer = true;/);
    assert.match(code, /await ensureWeatherMetrics\(syncStorageArea\)/);
    assert.match(code, /widgetsEnsureFailed = true;/);
    assert.match(code, /closest\("\[data-widget-id\], \.favorite-settings"\)/);
  });

  it("starts the bar at a known position before the first render", async () => {
    const html = await readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
    assert.match(html, /id="favorites"[^>]*data-position="top"/);
  });

  it("uses one shared tooltip layer appended to body and placed by placeTooltip", async () => {
    const code = await source();
    assert.match(code, /tooltipLayer\.id = "tooltip";/);
    assert.match(code, /tooltipLayer\.setAttribute\("role", "tooltip"\);/);
    assert.match(code, /document\.body\.appendChild\(tooltipLayer\);/);
    assert.match(code, /placeTooltip\(/);
    assert.doesNotMatch(code, /createTooltip/);
    assert.match(code, /suppressTooltipOnFocus = true;/);
    assert.match(code, /function renderFavoritesToolbar\(\) \{[\s\S]*?hideTooltip\(\);/);
  });

  it("styles the tooltip as a fixed layer with no per-tile edge rules", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.tooltip \{\s*position: fixed;/);
    assert.doesNotMatch(css, /:first-child > \.tooltip/);
    assert.doesNotMatch(css, /:nth-child\(2\) > \.tooltip/);
    assert.doesNotMatch(css, /:last-child > \.tooltip/);
    assert.doesNotMatch(css, /\[data-tooltip-trigger\]:(hover|focus-visible) > \.tooltip/);
  });
  it("routes metric controls through updateWeatherMetric with absolute values and re-syncs the rows in place", async () => {
    const code = await source();
    assert.match(code, /updateWeatherMetric\(/);
    assert.match(code, /\{ enabled: target\.checked \}/);
    assert.match(code, /\{ tileSize: target\.value \}/);
    assert.match(code, /function syncMetricRows\(\)/);
    assert.match(code, /function moveButtonDisabled\(items, item, action\)/);
  });

  it("finds the newly added favorite by id difference, never as the last item", async () => {
    const code = await source();
    assert.doesNotMatch(code, /items\.at\(-1\)/);
    assert.match(code, /const previousIds = new Set\(widgetsState\.items\.map\(\(item\) => item\.id\)\);/);
    assert.match(code, /find\(\(item\) => !previousIds\.has\(item\.id\)\)/);
    assert.ok(code.indexOf("const previousIds") < code.indexOf("await widgetsService.addFavorite(payload)"));
  });

  it("uses the Widgets terminology and names the metric controls", async () => {
    const code = await source();
    assert.match(code, /"Manage widgets"/);
    assert.match(code, /createNode\("h2", null, "Widgets"\)/);
    assert.match(code, /`Show \$\{label\}`/);
    assert.match(code, /`\$\{label\} tile size`/);
  });

  it("orders the weather status by priority: no APIs, ensure failed, error, stale", async () => {
    const code = await source();
    const model = code.slice(code.indexOf("function weatherStatusModel()"));
    const positions = [
      "Chrome APIs for weather are unavailable.",
      "widgetsEnsureFailed",
      'view?.status === "error"',
      'view?.status === "stale"'
    ].map((needle) => model.indexOf(needle));
    assert.ok(positions.every((position) => position >= 0), positions.join());
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  });

  it("shares one move-button rule between build and in-place sync, and syncs controls only when no metric write is pending", async () => {
    const code = await source();
    assert.ok((code.match(/moveButtonDisabled\(/g) ?? []).length >= 5);
    assert.match(code, /querySelectorAll\('\[data-favorite-action\^="move-"\]'\)/);
    assert.match(code, /metricWritesPending \+= 1;/);
    assert.match(code, /metricWritesPending -= 1;\s*if \(metricWritesPending === 0\) syncMetricRows\(\);/);
  });

  it("keeps metric move errors in the metric slot", async () => {
    const code = await source();
    assert.match(code, /startsWith\("weather:"\)\) \{\s*metricErrorText = message;/);
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
    assert.match(code, /document\.body\.appendChild\(cityModalRoot\);/);
    assert.match(code, /cityModalRoot\.remove\(\);/);
  });

  it("makes the bar and the panel inert while the modal is open and restores them on close", async () => {
    const code = await source();
    const show = between(code, "function showCityModal(", "function hideCityModal(");
    const hide = between(code, "function hideCityModal(", "function onFirstRunDismissed(");
    assert.match(show, /favoritesRoot\.inert = true;/);
    assert.match(show, /favoritesPanelRoot\.inert = true;/);
    assert.match(show, /hideTooltip\(\);/);
    assert.match(hide, /favoritesRoot\.inert = false;/);
    assert.match(hide, /favoritesPanelRoot\.inert = false;/);
    assert.match(hide, /cityModalHadFocus/);
  });

  it("focuses the field only in change mode and returns focus to the opener, looked up at close time", async () => {
    const code = await source();
    const show = between(code, "function showCityModal(", "function hideCityModal(");
    assert.match(show, /if \(mode === "change"\) cityModalRoot\.querySelector\(CITY_INPUT_SELECTOR\)\?\.focus\(\);/);
    assert.match(code, /pendingFocus = \[cityModalOpener, OPEN_CITY_MODAL_SELECTOR, GEAR_SELECTOR\]\.filter\(Boolean\);/);
    assert.match(code, /showCityModal\("change", HINT_TILE_SELECTOR\)/);
    assert.match(code, /const HINT_TILE_SELECTOR = '\[data-widget-id="weather:hint"\]';/);
    assert.doesNotMatch(code, /CHANGE_CITY_SELECTOR/);
  });

  it("orders the single Escape handler: tooltip, suggestions, modal, then the panel", async () => {
    const code = await source();
    const handler = between(code, 'if (event.key !== "Escape")', 'addEventListener("pointerdown"');
    const order = ["hideTooltipIfVisible()", "isSuggestionsOpen(weatherUi)", "cityModalRoot", "favoritesBusy"].map((n) => handler.indexOf(n));
    assert.ok(order.every((i) => i >= 0), order.join());
    assert.deepEqual([...order].sort((a, b) => a - b), order);
    assert.match(handler, /if \(cityModalRoot\) \{\s*if \(!weatherBusy\) hideCityModal\(\{ dismiss: true \}\);\s*return;\s*\}/);
  });

  it("never closes the panel on an outside pointerdown while the modal is open", async () => {
    const code = await source();
    assert.match(code, /addEventListener\("pointerdown", \(event\) => \{\s*if \(cityModalRoot\) return;/);
  });

  it("traps Tab inside the modal and leaves suggestion buttons out of the cycle", async () => {
    const code = await source();
    const trap = between(code, 'if (event.key !== "Tab" || !cityModalRoot) return;', "});");
    assert.match(trap, /el\.dataset\.weatherAction !== "select-city"/);
    assert.match(trap, /!el\.disabled/);
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

  it("runs a city change without rebuilding the panel, with a timeout, clearing suggestions first", async () => {
    const code = await source();
    const change = between(code, "function changeCity(run)", "favoritesPanelRoot?.addEventListener(\"click\"");
    assert.doesNotMatch(change, /renderFavoritesPanel\(\)/);
    assert.match(change, /activeCityForm\?\.cancelPending\(\);/);
    assert.match(change, /activeCityForm\?\.renderSuggestions\(\);/);
    assert.match(change, /await withTimeout\(run\(\)\)/);
    assert.match(change, /weatherLocationError = "";/);
    assert.match(change, /cityModalError = "";\s*syncCityModal\(\);\s*renderFavoritesToolbar\(\);/);
    assert.match(code, /const CITY_REQUEST_TIMEOUT_MS = 15000;/);
    assert.match(code, /The request took too long\. Check your connection and try again\./);
  });

  it("builds the modal with text-only buttons, a novalidate form and the approved strings, never innerHTML", async () => {
    const code = await source();
    const modal = between(code, "function createCityForm(mode)", "function createWeatherMetricTile(");
    assert.doesNotMatch(modal, /innerHTML/);
    assert.doesNotMatch(modal, /createIconButton\(/);
    assert.match(modal, /form\.noValidate = true;/);
    assert.doesNotMatch(modal, /input\.required/);
    assert.match(modal, /input\.value = "";/);
    assert.match(modal, /errorNode\.setAttribute\("role", "alert"\);/);
    for (const text of ["Enter a city name", "Show weather on your new tab?", "Not now", "Change city", "Set a city", "No city set.", "Current: "]) {
      assert.ok(code.includes(text), text);
    }
  });

  it("styles the modal above the panel and tooltip, with a readable placeholder and a visible focus ring", async () => {
    const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");
    assert.match(css, /\.city-modal \{[^}]*position: fixed;[^}]*z-index: 100;/s);
    assert.match(css, /\.city-modal__backdrop \{[^}]*background: rgb\(0 0 0 \/ 50%\);/s);
    assert.match(css, /\.city-modal__dialog \{[^}]*width: min\(420px, calc\(100vw - 32px\)\);[^}]*max-height: calc\(100vh - 32px\);[^}]*overflow-y: auto;/s);
    assert.match(css, /\.city-modal \.favorite-input::placeholder \{[^}]*color: var\(--muted\);[^}]*opacity: 1;/s);
    assert.match(css, /\.city-modal :is\(button, input\):focus-visible \{[^}]*outline: 2px solid var\(--text\);[^}]*outline-offset: 2px;/s);
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
    assert.match(body, /^function maybeAutoShowCityPrompt\(\{ flagRead, dismissed \}\) \{\s*if \(cityModalRoot\) return;/);
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
