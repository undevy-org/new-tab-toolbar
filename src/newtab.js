import {
  extractImageBackgroundColor,
  fallbackColorForDomain,
  hexToRgbChannels,
  normalizeAccentLightness
} from "./favoriteColor.js";
import { getFavoriteIconModel, getFavoriteLetter } from "./favoriteIcon.js";
import { createIconNode } from "./icons.js";
import {
  cancelForm,
  closeSettings,
  createInitialFavoritesUiState,
  editingId,
  isAdding,
  isFormOpen,
  isSettingsOpen,
  openSettings,
  startAdd,
  startEdit
} from "./favoritesUiState.js";
import { createWidgetsService } from "./widgetsService.js";
import {
  WIDGETS_META_KEY,
  createWidgetsStore,
  ensureWeatherMetrics,
  inspectWidgetsMeta,
  migrateToWidgets
} from "./widgetsStore.js";
import { gridLayout, moveTargetIndex, panelDock, placeTooltip, tileSpan } from "./widgetsLayout.js";
import {
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS,
  NEWER_WIDGETS_MESSAGE,
  weatherMetricKey
} from "./widgetsShared.js";
import { searchCities } from "./weatherApi.js";
import { createWeatherService } from "./weatherService.js";
import { shouldAutoShowCityPrompt } from "./cityPrompt.js";
import { createWeatherCacheStore, createWeatherLocationStore, createWeatherPromptStore } from "./weatherStore.js";
import { describeWeatherMetric } from "./weatherTiles.js";
import {
  cityModalMode,
  citySuggestions,
  closeCityModal as closeCityModalState,
  createInitialWeatherUiState,
  hideSuggestions,
  isCityModalOpen,
  isSuggestionsOpen,
  openCityModal as openCityModalState,
  showSuggestions
} from "./weatherUiState.js";

const favoritesRoot = document.querySelector("#favorites");
const favoritesPanelRoot = document.querySelector("#favorites-panel");

// The settings panel must never cover the bar it configures. Read-only measurement of the
// bar: publish which edge the panel docks to and the height that is free on that side.
const PANEL_MIN_HEIGHT = 200;
const PANEL_BAR_GAP = 12;

function publishPanelDock() {
  if (!favoritesRoot || !favoritesPanelRoot) {
    return;
  }

  const inset =
    Number.parseFloat(getComputedStyle(favoritesPanelRoot).getPropertyValue("--panel-inset")) || 16;
  const bar = favoritesRoot.getBoundingClientRect();
  const { dock, maxHeight } = panelDock({
    position: favoritesRoot.dataset.position ?? "top",
    barTop: bar.top,
    barBottom: bar.bottom,
    viewportHeight: window.innerHeight,
    inset,
    gap: PANEL_BAR_GAP,
    minHeight: PANEL_MIN_HEIGHT
  });
  favoritesPanelRoot.dataset.dock = dock;
  favoritesPanelRoot.style.setProperty("--panel-max-height", `${Math.floor(maxHeight)}px`);
}

if (favoritesRoot && favoritesPanelRoot && typeof ResizeObserver === "function") {
  new ResizeObserver(publishPanelDock).observe(favoritesRoot);
  window.addEventListener("resize", publishPanelDock);
}

function createNode(tagName, className, textContent) {
  const node = document.createElement(tagName);

  if (className) {
    node.className = className;
  }

  if (textContent !== undefined) {
    node.textContent = textContent;
  }

  return node;
}

// One shared tooltip for every trigger, appended to body so no scrolling container clips it.
const tooltipLayer = createNode("div", "tooltip");
tooltipLayer.id = "tooltip";
tooltipLayer.setAttribute("role", "tooltip");
tooltipLayer.hidden = true;
document.body.appendChild(tooltipLayer);

let tooltipTrigger = null;
let suppressTooltipOnFocus = false;
let ignoreScrollUntil = 0;

function hideTooltip() {
  tooltipLayer.hidden = true;
  tooltipTrigger = null;
}

function hideTooltipIfVisible() {
  if (tooltipLayer.hidden) return false;
  hideTooltip();
  return true;
}

function showTooltipFor(trigger) {
  const text = trigger.querySelector("[data-tooltip-text]")?.textContent;
  if (!text) return;
  tooltipTrigger = trigger;
  tooltipLayer.textContent = text;
  tooltipLayer.style.visibility = "hidden";
  tooltipLayer.hidden = false;
  const t = trigger.getBoundingClientRect();
  const w = tooltipLayer.getBoundingClientRect();
  const { left, top } = placeTooltip({
    trigger: { top: t.top, bottom: t.bottom, left: t.left, width: t.width },
    tooltip: { width: w.width, height: w.height },
    viewport: { width: window.innerWidth, height: window.innerHeight }
  });
  tooltipLayer.style.left = `${left}px`;
  tooltipLayer.style.top = `${top}px`;
  tooltipLayer.style.visibility = "";
}

const tooltipTriggerOf = (event) =>
  event.target instanceof Element ? event.target.closest("[data-tooltip-trigger]") : null;

favoritesRoot?.addEventListener("pointerover", (event) => {
  const trigger = tooltipTriggerOf(event);
  if (trigger && trigger !== tooltipTrigger) showTooltipFor(trigger);
});
favoritesRoot?.addEventListener("pointerout", (event) => {
  const trigger = tooltipTriggerOf(event);
  if (trigger && trigger === tooltipTrigger && !trigger.contains(event.relatedTarget)) hideTooltip();
});
favoritesRoot?.addEventListener("focusin", (event) => {
  if (suppressTooltipOnFocus) return;
  const trigger = tooltipTriggerOf(event);
  if (!trigger || !trigger.matches(":focus-visible")) return;
  ignoreScrollUntil = performance.now() + 250; // the browser may scroll the tile into view
  requestAnimationFrame(() => {
    if (document.activeElement === trigger) showTooltipFor(trigger);
  });
});
favoritesRoot?.addEventListener("focusout", (event) => {
  if (tooltipTriggerOf(event) === tooltipTrigger) hideTooltip();
});
favoritesRoot?.addEventListener(
  "scroll",
  () => {
    if (performance.now() >= ignoreScrollUntil) hideTooltip();
  },
  true
);
favoritesRoot?.addEventListener("wheel", hideTooltip, { passive: true });
favoritesRoot?.addEventListener("touchmove", hideTooltip, { passive: true });
window.addEventListener("resize", hideTooltip);

function createStatus(text, { error = false, live = "polite", full = false } = {}) {
  const status = createNode(
    "p",
    `${error ? "status status--error" : "status"}${full ? " status--full" : ""}`,
    text
  );

  status.setAttribute("role", error ? "alert" : "status");
  status.setAttribute("aria-live", live);
  return status;
}


const chromeApi = globalThis.chrome;
const localStorageArea = chromeApi?.storage?.local;
const syncStorageArea = chromeApi?.storage?.sync;
const faviconBaseUrl =
  typeof chromeApi?.runtime?.getURL === "function"
    ? chromeApi.runtime.getURL("/_favicon/")
    : "";

function hasStorageArea(area) {
  return area && typeof area.get === "function" && typeof area.set === "function";
}

const widgetsStore = hasStorageArea(syncStorageArea)
  ? createWidgetsStore(syncStorageArea)
  : null;

const widgetsService = widgetsStore
  ? createWidgetsService({
      store: widgetsStore,
      defaultBackgroundColor: fallbackColorForDomain
    })
  : null;

const weatherLocationStore = hasStorageArea(syncStorageArea)
  ? createWeatherLocationStore(syncStorageArea)
  : null;
const weatherCacheStore = hasStorageArea(localStorageArea)
  ? createWeatherCacheStore(localStorageArea)
  : null;
const weatherPromptStore = hasStorageArea(localStorageArea) ? createWeatherPromptStore(localStorageArea) : null;
const weatherService =
  weatherLocationStore && weatherCacheStore
    ? createWeatherService({
        locationStore: weatherLocationStore,
        cacheStore: weatherCacheStore
      })
    : null;

