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
import { gridLayout, panelDock, placeTooltip, tileSpan } from "./widgetsLayout.js";
import {
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS,
  NEWER_WIDGETS_MESSAGE,
  weatherMetricKey
} from "./widgetsShared.js";
import { searchCities } from "./weatherApi.js";
import { createWeatherService } from "./weatherService.js";
import { createWeatherCacheStore, createWeatherLocationStore } from "./weatherStore.js";
import { describeWeatherMetric } from "./weatherTiles.js";
import {
  citySuggestions,
  createInitialWeatherUiState,
  hideSuggestions,
  isEditingCity,
  isSuggestionsOpen,
  showSuggestions,
  startEditingCity,
  stopEditingCity
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
let metricErrorText = ""; // write-error slot of the metric controls; module state so a panel rebuild keeps it
let activeCityForm = null; // { cancelPending, renderSuggestions } of the mounted city form
let weatherUi = createInitialWeatherUiState();
let weatherFormError = "";
let weatherBusy = false;
let weatherFormGeneration = 0;

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

function createFavoritesPanelRow(item, index, itemCount) {
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
  earlier.disabled = disabled || index === 0;
  earlier.appendChild(createIconNode("chevronUp"));

  const later = createNode("button", "icon-button");
  later.type = "button";
  later.dataset.favoriteAction = "move-later";
  later.dataset.favoriteId = item.id;
  later.setAttribute("aria-label", `Move ${item.label} later`);
  later.disabled = disabled || index === itemCount - 1;
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

function createWeatherForm(location) {
  weatherFormGeneration += 1;
  const formGeneration = weatherFormGeneration;
  weatherUi = hideSuggestions(weatherUi);

  const form = createNode("form", "weather-form");
  form.dataset.weatherForm = "city";

  const input = createNode("input", "favorite-input");
  input.name = "city";
  input.type = "text";
  input.id = "weather-city-input";
  input.placeholder = "City";
  input.value = location ? location.name : "";
  input.required = true;
  input.autocomplete = "off";
  input.disabled = weatherBusy;

  const cityLabel = createNode("label", "favorite-form__row-label", "City");
  cityLabel.htmlFor = "weather-city-input";

  const row = createNode("div", "weather-form__row");
  row.appendChild(input);

  const save = createIconButton("button button--primary", "Save", "check");
  save.type = "submit";
  save.disabled = weatherBusy;
  row.appendChild(save);

  if (location) {
    const cancel = createIconButton("button", "Cancel", "x");
    cancel.type = "button";
    cancel.dataset.weatherAction = "cancel-edit-city";
    cancel.disabled = weatherBusy;
    row.appendChild(cancel);
  }

  form.append(cityLabel, row);

  const suggestionsList = createNode("div", "weather-form__suggestions");
  form.appendChild(suggestionsList);

  function renderSuggestionsList() {
    suggestionsList.replaceChildren();

    if (!isSuggestionsOpen(weatherUi)) {
      return;
    }

    for (const suggestion of citySuggestions(weatherUi)) {
      const labelParts = [suggestion.name, suggestion.admin1, suggestion.country].filter(
        (part) => part
      );
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
  }

  renderSuggestionsList();

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

        if (signal.aborted || formGeneration !== weatherFormGeneration) {
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

  input.addEventListener("blur", () => {
    cancelPendingSuggestionRequest();

    setTimeout(() => {
      if (formGeneration !== weatherFormGeneration) {
        return;
      }
      weatherUi = hideSuggestions(weatherUi);
      renderSuggestionsList();
    }, 150);
  });

  activeCityForm = { cancelPending: cancelPendingSuggestionRequest, renderSuggestions: renderSuggestionsList };
  return form;
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

  body.appendChild(createWeatherBlock());

  if (isAdding(favoritesUi)) {
    body.appendChild(createFavoriteForm(null));
  }

  const currentEditingId = editingId(favoritesUi);
  const editingItem = items.find((item) => item.id === currentEditingId);
  if (editingItem) {
    body.appendChild(createFavoriteForm(editingItem));
  }

  if (favoritesError) {
    const errorNode = createStatus(favoritesError, { error: true, live: "assertive" });
    errorNode.dataset.favoritesError = "";
    body.appendChild(errorNode);
  }

  const listWrap = createNode("div", "favorites-panel__list");
  items.forEach((item, index) => {
    listWrap.appendChild(createFavoritesPanelRow(item, index, items.length));
  });
  body.appendChild(listWrap);
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
      favoritesUi = openSettings(favoritesUi);
      favoritesError = "";
      pendingFocus = [CITY_INPUT_SELECTOR];
      renderFavorites();
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
          });
        } catch (error) {
          finishFavoritesAction(generation, () => {
            favoritesError = error instanceof Error ? error.message : String(error);
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

  document.addEventListener("pointerdown", (event) => {
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
        widgetsState = await widgetsService.addFavorite(payload);
        const added = widgetsState.items.at(-1);

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

const CHANGE_CITY_SELECTOR = '[data-weather-action="edit-city"]';
const CITY_INPUT_SELECTOR = 'input[name="city"]';

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

function createWeatherBlock() {
  const block = createNode("section", "weather-block");
  block.appendChild(createNode("h3", null, "Weather"));
  const city = createNode("p", "weather-block__city");
  city.dataset.weatherCity = "";
  block.appendChild(city);
  const status = createNode("p", "status status--full");
  status.dataset.weatherStatus = "";
  block.appendChild(status);
  const metricError = createNode("p", "status status--error status--full");
  metricError.dataset.metricError = "";
  metricError.setAttribute("role", "alert");
  metricError.textContent = metricErrorText;
  metricError.hidden = metricErrorText === "";
  block.appendChild(metricError);
  block.appendChild(createNode("div", "weather-block__form"));
  mountWeatherBlockContent(block);
  return block;
}

// Updates the city line and status slot in place; never replaces a mounted city form.
function syncWeatherBlock() {
  const block = favoritesPanelRoot?.querySelector(".weather-block");
  if (block) mountWeatherBlockContent(block);
}

function mountWeatherBlockContent(block) {
  const location = currentLocation();
  const cityLine = block.querySelector("[data-weather-city]");
  cityLine.textContent = location ? `City: ${location.name}` : "";
  cityLine.hidden = !location; // no line without a city (spec § Settings panel)
  const status = block.querySelector("[data-weather-status]");
  const model = weatherStatusModel();
  status.textContent = model?.text ?? "";
  status.hidden = !model;
  if (model) {
    status.setAttribute("role", model.role);
    status.classList.toggle("status--error", model.role === "alert");
  }

  const formHost = block.querySelector(".weather-block__form");
  const kind = !weatherService ? "none" : !location || isEditingCity(weatherUi) ? "form" : "button";
  if (formHost.dataset.kind === kind) return; // same kind: leave the node alone (typed text, suggestions, focus)
  formHost.dataset.kind = kind;
  formHost.replaceChildren();
  if (kind === "form") {
    formHost.appendChild(createWeatherForm(location));
    if (weatherFormError) formHost.appendChild(createStatus(weatherFormError, { error: true, live: "assertive" }));
  } else if (kind === "button") {
    const change = createIconButton("button", "Change city", "settings");
    change.type = "button";
    change.dataset.weatherAction = "edit-city";
    formHost.appendChild(change);
  }
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

function changeCity(run) {
  weatherBusy = true;
  weatherChanging = true;
  weatherUi = hideSuggestions(weatherUi);
  renderFavoritesToolbar();
  void (async () => {
    try {
      const result = await run();
      // Only a successful change makes an earlier in-flight boot load stale; a failed one leaves it valid.
      weatherGeneration += 1;
      weatherResult = result;
      weatherUi = stopEditingCity(weatherUi);
      weatherFormError = "";
      weatherLocation = weatherResult.location ?? weatherLocation;
    } catch (error) {
      weatherFormError = error instanceof Error ? error.message : String(error);
    } finally {
      weatherBusy = false;
      weatherChanging = false;
      renderFavoritesToolbar();
      renderFavoritesPanel(); // rebuild: the form is done
      pendingFocus = [CHANGE_CITY_SELECTOR, CITY_INPUT_SELECTOR];
      applyPendingFocus();
    }
  })();
}

favoritesPanelRoot?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-weather-action]") : null;
  if (!(target instanceof HTMLElement) || weatherBusy) return;
  const action = target.dataset.weatherAction;
  if (action === "edit-city") {
    weatherUi = startEditingCity(weatherUi);
    weatherFormError = "";
    syncWeatherBlock();
    favoritesPanelRoot.querySelector(CITY_INPUT_SELECTOR)?.focus();
  } else if (action === "cancel-edit-city") {
    weatherUi = stopEditingCity(weatherUi);
    weatherFormError = "";
    syncWeatherBlock();
    favoritesPanelRoot.querySelector(CHANGE_CITY_SELECTOR)?.focus();
  } else if (action === "select-city") {
    changeCity(() =>
      weatherService.selectLocation({
        name: target.dataset.cityName,
        country: target.dataset.cityCountry ?? "",
        latitude: Number(target.dataset.cityLatitude),
        longitude: Number(target.dataset.cityLongitude)
      })
    );
  }
});

favoritesPanelRoot?.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.dataset.weatherForm !== "city") return;
  event.preventDefault();
  const cityName = String(new FormData(form).get("city") ?? "").trim();
  if (weatherBusy || !weatherService || !cityName) return;
  changeCity(() => weatherService.setCity(cityName));
});
