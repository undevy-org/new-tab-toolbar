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
});