let widgetsState = null;
// Set when the legacy → widgets migration fails. The favorites UI is then locked (no
// gear, no mutations): an editable empty grid would let the user create widgets meta,
// after which the still-present legacy data would be treated as stale and deleted.
let widgetsMigrationFailed = false;
let favoritesUi = createInitialFavoritesUiState();
let favoritesError = "";
let favoritesBusy = false;
let favoritesGeneration = 0;
// Selectors to try, in order, once the next non-busy render has finished, so keyboard focus
// never falls back to <body> after a re-render replaced the control that had it.
let pendingFocus = null;
let weatherResult = null;
let weatherLocation = null;
let weatherLocationError = "";
let weatherLocationKnown = false;
let weatherChanging = false;
let weatherGeneration = 0;
let widgetsEnsureFailed = false;
let widgetsNewer = false;
let metricWritesPending = 0; // metric writes in flight; controls are re-synced only when none is
let metricErrorText = ""; // write-error slot of the metric controls; module state so a panel rebuild keeps it
let activeCityForm = null; // { cancelPending, renderSuggestions, refresh, place, focusField, dispose, choose, chosen, recentlyChosen } of the mounted city form
let weatherUi = createInitialWeatherUiState();
let weatherBusy = false;
let weatherFormGeneration = 0;
// The city modal (present in the DOM only while open) and what it needs across renders.
let cityModalRoot = null;
let cityModalOpener = null; // selector of the control that opened it, looked up again at close time
let cityModalError = "";
let cityModalOpenedAt = 0;
let cityModalHadFocus = false; // D14: focus was inside the modal at some point since it opened
const CITY_MODAL_BACKDROP_GUARD_MS = 300;
const CITY_REQUEST_TIMEOUT_MS = 15000;

function effectiveWeatherResult() {
  // Changing an existing city shows loading; the first city keeps the hint tile until the request finishes.
  if (weatherChanging && currentLocation()) return null;
  if (weatherResult) return weatherResult;
  if (weatherLocationError) return { status: "error", location: null, data: null, error: weatherLocationError };
  if (weatherLocationKnown && !weatherLocation) return { status: "no-location", location: null, data: null, error: null };
  return null;
}
const currentLocation = () => weatherResult?.location ?? weatherLocation;

function createFavoriteLetterNode(item, source) {
  const span = createNode("span", "favorite-letter", getFavoriteLetter(item));
  span.dataset.iconSource = source;
  return span;
}

function createFavoriteIconNode(model, item) {
  if (model.type === "image") {
    const image = createNode("img", "favorite-icon");
    image.src = model.src;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.dataset.iconSource = item.iconMode === "custom" ? "custom" : "favicon";
    image.addEventListener("error", () => {
      image.replaceWith(createFavoriteLetterNode(item, "letter"));
    });
    return image;
  }

  return createFavoriteLetterNode(item, "letter");
}

function createFavoriteTile(item, columns) {
  const button = createNode("button", "favorite-tile");
  const iconModel = getFavoriteIconModel(item, { faviconBaseUrl });

  button.type = "button";
  button.dataset.favoriteAction = "open";
  button.dataset.favoriteId = item.id;
  button.dataset.widgetId = item.id;
  button.dataset.tileSize = tileSpan(item.tileSize, columns) === 2 ? "wide" : "square";
  button.title = item.label;
  button.setAttribute("aria-label", `Open ${item.label}`);
  button.style.setProperty(
    "--favorite-accent-rgb",
    hexToRgbChannels(normalizeAccentLightness(item.backgroundColor))
  );
  button.appendChild(createFavoriteIconNode(iconModel, item));

  const tileDisabled = favoritesBusy || isFormOpen(favoritesUi);
  button.disabled = tileDisabled;
  button.setAttribute("aria-disabled", String(tileDisabled));
  return button;
}

function createFavoritesGear() {
  const gear = createNode("button", "favorite-settings");
  gear.type = "button";
  gear.dataset.favoriteAction = "open-settings";
  gear.setAttribute("aria-label", "Manage widgets");
  gear.setAttribute("aria-expanded", String(isSettingsOpen(favoritesUi)));
  gear.setAttribute("aria-controls", "favorites-panel");
  gear.disabled = favoritesBusy;
  gear.setAttribute("aria-disabled", String(favoritesBusy));
  gear.appendChild(createIconNode("settings", { size: 20 }));
  return gear;
}

function createSegmentedControl(name, options, selectedValue) {
  const group = createNode("div", "segmented");
  group.setAttribute("role", "radiogroup");

  for (const [value, text] of options) {
    const option = createNode("label", "segmented__option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = value === selectedValue;
    option.appendChild(input);
    option.appendChild(createNode("span", null, text));
    group.appendChild(option);
  }

  return group;
}

let formRowIdSeq = 0;

function createFormRow(labelText, control) {
  const row = createNode("div", "favorite-form__row");
  const labelSpan = createNode("span", "favorite-form__row-label", labelText);
  labelSpan.id = `favorite-form-row-label-${formRowIdSeq++}`;
  row.append(labelSpan, control);

  const labelTarget =
    control.tagName === "INPUT" || control.getAttribute("role") === "radiogroup"
      ? control
      : control.querySelector('input, [role="radiogroup"]');
  labelTarget?.setAttribute("aria-labelledby", labelSpan.id);

  return row;
}

function createIconButton(className, text, iconName) {
  const button = createNode("button", className);
  button.append(createIconNode(iconName), document.createTextNode(text));
  return button;
}

function createFavoriteForm(item) {
  const isEdit = item !== null;
  const form = createNode("form", "favorite-form");
  form.dataset.favoriteForm = isEdit ? "edit" : "add";
  if (isEdit) {
    form.dataset.favoriteId = item.id;
  }

  const url = createNode("input", "favorite-input");
  url.name = "url";
  url.type = "text";
  url.inputMode = "url";
  url.value = isEdit ? item.url : "";
  url.placeholder = "https://example.com";
  url.required = true;
  url.autocomplete = "url";

  const label = createNode("input", "favorite-input");
  label.name = "label";
  label.type = "text";
  label.value = isEdit ? item.label : "";
  label.placeholder = isEdit ? item.domain : "Optional";

  const iconMode = createSegmentedControl(
    "iconMode",
    [
      ["favicon", "From site"],
      ["letter", "Letter"],
      ["custom", "Custom"]
    ],
    isEdit ? item.iconMode : "favicon"
  );

  const customIconUrl = createNode("input", "favorite-input");
  customIconUrl.name = "customIconUrl";
  customIconUrl.type = "text";
  customIconUrl.inputMode = "url";
  customIconUrl.value = isEdit ? item.customIconUrl ?? "" : "";
  customIconUrl.placeholder = "https://example.com/icon.png";
  const customIconRow = createFormRow("Custom icon", customIconUrl);
  customIconRow.classList.add("favorite-form__row--custom-icon");

  const backgroundColorSource = createSegmentedControl(
    "backgroundColorSource",
    [
      ["auto", "Auto"],
      ["manual", "Manual"]
    ],
    isEdit ? item.backgroundColorSource : "auto"
  );

  const color = createNode("input", "favorite-color-input");
  color.name = "backgroundColor";
  color.type = "color";
  color.value = isEdit ? item.backgroundColor : "#24292f";

  const colorControls = createNode("div", "favorite-form__color-controls");
  colorControls.append(backgroundColorSource, color);
  const colorRow = createFormRow("Color", colorControls);

  const tileSize = createSegmentedControl(
    "tileSize",
    [
      ["square", "Square"],
      ["wide", "Wide 2:1"]
    ],
    isEdit ? item.tileSize ?? "square" : "square"
  );

  const footer = createNode("div", "favorite-form__footer");

  if (isEdit) {
    const remove = createIconButton("button button--danger", "Delete", "trash2");
    remove.type = "button";
    remove.dataset.favoriteAction = "delete";
    remove.dataset.favoriteId = item.id;
    remove.disabled = favoritesBusy;
    footer.appendChild(remove);
  }

  const cancel = createIconButton("button", "Cancel", "x");
  cancel.type = "button";
  cancel.dataset.favoriteAction = "cancel";
  cancel.disabled = favoritesBusy;

  const save = createIconButton(
    "button button--primary",
    isEdit ? "Save" : "Add",
    "check"
  );
  save.type = "submit";
  save.disabled = favoritesBusy;

  footer.append(cancel, save);

  form.append(
    createFormRow("Link", url),
    createFormRow("Name", label),
    createFormRow("Icon", iconMode),
    customIconRow,
    colorRow,
    createFormRow("Tile size", tileSize),
    footer
  );

  return form;
}

function readFavoriteFormPayload(data) {
  const backgroundColorSource =
    data.get("backgroundColorSource") === "manual" ? "manual" : "auto";
  const payload = {
    url: data.get("url"),
    label: data.get("label"),
    iconMode: data.get("iconMode"),
    customIconUrl: data.get("customIconUrl"),
    backgroundColorSource,
    tileSize: data.get("tileSize") === "wide" ? "wide" : "square"
  };

  if (backgroundColorSource === "manual") {
    payload.backgroundColor = data.get("backgroundColor");
  }

  return payload;
}

function loadBrowserImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}

function createBrowserCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function resolveAutoBackgroundColor(item) {
  const fallback = fallbackColorForDomain(item.domain);
  const iconModel = getFavoriteIconModel(item, { faviconBaseUrl });

  if (!iconModel.sampleable) {
    return fallback;
  }

  return (
    (await extractImageBackgroundColor(iconModel.src, {
      loadImage: loadBrowserImage,
      createCanvas: createBrowserCanvas
    })) ?? fallback
  );
}

async function refreshAutoAccent(id) {
  if (!widgetsService || !id) {
    return;
  }

  const item = widgetsState?.items.find((entry) => entry.id === id);
  if (!item) {
    return;
  }

  try {
    const autoColor = await resolveAutoBackgroundColor(item);

    // Re-read the item after the async resolve: the user may have switched it to
    // manual (or deleted it) while the favicon was being fetched/analyzed. A late
    // auto write must never clobber a manual color the user just chose.
    const current = widgetsState?.items.find((entry) => entry.id === id);
    if (!current || current.backgroundColorSource !== "auto") {
      return;
    }

    if (autoColor === current.backgroundColor) {
      return;
    }

    const nextState = await widgetsService.updateFavorite(id, {
      backgroundColor: autoColor,
      backgroundColorSource: "auto"
    });

    widgetsState = nextState;
    renderFavorites();
  } catch {
    // Auto-accent is best-effort; a canvas/CORS failure keeps the fallback accent
    // and must never disturb the displayed icon.
  }
}

const GRID_POSITION_LABELS = { top: "Top", center: "Center", bottom: "Bottom" };

function createGridSettingsRow(state) {
  const section = createNode("div", "favorites-panel__grid-settings favorite-form");

  const columns = createNode("input", "favorite-input");
  columns.type = "number";
  columns.name = "columns";
  columns.min = String(MIN_GRID_COLUMNS);
  columns.max = String(MAX_GRID_COLUMNS);
  columns.step = "1";
  columns.value = String(state.columns);
  columns.dataset.gridSetting = "columns";

  const position = createSegmentedControl(
    "position",
    ["top", "center", "bottom"].map((value) => [value, GRID_POSITION_LABELS[value]]),
    state.position
  );
  for (const input of position.querySelectorAll("input")) {
    input.dataset.gridSetting = "position";
  }

  const error = createNode("p", "status status--error");
  error.dataset.gridError = "";
  error.setAttribute("role", "alert");
  error.hidden = true;

  section.append(createFormRow("Columns", columns), createFormRow("Position", position), error);
  return section;
}

// Puts the controls back in line with the stored state after a change succeeded (the
// service normalizes input like " 5 ") or was rejected.
function syncGridSettingInputs() {
  if (!favoritesPanelRoot || !widgetsState) {
    return;
  }

  const columns = favoritesPanelRoot.querySelector('[data-grid-setting="columns"]');
  if (columns instanceof HTMLInputElement) {
    columns.value = String(widgetsState.columns);
  }
  for (const radio of favoritesPanelRoot.querySelectorAll('[data-grid-setting="position"]')) {
    if (radio instanceof HTMLInputElement) {
      radio.checked = radio.value === widgetsState.position;
    }
  }
}

// Single rule for the earlier/later buttons, used at build time and when Show/size changes re-sync in place.
function moveButtonDisabled(items, item, action) {
  if (favoritesBusy || isFormOpen(favoritesUi)) return true;
  return moveTargetIndex(items, items.indexOf(item), action === "move-earlier" ? -1 : 1) === -1;
}

function createFavoritesPanelRow(item, items) {
  const row = createNode("div", "favorites-panel__row");

  const info = createNode("div", "favorites-panel__item");
  info.appendChild(createFavoriteIconNode(getFavoriteIconModel(item, { faviconBaseUrl }), item));
  const text = createNode("div");
  text.appendChild(createNode("strong", null, item.label));
  text.appendChild(createNode("span", null, item.domain));
  info.appendChild(text);

  const controls = createNode("div", "favorites-panel__controls");
  const disabled = favoritesBusy || isFormOpen(favoritesUi);

  const earlier = createNode("button", "icon-button");
  earlier.type = "button";
  earlier.dataset.favoriteAction = "move-earlier";
  earlier.dataset.favoriteId = item.id;
  earlier.setAttribute("aria-label", `Move ${item.label} earlier`);
  earlier.disabled = moveButtonDisabled(items, item, "move-earlier");
  earlier.appendChild(createIconNode("chevronUp"));

  const later = createNode("button", "icon-button");
  later.type = "button";
  later.dataset.favoriteAction = "move-later";
  later.dataset.favoriteId = item.id;
  later.setAttribute("aria-label", `Move ${item.label} later`);
  later.disabled = moveButtonDisabled(items, item, "move-later");
  later.appendChild(createIconNode("chevronDown"));

  const edit = createNode("button", "icon-button");
  edit.type = "button";
  edit.dataset.favoriteAction = "edit";
  edit.dataset.favoriteId = item.id;
  edit.setAttribute("aria-label", `Edit ${item.label}`);
  edit.disabled = disabled;
  edit.appendChild(createIconNode("pencil"));

  controls.append(earlier, later, edit);
  row.append(info, controls);
  return row;
}

const METRIC_LABELS = { temperature: "Temperature", precipitation: "Precipitation", airQuality: "Air quality", uv: "UV index" };

function createMetricMoveButtons(item, items) {
  const make = (action, label, icon) => {
    const button = createNode("button", "icon-button");
    button.type = "button";
    button.dataset.favoriteAction = action;
    button.dataset.favoriteId = item.id;
    button.setAttribute("aria-label", `Move ${label} ${action === "move-earlier" ? "earlier" : "later"}`);
    button.disabled = moveButtonDisabled(items, item, action);
    button.appendChild(createIconNode(icon));
    return button;
  };
  const label = METRIC_LABELS[weatherMetricKey(item.id)];
  return [
    make("move-earlier", label, "chevronUp"),
    make("move-later", label, "chevronDown")
  ];
}

function createWeatherMetricRow(item, items) {
  const label = METRIC_LABELS[weatherMetricKey(item.id)];
  const row = createNode("div", "favorites-panel__row");
  row.dataset.metricRow = "";
  row.dataset.metricId = item.id;

  const info = createNode("div", "favorites-panel__item");
  const text = createNode("div");
  text.appendChild(createNode("strong", null, label));
  const badge = createNode("span", "badge", "Hidden");
  badge.dataset.hiddenBadge = "";
  text.appendChild(badge);
  info.appendChild(text);

  const controls = createNode("div", "favorites-panel__controls");
  const show = createNode("label", "metric-show");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.metricSetting = "enabled";
  checkbox.dataset.metricId = item.id;
  checkbox.setAttribute("aria-label", `Show ${label}`);
  show.append(checkbox, createNode("span", null, "Show"));

  const size = createSegmentedControl(`tileSize-${item.id}`, [["square", "Square"], ["wide", "Wide 2:1"]], item.tileSize);
  size.setAttribute("aria-label", `${label} tile size`);
  for (const input of size.querySelectorAll("input")) {
    input.dataset.metricSetting = "tileSize";
    input.dataset.metricId = item.id;
  }

  controls.append(show, size, ...createMetricMoveButtons(item, items));
  row.append(info, controls);
  applyMetricRowState(row, item);
  return row;
}

function applyMetricRowState(row, item) {
  row.dataset.hidden = String(!item.enabled);
  row.querySelector("[data-hidden-badge]").hidden = item.enabled;
  row.querySelector('[data-metric-setting="enabled"]').checked = item.enabled;
  for (const radio of row.querySelectorAll('[data-metric-setting="tileSize"]')) radio.checked = radio.value === item.tileSize;
}

// In-place sync so an open add/edit form keeps its contents and focus stays on the used control.
function syncMetricRows() {
  const items = widgetsState?.items ?? [];
  for (const button of favoritesPanelRoot?.querySelectorAll('[data-favorite-action^="move-"]') ?? []) {
    const item = items.find((entry) => entry.id === button.dataset.favoriteId);
    if (item) button.disabled = moveButtonDisabled(items, item, button.dataset.favoriteAction);
  }
  for (const row of favoritesPanelRoot?.querySelectorAll("[data-metric-row]") ?? []) {
    const item = widgetsState?.items.find((entry) => entry.id === row.dataset.metricId);
    if (item) applyMetricRowState(row, item);
  }
}

function showMetricError(message) {
  metricErrorText = message; // module state: survives a panel rebuild, cleared by the next successful metric action
  const node = favoritesPanelRoot?.querySelector("[data-metric-error]");
  if (!node) return;
  node.textContent = message;
  node.hidden = message === "";
}

const POPOVER_MAX_HEIGHT = 240;
const POPOVER_MIN_FREE = 96;
const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 16;

function createCityForm(mode) {
  weatherFormGeneration += 1;
  const formGeneration = weatherFormGeneration;
  weatherUi = hideSuggestions(weatherUi);

  const form = createNode("form", "weather-form");
  form.dataset.weatherForm = "city";
  form.noValidate = true;

  const field = createNode("div", "weather-form__field");

  const input = createNode("input", "favorite-input");
  input.name = "city";
  input.type = "text";
  input.id = "weather-city-input";
  input.placeholder = "Search for a city";
  input.setAttribute("aria-label", "City");
  input.value = "";
  input.autocomplete = "off";
  input.disabled = weatherBusy;

  const clear = createNode("button", "icon-button weather-form__clear");
  clear.type = "button";
  clear.dataset.cityModalClear = "";
  clear.setAttribute("aria-label", "Clear city");
  clear.appendChild(createIconNode("x"));
  clear.hidden = true;

  const suggestionsList = createNode("div", "weather-form__suggestions");
  field.append(input, clear, suggestionsList);

  const errorNode = createNode("p", "status status--error status--full", cityModalError);
  errorNode.dataset.cityModalError = "";
  errorNode.setAttribute("role", "alert");
  errorNode.hidden = cityModalError === "";

  const actions = createNode("div", "city-modal__actions");
  const dismiss = createIconButton("button", mode === "first-run" ? "Not now" : "Cancel", "x");
  dismiss.type = "button";
  dismiss.dataset.cityModalAction = mode === "first-run" ? "dismiss" : "cancel";
  dismiss.disabled = weatherBusy;
  const save = createIconButton("button button--primary", "Save", "check");
  save.type = "submit";
  actions.append(dismiss, save);

  form.append(field, errorNode, actions);

  // Save needs text; Clear needs text and no running request.
  function refresh() {
    const empty = input.value.trim() === "";
    save.disabled = weatherBusy || empty;
    clear.hidden = weatherBusy || input.value === "";
    clear.disabled = weatherBusy;
  }

  // Overlay popover while there is room below the input; otherwise docked in the dialog's flow with a scrolling dialog.
  // The free space is measured as if the popover were an overlay: the docked class and the scroll cap are dropped for the
  // measurement (layout is flushed, nothing is painted in between), so the result depends neither on the current mode nor on the
  // dialog's scroll position and the mode cannot flip back and forth. It is measured from the INPUT's bottom edge, not from
  // the field wrapper, because the wrapper contains the list while it is docked. A dialog that does not fit the viewport on
  // its own (a very low window, large zoom) scrolls in every mode, also before the first suggestion appears.
  function placePopover() {
    const dialog = field.closest(".city-modal__dialog");
    if (!dialog) return;
    const scrollTop = dialog.scrollTop;
    suggestionsList.classList.remove("weather-form__suggestions--docked");
    dialog.classList.remove("city-modal__dialog--scroll");
    const free = window.innerHeight - input.getBoundingClientRect().bottom - POPOVER_GAP - VIEWPORT_MARGIN;
    const tooTall = dialog.getBoundingClientRect().height > window.innerHeight - 2 * VIEWPORT_MARGIN;
    const docked = free < POPOVER_MIN_FREE;
    suggestionsList.classList.toggle("weather-form__suggestions--docked", docked);
    dialog.classList.toggle("city-modal__dialog--scroll", docked || tooTall);
    suggestionsList.style.maxHeight = docked ? "" : `${Math.min(POPOVER_MAX_HEIGHT, free)}px`;
    dialog.scrollTop = scrollTop;
  }

  function renderSuggestionsList() {
    suggestionsList.replaceChildren();

    if (!isSuggestionsOpen(weatherUi)) {
      placePopover();
      return;
    }

    for (const suggestion of citySuggestions(weatherUi)) {
      const labelParts = [suggestion.name, suggestion.admin1, suggestion.country].filter((part) => part);
      const label = labelParts.join(", ");
      const button = createNode("button", "weather-form__suggestion", label);
      button.type = "button";
      button.dataset.weatherAction = "select-city";
      button.dataset.cityName = suggestion.name;
      button.dataset.cityCountry = suggestion.country;
      button.dataset.cityLatitude = String(suggestion.latitude);
      button.dataset.cityLongitude = String(suggestion.longitude);
      suggestionsList.appendChild(button);
    }
    placePopover();
  }

  renderSuggestionsList();
  const onResize = placePopover;
  window.addEventListener("resize", onResize);

  suggestionsList.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });

  let debounceTimer = null;
  let abortController = null;

  function cancelPendingSuggestionRequest() {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  input.addEventListener("input", () => {
    const query = input.value.trim();

    cancelPendingSuggestionRequest();
    refresh();

    if (query.length < 2) {
      weatherUi = hideSuggestions(weatherUi);
      renderSuggestionsList();
      return;
    }

    debounceTimer = setTimeout(() => {
      abortController = new AbortController();
      const { signal } = abortController;

      void (async () => {
        let results = null;

        try {
          results = await searchCities(query, {
            fetchImpl: (url) => globalThis.fetch(url, { signal })
          });
        } catch {
          results = null;
        }

        if (signal.aborted || formGeneration !== weatherFormGeneration || weatherBusy || suggestionsList.contains(document.activeElement)) {
          return;
        }

        weatherUi =
          results && results.length > 0
            ? showSuggestions(weatherUi, results)
            : hideSuggestions(weatherUi);
        renderSuggestionsList();
      })();
    }, 250);
  });

  let chosenCity = null;
  let chosenAt = -Infinity; // performance.now() of the last choose()
  let pressing = false; // a pointer press that began inside the dialog and has not been released yet

  function closeList() {
    cancelPendingSuggestionRequest();
    weatherUi = hideSuggestions(weatherUi);
    renderSuggestionsList();
  }

  function closeListIfFocusLeft() {
    if (formGeneration !== weatherFormGeneration || !document.hasFocus()) return;
    if (field.contains(document.activeElement)) return;
    closeList();
  }

  // A pointer press inside the dialog (Save, Not now/Cancel, the dialog body) must not close the list before the click is
  // delivered: in docked mode the buttons would move between press and release and the click would be lost. The list closes
  // after the release instead (setTimeout 0 runs after the click event).
  const onPointerDown = (event) => {
    pressing = event.target instanceof Element && Boolean(event.target.closest(".city-modal__dialog"));
  };
  const onPointerUp = () => {
    if (!pressing) return;
    pressing = false;
    setTimeout(closeListIfFocusLeft, 0);
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);

  // Window focus loss does nothing. Moving focus to something outside the field wrapper cancels the debounce and the request
  // in flight at once (list open or not) and closes the list, unless a pointer press inside the dialog is still going on.
  field.addEventListener("focusout", (event) => {
    if (event.relatedTarget instanceof Node && field.contains(event.relatedTarget)) return;
    if (!document.hasFocus()) return;
    cancelPendingSuggestionRequest();
    if (pressing) return;
    setTimeout(closeListIfFocusLeft, 0);
  });

  // Focus entering the list (ArrowDown, Tab, a click on an item) cancels the pending request too: a response must never
  // replace the list under a focused item.
  suggestionsList.addEventListener("focusin", cancelPendingSuggestionRequest);

  input.addEventListener("input", () => {
    chosenCity = null; // editing drops the remembered choice
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && !weatherBusy && input.value.trim() === "") {
      event.preventDefault(); // a disabled Save blocks the implicit submit, so the field reports the empty case itself
      cityModalError = "Enter a city name";
      syncCityModal();
      return;
    }
    if (event.key === "ArrowDown" && isSuggestionsOpen(weatherUi) && !weatherBusy) {
      event.preventDefault();
      cancelPendingSuggestionRequest();
      suggestionsList.querySelector("button")?.focus();
    }
  });

  suggestionsList.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...suggestionsList.querySelectorAll("button")];
    const at = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") items[at + 1]?.focus();
    else if (at <= 0) input.focus();
    else items[at - 1]?.focus();
  });

  clear.addEventListener("click", () => {
    input.value = "";
    chosenCity = null;
    closeList();
    refresh();
    input.focus();
  });

  refresh();
  activeCityForm = {
    cancelPending: cancelPendingSuggestionRequest,
    renderSuggestions: renderSuggestionsList,
    refresh,
    place: placePopover,
    focusField: () => input.focus(),
    dispose: () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("pointercancel", onPointerUp, true);
    },
    choose(city) {
      closeList(); // cancels the debounce and the in-flight request; late responses are ignored (signal aborted)
      input.value = city.label;
      chosenCity = { name: city.name, country: city.country, latitude: city.latitude, longitude: city.longitude, label: city.label };
      chosenAt = performance.now();
      refresh();
      input.focus();
    },
    chosen: () => (chosenCity && chosenCity.label === input.value ? chosenCity : null),
    recentlyChosen: () => performance.now() - chosenAt < 350
  };
  return form;
}

function buildCityModal(mode, location) {
  const root = createNode("div", "city-modal");
  root.id = "city-modal";
  const backdrop = createNode("div", "city-modal__backdrop");
  backdrop.dataset.cityModalBackdrop = "";
  const dialog = createNode("div", "city-modal__dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "city-modal-title");

  const title = createNode("h2", "city-modal__title", mode === "first-run" ? "Show weather on your new tab?" : location ? "Change city" : "Set a city");
  title.id = "city-modal-title";
  dialog.appendChild(title);

  if (mode === "first-run") {
    const description = createNode(
      "p",
      "city-modal__description",
      "Pick a city to see local weather next to your links. Weather is optional: skip this and you can add a city later in Widgets."
    );
    description.id = "city-modal-description";
    dialog.setAttribute("aria-describedby", description.id);
    dialog.appendChild(description);
  } else if (location) {
    const current = createNode("p", "city-modal__current", `Current: ${location.name}`);
    current.dataset.cityModalCurrent = "";
    dialog.appendChild(current);
  }

  dialog.appendChild(createCityForm(mode));
  root.append(backdrop, dialog);
  return root;
}

// Disables the controls while a city request runs and mirrors the error slot; never rebuilds the form.
function syncCityModal() {
  if (!cityModalRoot) return;
  for (const control of cityModalRoot.querySelectorAll("input, button")) {
    if (control.dataset.weatherAction !== "select-city") control.disabled = weatherBusy;
  }
  activeCityForm?.refresh();
  cityModalRoot.querySelector('[role="dialog"]').setAttribute("aria-busy", String(weatherBusy)); // spec: aria-busy while a request runs
  const errorNode = cityModalRoot.querySelector("[data-city-modal-error]");
  errorNode.textContent = cityModalError;
  errorNode.hidden = cityModalError === "";
  activeCityForm?.place();
}

// One listener per event on the modal root (backdrop, dismiss button, suggestions, submit).
function attachCityModalListeners(root) {
  root.addEventListener("focusin", () => {
    cityModalHadFocus = true;
  });

  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target || weatherBusy) return;
    // The second click of a double click on an item lands on what was under the popover: the backdrop or a covered button
    // (for Save the submit is cancelled too). A keyboard activation (detail 0) is never such a click: Enter on Save saves.
    if (
      event.detail > 0 &&
      activeCityForm?.recentlyChosen() &&
      (target.matches("[data-city-modal-backdrop]") || target.closest('[data-city-modal-action], button[type="submit"]'))
    ) {
      event.preventDefault();
      return;
    }
    // A drag from the field that ends over the backdrop targets the modal root, not the backdrop: ignored.
    if (target.matches("[data-city-modal-backdrop]")) {
      if (performance.now() - cityModalOpenedAt >= CITY_MODAL_BACKDROP_GUARD_MS) hideCityModal({ dismiss: true });
      return;
    }
    if (target.closest("[data-city-modal-action]")) {
      hideCityModal({ dismiss: true });
      return;
    }
    const suggestion = target.closest('[data-weather-action="select-city"]');
    if (suggestion instanceof HTMLElement) {
      activeCityForm?.choose({
        name: suggestion.dataset.cityName,
        country: suggestion.dataset.cityCountry ?? "",
        latitude: Number(suggestion.dataset.cityLatitude),
        longitude: Number(suggestion.dataset.cityLongitude),
        label: suggestion.textContent
      });
      return;
    }
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.weatherForm !== "city") return;
    event.preventDefault();
    if (weatherBusy || !weatherService) return;
    const cityName = String(new FormData(form).get("city") ?? "").trim();
    if (!cityName) {
      cityModalError = "Enter a city name";
      syncCityModal();
      form.querySelector(CITY_INPUT_SELECTOR)?.focus();
      return;
    }
    const picked = activeCityForm?.chosen();
    if (picked) {
      changeCity(() => weatherService.selectLocation({ name: picked.name, country: picked.country, latitude: picked.latitude, longitude: picked.longitude }));
      return;
    }
    changeCity(() => weatherService.setCity(cityName));
  });
}

let cityModalShownThisLoad = false; // the automatic prompt never reopens a modal that was already shown this page load

function showCityModal(mode, openerSelector) {
  if (cityModalRoot || isCityModalOpen(weatherUi) || !weatherService || !document.body) return false; // one modal at a time
  cityModalError = "";
  let root = null;
  try {
    root = buildCityModal(mode, weatherLocationError ? null : currentLocation());
    attachCityModalListeners(root); // before any focus() so the focusin below is seen
    document.body.appendChild(root);
  } catch (error) {
    // Nothing half-open: a failed build must not leave the UI state "open" and block every later open.
    root?.remove();
    activeCityForm = null;
    throw error;
  }
  cityModalRoot = root;
  activeCityForm?.place();
  cityModalShownThisLoad = true;
  weatherUi = openCityModalState(weatherUi, mode);
  cityModalOpener = openerSelector;
  cityModalHadFocus = false;
  cityModalOpenedAt = performance.now();
  hideTooltip();
  if (favoritesRoot) favoritesRoot.inert = true;
  if (favoritesPanelRoot) favoritesPanelRoot.inert = true;
  if (mode === "change") cityModalRoot.querySelector(CITY_INPUT_SELECTOR)?.focus(); // first-run never steals focus
  return true;
}

// `dismiss` is set by Escape/backdrop/"Not now"/"Cancel"; only a first-run dismissal writes the flag (Task 3).
function hideCityModal({ dismiss = false } = {}) {
  if (!cityModalRoot) return;
  const mode = cityModalMode(weatherUi);
  const focusWasInside = cityModalHadFocus || cityModalRoot.contains(document.activeElement); // D14: a running request or a backdrop click may already have moved focus to body
  activeCityForm?.cancelPending();
  activeCityForm?.dispose?.();
  activeCityForm = null;
  weatherFormGeneration += 1; // late suggestion responses are ignored
  cityModalRoot.remove();
  cityModalRoot = null;
  weatherUi = closeCityModalState(weatherUi);
  cityModalError = "";
  cityModalHadFocus = false;
  if (favoritesRoot) favoritesRoot.inert = false;
  if (favoritesPanelRoot) favoritesPanelRoot.inert = false;
  if (dismiss && mode === "first-run") onFirstRunDismissed();
  if (mode === "change") {
    pendingFocus = [cityModalOpener, OPEN_CITY_MODAL_SELECTOR, GEAR_SELECTOR].filter(Boolean);
    applyPendingFocus();
  } else if (focusWasInside) {
    pendingFocus = [GEAR_SELECTOR];
    applyPendingFocus();
  }
  cityModalOpener = null;
}

// D3/D5: any close of the automatic modal records the dismissal; a failed write is silent (the modal shows again next time).
function onFirstRunDismissed() {
  if (weatherPromptStore) void weatherPromptStore.dismiss().catch(() => {});
}

// Evaluated once per page load, after the first grid render, on live state (spec § Storage and the automatic-show rule).
// First-run open never moves focus (D2): showCityModal only focuses in change mode.
function maybeAutoShowCityPrompt({ flagRead, dismissed }) {
  if (cityModalRoot || cityModalShownThisLoad) return; // a modal was opened meanwhile (or already shown and closed): never replace, duplicate or reopen it
  const items = widgetsState?.items ?? [];
  const show = shouldAutoShowCityPrompt({
    locationRead: weatherLocationKnown && !weatherLocationError,
    hasLocation: Boolean(weatherLocation),
    flagRead,
    dismissed,
    anyMetricEnabled: items.some((item) => item.type === "weather-metric" && item.enabled === true),
    weatherAvailable: Boolean(weatherService && weatherPromptStore),
    gridLocked: widgetsNewer || widgetsMigrationFailed
  });
  if (show) showCityModal("first-run", null);
}

function createWeatherMetricTile(item, columns, view) {
  const effectiveSize = tileSpan(item.tileSize, columns) === 2 ? "wide" : "square";
  const model = describeWeatherMetric({ metricKey: weatherMetricKey(item.id), result: view, size: effectiveSize });
  if (!model) return null;

  const tile = createNode("div", "weather-tile");
  tile.dataset.widgetId = item.id;
  tile.dataset.tileSize = effectiveSize;
  tile.tabIndex = 0;
  tile.setAttribute("role", "group");
  tile.setAttribute("aria-label", model.label);
  if (model.tone) tile.dataset.weatherTone = model.tone;
  if (model.stale) tile.dataset.stale = "true";
  if (model.busy) tile.setAttribute("aria-busy", "true");

  const values = createNode("div", "weather-tile__values");
  values.appendChild(createNode("span", "weather-tile__primary", model.primary));
  if (model.secondary) values.appendChild(createNode("span", "weather-tile__secondary", model.secondary));
  const description = createNode("span", "sr-only", model.description);
  description.id = `weather-desc-${weatherMetricKey(item.id)}`;
  description.dataset.tooltipText = "";
  tile.setAttribute("aria-describedby", description.id);
  tile.dataset.tooltipTrigger = "";
  tile.append(values, description);
  return tile;
}

function createCityHintTile(columns) {
  const button = createNode("button", "city-hint-tile");
  const wide = tileSpan("wide", columns) === 2;
  button.type = "button";
  button.dataset.favoriteAction = "set-city";
  button.dataset.widgetId = "weather:hint";
  button.dataset.tileSize = wide ? "wide" : "square";
  button.setAttribute("aria-label", "Set a city");
  if (wide) button.textContent = "Set a city";
  else button.appendChild(createIconNode("plus"));
  return button;
}

function renderFavoritesToolbar() {
  if (!favoritesRoot) {
    return;
  }

  hideTooltip();
  // Every bootstrap exit path (normal, newer meta, failed migration, read error) renders through here, so the bar is never left hidden.
  if (!favoritesRoot.dataset.position) {
    favoritesRoot.dataset.position = gridLayout(widgetsState).position;
  }

  const active = document.activeElement instanceof Element ? document.activeElement : null;
  const focused = active && favoritesRoot.contains(active) ? active.closest("[data-widget-id], .favorite-settings") : null;
  const focusedId = focused ? focused.dataset.widgetId ?? "gear" : null;

  if (widgetsNewer) {
    favoritesRoot.replaceChildren(
      createStatus(NEWER_WIDGETS_MESSAGE, { error: true, live: "assertive", full: true })
    );
    return;
  }

  if (widgetsMigrationFailed) {
    favoritesRoot.replaceChildren(
      createStatus(favoritesError, { error: true, live: "assertive", full: true })
    );
    return;
  }

  const layout = gridLayout(widgetsState);
  favoritesRoot.dataset.position = layout.position;

  const fragment = document.createDocumentFragment();
  const items = widgetsState?.items ?? [];

  const list = createNode("div", "favorites-grid");
  list.style.setProperty("--columns", String(layout.columns));
  const view = weatherService ? effectiveWeatherResult() : undefined;
  let hintPlaced = false;
  for (const item of items) {
    if (item.type === "favorite") {
      list.appendChild(createFavoriteTile(item, layout.columns));
    } else if (item.enabled && weatherService) {
      if (view?.status === "no-location") {
        if (!hintPlaced) {
          list.appendChild(createCityHintTile(layout.columns));
          hintPlaced = true;
        }
      } else {
        const tile = createWeatherMetricTile(item, layout.columns, view);
        if (tile) list.appendChild(tile);
      }
    }
  }
  if (list.childElementCount > 0) {
    fragment.appendChild(list);
  }

  fragment.appendChild(createFavoritesGear());
  favoritesRoot.replaceChildren(fragment);

  if (focusedId) {
    const again =
      focusedId === "gear"
        ? favoritesRoot.querySelector(GEAR_SELECTOR)
        : [...favoritesRoot.querySelectorAll("[data-widget-id]")].find((el) => el.dataset.widgetId === focusedId);
    suppressTooltipOnFocus = true;
    try {
      (again ?? favoritesRoot.querySelector(GEAR_SELECTOR))?.focus();
    } finally {
      suppressTooltipOnFocus = false;
    }
  }
}

const GEAR_SELECTOR = '[data-favorite-action="open-settings"]';
const HEADING_SELECTOR = "[data-panel-heading]";
const ADD_BUTTON_SELECTOR = '[data-favorite-action="start-add"]';

function formFieldSelector(kind) {
  return `form[data-favorite-form="${kind}"] input[name="url"]`;
}

function itemActionSelector(action, id) {
  return `[data-favorite-action="${action}"][data-favorite-id="${String(id).replace(/["\\]/g, "\\$&")}"]`;
}

function renderFavoritesPanel() {
  if (!favoritesPanelRoot) {
    return;
  }

  favoritesPanelRoot.dataset.barPosition = gridLayout(widgetsState).position;
  publishPanelDock();

  const open = isSettingsOpen(favoritesUi);
  favoritesPanelRoot.hidden = !open;

  if (!open) {
    favoritesPanelRoot.replaceChildren();
    return;
  }

  const previousScrollTop =
    favoritesPanelRoot.querySelector(".favorites-panel__body")?.scrollTop ?? 0;

  const fragment = document.createDocumentFragment();
  const items = widgetsState?.items ?? [];

  const top = createNode("div", "favorites-panel__top");
  const heading = createNode("div");
  const title = createNode("h2", null, "Widgets");
  title.tabIndex = -1;
  title.dataset.panelHeading = "";
  heading.appendChild(title);
  heading.appendChild(
    createNode("p", null, "Add, reorder, and style your links and weather tiles.")
  );
  const addButton = createIconButton("button button--primary", "Add link", "plus");
  addButton.type = "button";
  addButton.dataset.favoriteAction = "start-add";
  addButton.disabled = favoritesBusy || isFormOpen(favoritesUi);
  top.append(heading, addButton);
  fragment.appendChild(top);

  // Everything below the heading scrolls together inside the panel.
  const body = createNode("div", "favorites-panel__body");

  if (widgetsState) {
    body.appendChild(createGridSettingsRow(widgetsState));
  }

  const links = items.filter((item) => item.type === "favorite");
  const metrics = items.filter((item) => item.type !== "favorite");

  const linksSection = createNode("section", "links-block panel-section");
  const linksHead = createNode("div", "panel-section__head");
  linksHead.append(createNode("h3", null, "Links"), createNode("span", "links-block__count", String(links.length)));
  linksSection.appendChild(linksHead);

  if (isAdding(favoritesUi)) {
    linksSection.appendChild(createFavoriteForm(null));
  }
  const currentEditingId = editingId(favoritesUi);
  const editingItem = items.find((item) => item.id === currentEditingId);
  if (editingItem) {
    linksSection.appendChild(createFavoriteForm(editingItem));
  }
  if (favoritesError) {
    const errorNode = createStatus(favoritesError, { error: true, live: "assertive" });
    errorNode.dataset.favoritesError = "";
    linksSection.appendChild(errorNode);
  }

  const listWrap = createNode("div", "panel-card favorites-panel__list");
  if (links.length === 0) {
    listWrap.appendChild(createNode("p", "panel-card__empty", "No links yet. Use Add link to create the first one."));
  }
  for (const item of links) {
    listWrap.appendChild(createFavoritesPanelRow(item, items));
  }
  linksSection.appendChild(listWrap);
  body.appendChild(linksSection);

  body.appendChild(createWeatherBlock(metrics, items));
  fragment.appendChild(body);

  favoritesPanelRoot.replaceChildren(fragment);
  body.scrollTop = previousScrollTop;
}

function applyPendingFocus() {
  if (!pendingFocus || favoritesBusy) {
    return;
  }

  const selectors = pendingFocus;
  pendingFocus = null;

  for (const selector of selectors) {
    const target =
      favoritesPanelRoot?.querySelector(selector) ?? favoritesRoot?.querySelector(selector);
    if (target instanceof HTMLElement && !target.matches(":disabled")) {
      target.focus();
      return;
    }
  }
}

function revealFavoritesError() {
  const errorNode = favoritesPanelRoot?.querySelector("[data-favorites-error]");
  if (errorNode instanceof HTMLElement && typeof errorNode.scrollIntoView === "function") {
    errorNode.scrollIntoView({ block: "nearest" });
  }
}

function renderFavorites() {
  renderFavoritesToolbar();
  renderFavoritesPanel();
  applyPendingFocus();
  revealFavoritesError();
}

function setFavoritesBusy(nextBusy) {
  favoritesBusy = nextBusy;
}

function startFavoritesAction() {
  favoritesGeneration += 1;
  setFavoritesBusy(true);
  renderFavorites();
  return favoritesGeneration;
}

function finishFavoritesAction(generation, applyResult) {
  setFavoritesBusy(false);

  if (generation !== favoritesGeneration) {
    return;
  }

  applyResult();
  renderFavorites();
}

if (favoritesRoot) {
  void (async () => {
    if (!widgetsService) {
      favoritesError = "Chrome APIs for favorites are unavailable.";
      renderFavorites();
      return;
    }

    try {
      const rawMeta = hasStorageArea(syncStorageArea)
        ? await syncStorageArea.get(WIDGETS_META_KEY)
        : {};
      if (inspectWidgetsMeta(rawMeta) === "newer") {
        widgetsNewer = true;
        renderFavorites();
        return;
      }

      if (hasStorageArea(localStorageArea) && hasStorageArea(syncStorageArea)) {
        const migration = await migrateToWidgets(localStorageArea, syncStorageArea);
        if (migration?.newer) {
          widgetsNewer = true;
          renderFavorites();
          return;
        }
      }
    } catch (error) {
      widgetsMigrationFailed = true;
      favoritesError =
        "Couldn't move your favorites to the new layout — Chrome Sync storage may be full or unavailable. Free up some sync space, then reload this tab to try again. Your favorites are kept.";
      renderFavorites();
      return;
    }

    if (hasStorageArea(syncStorageArea)) {
      try {
        await ensureWeatherMetrics(syncStorageArea);
      } catch {
        widgetsEnsureFailed = true;
      }
    }

    try {
      widgetsState = await widgetsService.getState();
    } catch (error) {
      favoritesError = error instanceof Error ? error.message : String(error);
      renderFavorites();
      return;
    }

    if (weatherLocationStore) {
      try {
        weatherLocation = await weatherLocationStore.getLocation();
      } catch (error) {
        weatherLocationError = error instanceof Error ? error.message : String(error);
      }
      weatherLocationKnown = true;
    }

    renderFavorites();
    void startWeather();

    // The flag is read after the first render so it never delays the grid.
    let flagRead = false;
    let dismissed = false;
    if (weatherPromptStore) {
      try {
        dismissed = await weatherPromptStore.isDismissed();
        flagRead = true;
      } catch {
        flagRead = false; // fail closed: an unreadable flag never shows the modal
      }
    }
    try {
      maybeAutoShowCityPrompt({ flagRead, dismissed });
    } catch {
      // the automatic prompt is best-effort; a failure must not surface as an unhandled rejection
    }
  })();

  function handleFavoritesClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    const target = event.target.closest("[data-favorite-action]");

    if (!(target instanceof HTMLElement) || favoritesBusy) {
      return;
    }

    const action = target.dataset.favoriteAction;

    if (action === "set-city") {
      showCityModal("change", HINT_TILE_SELECTOR);
    } else if (action === "open-settings") {
      favoritesUi = openSettings(favoritesUi);
      favoritesError = "";
      pendingFocus = [HEADING_SELECTOR];
      renderFavorites();
    } else if (action === "start-add") {
      favoritesUi = startAdd(favoritesUi);
      favoritesError = "";
      pendingFocus = [formFieldSelector("add")];
      renderFavorites();
    } else if (action === "cancel") {
      const cancelledId = editingId(favoritesUi);
      favoritesUi = cancelForm(favoritesUi);
      favoritesError = "";
      pendingFocus = cancelledId
        ? [itemActionSelector("edit", cancelledId), ADD_BUTTON_SELECTOR]
        : [ADD_BUTTON_SELECTOR];
      renderFavorites();
    } else if (action === "edit") {
      const id = target.dataset.favoriteId;
      if (id) {
        favoritesUi = startEdit(favoritesUi, id);
        favoritesError = "";
        pendingFocus = [formFieldSelector("edit")];
        renderFavorites();
      }
    } else if (action === "delete") {
      pendingFocus = [ADD_BUTTON_SELECTOR];
      const generation = startFavoritesAction();

      void (async () => {
        if (!widgetsService) {
          finishFavoritesAction(generation, () => {
            favoritesError = "Chrome APIs for favorites are unavailable.";
          });
          return;
        }

        try {
          const nextState = await widgetsService.deleteFavorite(
            target.dataset.favoriteId
          );
          finishFavoritesAction(generation, () => {
            widgetsState = nextState;
            favoritesUi = cancelForm(favoritesUi);
            favoritesError = "";
          });
        } catch (error) {
          finishFavoritesAction(generation, () => {
            favoritesError = error instanceof Error ? error.message : String(error);
          });
        }
      })();
    } else if (action === "move-earlier" || action === "move-later") {
      const movedId = target.dataset.favoriteId;
      const otherMove = action === "move-earlier" ? "move-later" : "move-earlier";
      pendingFocus = [
        itemActionSelector(action, movedId),
        itemActionSelector(otherMove, movedId),
        itemActionSelector("edit", movedId),
        ADD_BUTTON_SELECTOR
      ];
      const generation = startFavoritesAction();

      void (async () => {
        if (!widgetsService) {
          finishFavoritesAction(generation, () => {
            favoritesError = "Chrome APIs for favorites are unavailable.";
          });
          return;
        }

        try {
          const nextState = await widgetsService.moveWidget(
            target.dataset.favoriteId,
            action === "move-earlier" ? -1 : 1
          );
          finishFavoritesAction(generation, () => {
            widgetsState = nextState;
            favoritesError = "";
            metricErrorText = "";
          });
        } catch (error) {
          finishFavoritesAction(generation, () => {
            const message = error instanceof Error ? error.message : String(error);
            if (String(movedId).startsWith("weather:")) {
              metricErrorText = message;
            } else {
              favoritesError = message;
            }
          });
        }
      })();
    } else if (action === "open") {
      const favorite = widgetsState?.items.find(
        (item) => item.id === target.dataset.favoriteId
      );

      if (favorite) {
        window.location.assign(favorite.url);
      }
    }
  }

  favoritesPanelRoot?.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !widgetsService) {
      return;
    }

    const metricSetting = target.dataset.metricSetting;
    if (metricSetting) {
      const id = target.dataset.metricId;
      const patch = metricSetting === "enabled" ? { enabled: target.checked } : { tileSize: target.value };
      metricWritesPending += 1;
      void (async () => {
        try {
          widgetsState = await widgetsService.updateWeatherMetric(id, patch);
          showMetricError("");
          renderFavoritesToolbar();
        } catch (error) {
          showMetricError(error instanceof Error ? error.message : String(error));
        }
        // While later writes are in flight the controls keep showing the user's latest intent.
        metricWritesPending -= 1;
        if (metricWritesPending === 0) syncMetricRows();
      })();
      return;
    }

    const setting = target.dataset.gridSetting;
    if (!setting) {
      return;
    }

    const value = target.value;

    void (async () => {
      try {
        widgetsState =
          setting === "columns"
            ? await widgetsService.setColumns(value)
            : await widgetsService.setPosition(value);

        const errorNode = favoritesPanelRoot.querySelector("[data-grid-error]");
        if (errorNode) {
          errorNode.textContent = "";
          errorNode.hidden = true;
        }
        renderFavoritesToolbar();
        favoritesPanelRoot.dataset.barPosition = gridLayout(widgetsState).position;
        publishPanelDock();
      } catch (error) {
        const errorNode = favoritesPanelRoot.querySelector("[data-grid-error]");
        if (errorNode) {
          errorNode.textContent = error instanceof Error ? error.message : String(error);
          errorNode.hidden = false;
        }
      }

      syncGridSettingInputs();
    })();
  });

  favoritesRoot.addEventListener("click", handleFavoritesClick);
  favoritesPanelRoot?.addEventListener("click", handleFavoritesClick);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (hideTooltipIfVisible()) {
      return;
    }

    if (isSuggestionsOpen(weatherUi)) {
      activeCityForm?.cancelPending();
      weatherUi = hideSuggestions(weatherUi);
      activeCityForm?.renderSuggestions();
      activeCityForm?.focusField();
      return;
    }

    // The modal is the layer above the panel; while a city request runs Escape does nothing at all (I1).
    if (cityModalRoot) {
      if (!weatherBusy) hideCityModal({ dismiss: true });
      return;
    }

    if (favoritesBusy) {
      return;
    }

    if (isSettingsOpen(favoritesUi)) {
      favoritesUi = closeSettings(favoritesUi);
      favoritesError = "";
      pendingFocus = [GEAR_SELECTOR];
      renderFavorites();
    }
  });

  // Tab inside the open modal wraps; from body or outside it enters the modal (I3).
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Tab" || !cityModalRoot) return;
    const controls = [...cityModalRoot.querySelectorAll("input, button")].filter((el) => !el.disabled && !el.hidden);
    if (controls.length === 0) {
      event.preventDefault(); // busy: nothing to enter, focus stays on body and never leaves the page
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!(active instanceof Element) || !cityModalRoot.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (cityModalRoot) return; // an outside click never closes the panel while the modal is open
    if (!isSettingsOpen(favoritesUi) || favoritesBusy) {
      return;
    }

    if (!(event.target instanceof Node)) {
      return;
    }

    if (
      favoritesPanelRoot?.contains(event.target) ||
      favoritesRoot?.contains(event.target)
    ) {
      return;
    }

    favoritesUi = closeSettings(favoritesUi);
    favoritesError = "";
    pendingFocus = [GEAR_SELECTOR];
    renderFavorites();
  });

  favoritesPanelRoot?.addEventListener("submit", (event) => {
    const form = event.target;

    if (
      !(form instanceof HTMLFormElement) ||
      !["add", "edit"].includes(form.dataset.favoriteForm ?? "")
    ) {
      return;
    }

    event.preventDefault();

    if (favoritesBusy) {
      return;
    }

    const generation = startFavoritesAction();

    void (async () => {
      if (!widgetsService) {
        finishFavoritesAction(generation, () => {
          favoritesError = "Chrome APIs for favorites are unavailable.";
        });
        return;
      }

      const data = new FormData(form);

      try {
        if (form.dataset.favoriteForm === "edit") {
          const payload = readFavoriteFormPayload(data);
          widgetsState = await widgetsService.updateFavorite(
            form.dataset.favoriteId,
            payload
          );

          finishFavoritesAction(generation, () => {
            pendingFocus = [itemActionSelector("edit", form.dataset.favoriteId), ADD_BUTTON_SELECTOR];
            favoritesUi = cancelForm(favoritesUi);
            favoritesError = "";
          });

          if (payload.backgroundColorSource === "auto") {
            void refreshAutoAccent(form.dataset.favoriteId);
          }
          return;
        }

        const payload = readFavoriteFormPayload(data);
        const previousIds = new Set(widgetsState.items.map((item) => item.id));
        widgetsState = await widgetsService.addFavorite(payload);
        const added = widgetsState.items.find((item) => !previousIds.has(item.id));

        finishFavoritesAction(generation, () => {
          pendingFocus = [ADD_BUTTON_SELECTOR];
          favoritesUi = cancelForm(favoritesUi);
          favoritesError = "";
        });

        if (added) {
          void refreshAutoAccent(added.id);
        }
      } catch (error) {
        finishFavoritesAction(generation, () => {
          pendingFocus = [formFieldSelector(form.dataset.favoriteForm)];
          favoritesError = error instanceof Error ? error.message : String(error);
        });
      }
    })();
  });
}

const CITY_INPUT_SELECTOR = 'input[name="city"]';
const OPEN_CITY_MODAL_SELECTOR = '[data-weather-action="open-city-modal"]';
const HINT_TILE_SELECTOR = '[data-widget-id="weather:hint"]';

function weatherStatusModel() {
  if (!weatherService) return { text: "Chrome APIs for weather are unavailable.", role: "alert" };
  if (widgetsEnsureFailed) {
    return {
      text: "Couldn't add the weather tiles - Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.",
      role: "alert"
    };
  }
  const view = weatherResult ?? (weatherLocationError ? { status: "error", error: weatherLocationError } : null);
  if (view?.status === "error") return { text: `Weather unavailable: ${view.error}`, role: "alert" };
  if (view?.status === "stale") return { text: "Couldn't refresh weather - showing saved data", role: "status" };
  return null;
}

function createWeatherBlock(metrics, items) {
  const block = createNode("section", "weather-block panel-section");
  block.appendChild(createNode("h3", null, "Weather"));
  const card = createNode("div", "panel-card");

  const cityRow = createNode("div", "favorites-panel__row favorites-panel__row--city");
  const cityTitle = createNode("div", "favorites-panel__item");
  const cityLabel = createNode("span", "weather-block__label", "City");
  cityLabel.dataset.weatherCityLabel = "";
  const city = createNode("strong", "weather-block__city");
  city.dataset.weatherCity = "";
  cityTitle.append(cityLabel, city);
  cityRow.append(cityTitle, createNode("div", "weather-block__action"));
  card.appendChild(cityRow);

  const status = createNode("p", "status status--full panel-card__status");
  status.dataset.weatherStatus = "";
  card.appendChild(status);
  const metricError = createNode("p", "status status--error status--full panel-card__status");
  metricError.dataset.metricError = "";
  metricError.setAttribute("role", "alert");
  metricError.textContent = metricErrorText;
  metricError.hidden = metricErrorText === "";
  card.appendChild(metricError);

  for (const item of metrics) {
    card.appendChild(createWeatherMetricRow(item, items));
  }
  block.appendChild(card);
  mountWeatherBlockContent(block);
  return block;
}

// Updates the city line, the status slot and the city button in place (the button node is reused so focus survives).
function syncWeatherBlock() {
  const block = favoritesPanelRoot?.querySelector(".weather-block");
  if (block) mountWeatherBlockContent(block);
}

function mountWeatherBlockContent(block) {
  const location = weatherLocationError ? null : currentLocation(); // I2: a read error counts as no location
  const cityLine = block.querySelector("[data-weather-city]");
  const cityLabel = block.querySelector("[data-weather-city-label]");
  cityLine.textContent = location ? location.name : weatherLocationError ? "" : "No city set";
  cityLabel.hidden = !location; // "No city set" stands alone
  cityLine.hidden = cityLine.textContent === ""; // the read error is shown by the status line instead
  const status = block.querySelector("[data-weather-status]");
  const model = weatherStatusModel();
  status.textContent = model?.text ?? "";
  status.hidden = !model;
  if (model) {
    status.setAttribute("role", model.role);
    status.classList.toggle("status--error", model.role === "alert");
  }

  const actionHost = block.querySelector(".weather-block__action");
  if (!weatherService) {
    actionHost.replaceChildren();
    return;
  }
  let button = actionHost.querySelector(OPEN_CITY_MODAL_SELECTOR);
  if (!button) {
    button = createNode("button", "button");
    button.type = "button";
    button.dataset.weatherAction = "open-city-modal";
    actionHost.replaceChildren(button);
  }
  button.replaceChildren(createIconNode("mapPin"), document.createTextNode(location ? "Change city" : "Set a city"));
}

async function startWeather() {
  if (!weatherService) {
    return;
  }

  const generation = weatherGeneration;
  let result;
  try {
    result = await weatherService.initialize();
  } catch (error) {
    result = {
      status: "error",
      location: null,
      data: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }

  // A city chosen while the first load was in flight already produced a newer result.
  if (generation !== weatherGeneration) {
    return;
  }

  weatherResult = result;
  renderFavoritesToolbar();
  syncWeatherBlock();
}

// D15: a city request that has not finished after CITY_REQUEST_TIMEOUT_MS is treated as failed; a later result is ignored.
function withTimeout(promise) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The request took too long. Check your connection and try again.")),
      CITY_REQUEST_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function changeCity(run) {
  weatherBusy = true;
  weatherChanging = true;
  // Cancel the debounce and any in-flight suggestion request and empty the list: nothing rebuilds the form now.
  activeCityForm?.cancelPending();
  weatherUi = hideSuggestions(weatherUi);
  activeCityForm?.renderSuggestions();
  cityModalError = "";
  syncCityModal();
  renderFavoritesToolbar();
  void (async () => {
    let ok = false;
    try {
      const result = await withTimeout(run());
      // Only a successful change makes an earlier in-flight boot load stale; a failed one leaves it valid.
      weatherGeneration += 1;
      weatherResult = result;
      weatherLocation = weatherResult.location ?? weatherLocation;
      weatherLocationError = ""; // a successful selection clears an earlier read error
      ok = true;
    } catch (error) {
      cityModalError = error instanceof Error ? error.message : String(error);
    } finally {
      weatherBusy = false;
      weatherChanging = false;
      renderFavoritesToolbar();
      syncWeatherBlock();
      if (ok) {
        hideCityModal(); // selection never writes the flag
      } else {
        syncCityModal();
        cityModalRoot?.querySelector(CITY_INPUT_SELECTOR)?.focus();
      }
    }
  })();
}

favoritesPanelRoot?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-weather-action]") : null;
  if (!(target instanceof HTMLElement) || weatherBusy) return;
  if (target.dataset.weatherAction === "open-city-modal") {
    showCityModal("change", OPEN_CITY_MODAL_SELECTOR);
  }
});
