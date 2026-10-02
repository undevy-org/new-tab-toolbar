import {
  extractImageBackgroundColor,
  fallbackColorForDomain,
  hexToRgbChannels,
  normalizeAccentLightness
} from "./favoriteColor.js";
import { getFavoriteIconModel, getFavoriteLetter } from "./favoriteIcon.js";
import { createIconNode } from "./icons.js";
import { canPlace, cellFromPoint, displayLayout, effectiveColumns, gridMetrics } from "./desktopLayout.js";
import {
  closeDialog,
  createDesktopUiState,
  endDrag,
  enterEditMode,
  escapeLayer,
  exitEditMode,
  openDialog,
  startDrag,
  updateDrag
} from "./desktopUiState.js";
import { createWidgetsService } from "./widgetsService.js";
import {
  WIDGETS_META_KEY,
  createWidgetsStore,
  ensureWidgetsLayout,
  inspectWidgetsMeta,
  migrateToWidgets,
  migrateWidgetsToV2
} from "./widgetsStore.js";
import { placeTooltip } from "./widgetsLayout.js";
import { NEWER_WIDGETS_MESSAGE, weatherMetricKey } from "./widgetsShared.js";
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
const desktopStatus = document.querySelector("#desktop-status");

const ENSURE_FAILED_MESSAGE =
  "Couldn't add the weather and settings tiles - Chrome Sync may be full or unavailable. Free up sync space, then reload this tab to try again.";

const desktopLive = document.querySelector("#desktop-live");
const DESKTOP_STATUS_MS = 8000;
let desktopStatusTimer = 0;

// Page-level status line (role="alert"), text only. It clears after 8 s or at the next action; no message is exempt
// (the ensure-failure text clears like any other).
function showDesktopStatus(text) {
  if (!desktopStatus) return;
  clearTimeout(desktopStatusTimer);
  desktopStatus.textContent = text;
  desktopStatus.hidden = text === "";
  if (text !== "") desktopStatusTimer = setTimeout(() => showDesktopStatus(""), DESKTOP_STATUS_MS);
}

// Polite live region for outcomes that have no visible change at the focused element.
function announce(text) {
  if (desktopLive) desktopLive.textContent = text;
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
// Edit mode / menu / dialog / drag (pure state, desktopUiState.js). Normal mode only until the later tasks wire it.
let desktopUi = createDesktopUiState();
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

// Spec § Tile content by size: 1-wide shows the icon only (the label is the accessible name), 2×1 adds a one-line
// label, 2×2 a 40 px icon, a two-line label and the host name. Text only via text nodes.
function createFavoriteTile(item, cell) {
  const button = createNode("button", "favorite-tile");
  const iconModel = getFavoriteIconModel(item, { faviconBaseUrl });
  const editing = desktopUi.editMode;

  button.type = "button";
  button.dataset.favoriteAction = editing ? "edit" : "open";
  button.dataset.favoriteId = item.id;
  button.dataset.widgetId = item.id;
  button.title = item.label;
  button.setAttribute("aria-label", editing ? `Edit ${item.label}` : `Open ${item.label}`);
  button.style.setProperty(
    "--favorite-accent-rgb",
    hexToRgbChannels(normalizeAccentLightness(item.backgroundColor))
  );
  button.appendChild(createFavoriteIconNode(iconModel, item));
  if (cell.w === 2) {
    const text = createNode("span", "favorite-tile__text");
    text.appendChild(createNode("span", "favorite-tile__label", item.label));
    if (cell.h === 2) text.appendChild(createNode("span", "favorite-tile__host", item.domain));
    button.appendChild(text);
  }

  button.disabled = favoritesBusy;
  button.setAttribute("aria-disabled", String(favoritesBusy));
  return button;
}

function createSegmentedControl(name, options, selectedValue) {
  const group = createNode("div", "segmented");
  group.setAttribute("role", "radiogroup");

  for (const [value, text, glyph] of options) {
    const option = createNode("label", "segmented__option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = value === selectedValue;
    option.appendChild(input);
    if (glyph) {
      const mark = createNode("i", `segmented__glyph segmented__glyph--${glyph}`);
      mark.setAttribute("aria-hidden", "true");
      option.appendChild(mark);
    }
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
  form.noValidate = true; // the service validates and its message lands in the dialog's alert slot
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
    backgroundColorSource
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

    const nextState = await widgetsService.updateFavorite(
      id,
      { backgroundColor: autoColor, backgroundColorSource: "auto" },
      { columns: currentColumns() }
    );

    widgetsState = nextState;
    renderFavorites();
  } catch {
    // Auto-accent is best-effort; a canvas/CORS failure keeps the fallback accent
    // and must never disturb the displayed icon.
  }
}

const METRIC_LABELS = { temperature: "Temperature", precipitation: "Precipitation", airQuality: "Air quality", uv: "UV index" };
const METRIC_GLYPHS = { temperature: "thermometer", precipitation: "droplet", airQuality: "wind", uv: "sun" };

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
    event.preventDefault(); // the field keeps focus, so the item never gets focusin
    // A press on an item cancels the pending request: a late response must never replace the list under the pressed item
    // (the click would be lost or land on another item). The click then chooses the item; later typing gets suggestions again.
    if (event.target instanceof Element && event.target.closest(".weather-form__suggestion")) cancelPendingSuggestionRequest();
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
    if (event.button !== 0) return; // a right click opens a context menu and may never deliver a pointerup
    pressing = event.target instanceof Element && Boolean(event.target.closest(".city-modal__dialog"));
  };
  const onWindowBlur = () => {
    pressing = false; // a press interrupted by leaving the window never gets its pointerup
  };
  const onPointerUp = () => {
    if (!pressing) return;
    pressing = false;
    setTimeout(closeListIfFocusLeft, 0);
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("blur", onWindowBlur);

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
      window.removeEventListener("blur", onWindowBlur);
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
  if (cityModalRoot || desktopDialogRoot || isCityModalOpen(weatherUi) || !weatherService || !document.body) return false; // one modal at a time, never stacked on a desktop dialog
  cityModalError = "";
  let root = null;
  try {
    root = buildCityModal(mode, weatherLocationError ? null : currentLocation());
    attachCityModalListeners(root); // before any focus() so the focusin below is seen
    document.body.appendChild(root);
  } catch (error) {
    // Nothing half-open: a failed build must not leave the UI state "open" and block every later open.
    root?.remove();
    activeCityForm?.dispose?.(); // the form's document and window listeners must not outlive it
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
  if (dismiss && mode === "first-run") onFirstRunDismissed();
  if (mode === "change") {
    pendingFocus = [cityModalOpener, SETTINGS_TILE_SELECTOR].filter(Boolean);
    applyPendingFocus();
  } else if (focusWasInside) {
    pendingFocus = [SETTINGS_TILE_SELECTOR];
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
  if (cityModalRoot || desktopDialogRoot || cityModalShownThisLoad) return; // a modal was opened meanwhile (or already shown and closed): never replace, duplicate or reopen it
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

// R6: a 2-wide tile uses the `wide` model; a 2-high tile gets larger type (CSS keys off data-h="2") and the city name.
function createWeatherMetricTile(item, cell, view) {
  const size = cell.w === 2 ? "wide" : "square";
  const model = describeWeatherMetric({ metricKey: weatherMetricKey(item.id), result: view, size });
  if (!model) return null;

  // Edit mode: the tile becomes a button named "Edit <metric name>"; its click is a no-op until Task 10.
  const editing = desktopUi.editMode;
  const tile = createNode(editing ? "button" : "div", "weather-tile");
  tile.dataset.widgetId = item.id;
  if (editing) {
    tile.type = "button";
    tile.setAttribute("aria-label", `Edit ${METRIC_LABELS[weatherMetricKey(item.id)]}`);
  } else {
    tile.tabIndex = 0;
    tile.setAttribute("role", "group");
    tile.setAttribute("aria-label", model.label);
  }
  if (model.tone) tile.dataset.weatherTone = model.tone;
  if (model.stale) tile.dataset.stale = "true";
  if (model.busy) tile.setAttribute("aria-busy", "true");

  // Spec § Tile content by size: every size leads with the metric glyph (decorative; the name is the aria-label).
  const glyph = createNode("span", "weather-tile__glyph");
  glyph.setAttribute("aria-hidden", "true");
  glyph.appendChild(createIconNode(METRIC_GLYPHS[weatherMetricKey(item.id)], { size: 16 }));
  tile.appendChild(glyph);

  const values = createNode("div", "weather-tile__values");
  values.appendChild(createNode("span", "weather-tile__primary", model.primary));
  if (model.secondary) values.appendChild(createNode("span", "weather-tile__secondary", model.secondary));
  tile.appendChild(values);
  const cityName = view?.location?.name;
  if (cell.h === 2 && cityName) tile.appendChild(createNode("span", "weather-tile__city", cityName));
  const description = createNode("span", "sr-only", model.description);
  description.id = `weather-desc-${weatherMetricKey(item.id)}`;
  description.dataset.tooltipText = "";
  tile.setAttribute("aria-describedby", description.id);
  tile.dataset.tooltipTrigger = "";
  tile.appendChild(description);
  return tile;
}

// Spec § Weather / city: the hint takes the first enabled metric's cell and size; the plus glyph at 1-wide, text when wider.
function createCityHintTile(cell, item) {
  const button = createNode("button", "city-hint-tile");
  button.type = "button";
  button.dataset.favoriteAction = "set-city";
  button.dataset.widgetId = "weather:hint";
  button.dataset.metricId = item.id;
  button.setAttribute("aria-label", "Set a city");
  if (cell.w === 2) button.textContent = "Set a city";
  else button.appendChild(createIconNode("plus"));
  return button;
}

function createChromeTile(item, cell) {
  const settings = item.role === "settings";
  const button = createNode("button", "chrome-tile");
  button.type = "button";
  button.dataset.widgetId = item.id;
  button.dataset.chromeRole = item.role;
  button.setAttribute("aria-label", settings ? "Settings" : "Add link");
  if (settings) button.setAttribute("aria-pressed", String(desktopUi.editMode));
  button.appendChild(createIconNode(settings ? "settings" : "plus", { size: 20 }));
  return button;
}

function createRemoveBadge(item) {
  const hidden = item.type === "weather-metric";
  const label = hidden ? METRIC_LABELS[weatherMetricKey(item.id)] : item.label;
  const badge = createNode("button", "tile-remove");
  badge.type = "button";
  badge.dataset.removeFor = item.id;
  badge.setAttribute("aria-label", hidden ? `Hide ${label}` : `Remove ${label}`);
  badge.appendChild(createIconNode("minus", { size: 12 }));
  return badge;
}

const ADD_TILE_SELECTOR = '[data-widget-id="chrome:add"]';
const DIALOG_BACKDROP_GUARD_MS = 300;
let desktopDialogRoot = null;
let desktopDialogOpener = null; // widget id of the tile that had focus when the dialog opened, looked up again at close
let desktopDialogOpenedAt = 0;

function buildDialogContent(root, dialog) {
  const title = createNode("h2", "desktop-dialog__title");
  title.id = "desktop-dialog-title";
  const error = createNode("div", "desktop-dialog__error", "");
  error.setAttribute("role", "alert");
  error.dataset.dialogError = "";
  error.hidden = true;

  // Task 10 adds edit-link, edit-weather and confirm-delete as further branches here.
  switch (dialog.kind) {
    case "add-link": {
      title.textContent = "Add link";
      const form = createFavoriteForm(null);
      form.insertBefore(error, form.querySelector(".favorite-form__footer"));
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const payload = readFavoriteFormPayload(new FormData(form));
        void runDesktopMutation(
          (columns) => widgetsService.addFavorite(payload, { columns }),
          { dialogRoot: root }
        ).then((ok) => {
          if (ok) {
            announce("Link added");
            closeDesktopDialog();
          }
        });
      });
      root.append(title, form);
      break;
    }
    default:
      throw new Error(`Unknown dialog: ${dialog.kind}`);
  }
}

function openDesktopDialog(dialog) {
  if (!favoritesRoot || desktopDialogRoot) return;
  showDesktopStatus("");
  desktopDialogOpener = focusedWidgetId()?.id ?? null;
  desktopUi = openDialog(desktopUi, dialog);
  const root = createNode("div", "desktop-dialog");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "desktop-dialog-title");
  root.dataset.dialog = dialog.kind;
  try {
    buildDialogContent(root, dialog);
  } catch (error) {
    desktopUi = closeDialog(desktopUi);
    throw error;
  }
  const backdrop = createNode("div", "desktop-backdrop");
  backdrop.addEventListener("click", () => {
    if (Date.now() - desktopDialogOpenedAt < DIALOG_BACKDROP_GUARD_MS || favoritesBusy) return;
    closeDesktopDialog();
  });
  root.querySelector('[data-favorite-action="cancel"]')?.addEventListener("click", () => {
    if (!favoritesBusy) closeDesktopDialog();
  });
  desktopDialogRoot = root;
  desktopDialogOpenedAt = Date.now();
  favoritesRoot.inert = true;
  document.body.append(backdrop, root);
  root.querySelector("input, button")?.focus();
}

function closeDesktopDialog({ restoreFocusTo = desktopDialogOpener } = {}) {
  document.querySelectorAll(".desktop-dialog, .desktop-backdrop").forEach((node) => node.remove());
  desktopDialogRoot = null;
  if (favoritesRoot) favoritesRoot.inert = false;
  desktopUi = closeDialog(desktopUi);
  desktopDialogOpener = null;
  if (typeof restoreFocusTo === "string") {
    suppressTooltipOnFocus = true;
    try {
      favoritesRoot?.querySelector(`[data-widget-id="${CSS.escape(restoreFocusTo)}"]`)?.focus();
    } finally {
      suppressTooltipOnFocus = false;
    }
  }
}

// The first field a service message is about; anything else leaves focus on the submit button.
function invalidFieldFor(message) {
  if (/image url/i.test(message)) return 'input[name="customIconUrl"]';
  if (/url/i.test(message)) return 'input[name="url"]';
  if (/color/i.test(message)) return 'input[name="backgroundColor"]';
  return 'button[type="submit"]';
}

function showDialogError(root, message) {
  const slot = root.querySelector("[data-dialog-error]");
  if (!slot) return;
  slot.textContent = message;
  slot.hidden = false;
  const field = root.querySelector(invalidFieldFor(message)) ?? root.querySelector('button[type="submit"]');
  if (field instanceof HTMLElement && !field.matches(":disabled")) field.focus();
}

// Every explicit mutation goes through here. On failure nothing is persisted and the UI returns to the stored state.
async function runDesktopMutation(action, { dialogRoot = null } = {}) {
  if (favoritesBusy) return false;
  showDesktopStatus("");
  const slot = dialogRoot?.querySelector("[data-dialog-error]");
  if (slot) {
    slot.textContent = "";
    slot.hidden = true;
  }
  const generation = startFavoritesAction();
  try {
    const next = await action(currentColumns());
    finishFavoritesAction(generation, () => {
      widgetsState = next;
    });
    return true;
  } catch (error) {
    finishFavoritesAction(generation, () => {});
    const message = error instanceof Error ? error.message : String(error);
    if (dialogRoot?.isConnected) showDialogError(dialogRoot, message);
    else showDesktopStatus(message);
    return false;
  }
}

const SETTINGS_TILE_SELECTOR = '[data-widget-id="chrome:settings"]';

function viewportWidth() {
  return document.documentElement.clientWidth;
}

function currentColumns() {
  return effectiveColumns(viewportWidth());
}

// R4: metrics come from JS so the column count and the cell size can never disagree at a breakpoint.
function applyGridMetrics() {
  const metrics = gridMetrics(viewportWidth());
  const style = document.documentElement.style;
  style.setProperty("--cell-size", `${metrics.cell}px`);
  style.setProperty("--grid-gap", `${metrics.gap}px`);
  style.setProperty("--grid-pad", `${metrics.pad}px`);
  return metrics;
}

function placeTile(node, cell) {
  node.style.setProperty("--x", String(cell.x));
  node.style.setProperty("--y", String(cell.y));
  node.style.setProperty("--w", String(cell.w));
  node.style.setProperty("--h", String(cell.h));
  node.dataset.w = String(cell.w);
  node.dataset.h = String(cell.h);
  node.dataset.tileSize = cell.w === 2 ? "wide" : "square";
}

function focusedWidgetId() {
  const active = document.activeElement instanceof Element ? document.activeElement : null;
  const owner = active && favoritesRoot.contains(active) ? active.closest("[data-widget-id], [data-remove-for]") : null;
  return owner ? { id: owner.dataset.widgetId ?? owner.dataset.removeFor, badge: "removeFor" in owner.dataset } : null;
}

// A focused − badge disappears when edit mode exits: focus then falls back to the Settings tile, never to <body>.
function restoreFocus(target) {
  if (!target || (document.activeElement && document.activeElement !== document.body)) return;
  const selector = target.badge ? `[data-remove-for="${CSS.escape(target.id)}"]` : `[data-widget-id="${CSS.escape(target.id)}"]`;
  suppressTooltipOnFocus = true;
  try {
    const node = favoritesRoot.querySelector(selector) ?? (target.badge ? favoritesRoot.querySelector(SETTINGS_TILE_SELECTOR) : null);
    node?.focus();
  } finally {
    suppressTooltipOnFocus = false;
  }
}

let renderedColumns = 0;
let renderedCell = 0;

// The only render path: tiles absolutely positioned in the displayed layout (pure function of the stored grids and
// the current column count; never written by a render), in (y, x) DOM order.
function renderDesktop() {
  if (!favoritesRoot) return;
  hideTooltip();
  if (widgetsNewer) {
    favoritesRoot.replaceChildren(createStatus(NEWER_WIDGETS_MESSAGE, { error: true, live: "assertive", full: true }));
    return;
  }
  if (widgetsMigrationFailed) {
    favoritesRoot.replaceChildren(createStatus(favoritesError, { error: true, live: "assertive", full: true }));
    return;
  }
  if (!widgetsState) {
    // Unavailable APIs or a failed read: say so instead of an empty, silently broken page.
    favoritesRoot.replaceChildren(...(favoritesError ? [createStatus(favoritesError, { error: true, live: "assertive", full: true })] : []));
    return;
  }

  const focusTarget = focusedWidgetId();
  const metrics = applyGridMetrics();
  const columns = currentColumns();
  renderedColumns = columns;
  renderedCell = metrics.cell;
  const items = widgetsState.items;
  const layout = displayLayout(items, columns);
  const view = weatherService ? effectiveWeatherResult() : undefined;

  const entries = [];
  let hintPlaced = false;
  for (const item of items) {
    const cell = layout.get(item.id);
    if (!cell) continue; // hidden metric: no cell, no tile
    let tile = null;
    if (item.type === "favorite") tile = createFavoriteTile(item, cell);
    else if (item.type === "chrome") tile = createChromeTile(item, cell);
    else if (weatherService && view?.status === "no-location") {
      if (!hintPlaced) {
        tile = createCityHintTile(cell, item); // the other metrics wait for a city; their cells stay reserved
        hintPlaced = true;
      }
    } else if (weatherService) tile = createWeatherMetricTile(item, cell, view);
    if (!tile) continue;
    placeTile(tile, cell);
    const nodes = [tile];
    if (desktopUi.editMode && item.type !== "chrome") {
      const badge = createRemoveBadge(item);
      placeTile(badge, { ...cell, w: 1, h: 1 });
      nodes.push(badge);
    }
    entries.push({ cell, nodes });
  }
  entries.sort((a, b) => a.cell.y - b.cell.y || a.cell.x - b.cell.x);

  const grid = createNode("div", "desktop-grid");
  grid.style.setProperty("--grid-columns", String(columns));
  grid.style.setProperty("--rows", String(Math.max(1, ...entries.map(({ cell }) => cell.y + cell.h))));
  grid.append(...entries.flatMap(({ nodes }) => nodes));
  favoritesRoot.dataset.edit = String(desktopUi.editMode);
  favoritesRoot.replaceChildren(grid);
  restoreFocus(focusTarget);
  if (dragSession) reattachDrag();
}

// A resize only re-renders (when the column count or the cell size changed); it never writes.
let resizeFrame = 0;
window.addEventListener("resize", () => {
  cancelDrag(); // Review focus 1: a viewport change cancels an active drag (tile returns, nothing written)
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (!widgetsState || widgetsNewer || widgetsMigrationFailed) return;
    if (currentColumns() !== renderedColumns || gridMetrics(viewportWidth()).cell !== renderedCell) renderFavorites();
  });
});

// ---- Pointer drag (edit mode only). Spec § Drag details, § Placement rules, § DOM order and focus. ----
const DRAG_THRESHOLD_PX = 6;
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 12;
const DROP_RETURN_MS = 180;
// { id (widget to move: the metric id for the hint tile), domId (rendered tile), tile, cell, layout, columns, metrics,
//   pointerId, startX, startY, lastX, lastY, baseLeft, baseTop, grab, started, frame, rows }
let dragSession = null;
let dropReturnTimer = 0;
// One-shot: the click that trails a started drag (same press) is swallowed, so Settings never toggles after a drag.
let suppressDragClick = false;

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const dragGridOf = () => favoritesRoot?.querySelector(".desktop-grid") ?? null;

function beginPointerDrag(event, tile) {
  if (!desktopUi.editMode || event.button !== 0 || !event.isPrimary || dragSession || dropReturnTimer) return;
  if (favoritesBusy || desktopDialogRoot || cityModalRoot || !widgetsState) return;
  const grid = dragGridOf();
  if (!grid || tile.parentElement !== grid) return;
  const id = tile.dataset.metricId ?? tile.dataset.widgetId; // the hint tile stands for the first enabled metric
  const columns = currentColumns();
  const layout = displayLayout(widgetsState.items, columns);
  const cell = layout.get(id);
  if (!cell) return; // hidden metrics have no tile and never reach moveWidget
  const metrics = gridMetrics(viewportWidth());
  const origin = grid.getBoundingClientRect();
  const step = metrics.cell + metrics.gap;
  const grabCell = cellFromPoint({ x: event.clientX, y: event.clientY }, origin, metrics);
  const clamp = (v, max) => Math.min(max, Math.max(0, v));
  dragSession = {
    id, domId: tile.dataset.widgetId, tile, cell, layout, columns, metrics,
    pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY,
    baseLeft: origin.left + cell.x * step, baseTop: origin.top + cell.y * step,
    grab: { x: clamp(grabCell.x - cell.x, cell.w - 1), y: clamp(grabCell.y - cell.y, cell.h - 1) },
    started: false, frame: 0,
    rows: Math.max(0, ...[...layout.values()].map((g) => g.y + g.h)) + 2 // room for the "one row below" drop and its error row
  };
}

const outsideViewport = (event) =>
  event.clientX < 0 || event.clientY < 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight;

function onDragPointerMove(event) {
  const s = dragSession;
  if (!s || event.pointerId !== s.pointerId) return;
  if (outsideViewport(event)) {
    cancelDrag(); // the pointer left the window
    return;
  }
  s.lastX = event.clientX;
  s.lastY = event.clientY;
  if (!s.started) {
    if (Math.hypot(event.clientX - s.startX, event.clientY - s.startY) < DRAG_THRESHOLD_PX) return; // still a tap
    s.started = true;
    suppressDragClick = true;
    hideTooltip();
    desktopUi = startDrag(desktopUi, { id: s.id, grab: s.grab, size: { w: s.cell.w, h: s.cell.h }, pointerId: s.pointerId });
  }
  applyDragVisuals(s);
  if (!s.frame && edgeDirection(s.lastY) !== 0) s.frame = requestAnimationFrame(autoscrollFrame);
}

function edgeDirection(clientY) {
  if (clientY < AUTOSCROLL_EDGE_PX) return -1;
  if (clientY > window.innerHeight - AUTOSCROLL_EDGE_PX) return 1;
  return 0;
}

// While the pointer stays within 48 px of the top/bottom edge the page scrolls 12 px per frame; the target is
// recomputed from the last pointer position because the grid moved under it.
function autoscrollFrame() {
  const s = dragSession;
  if (!s) return;
  s.frame = 0;
  const direction = edgeDirection(s.lastY);
  if (direction === 0) return;
  const before = window.scrollY;
  window.scrollBy(0, direction * AUTOSCROLL_STEP_PX);
  if (window.scrollY !== before) updateDragTarget(s);
  s.frame = requestAnimationFrame(autoscrollFrame);
}

// The dragged tile is position:fixed under the pointer (it never adds scrollable overflow, so autoscroll ends at
// the page bottom); the grid keeps two spare rows while dragging and the highlight is clamped inside the grid.
function applyDragVisuals(s) {
  const grid = dragGridOf();
  if (!grid) return;
  grid.dataset.dragging = "true";
  grid.style.setProperty("--rows", String(s.rows));
  s.tile.classList.add("is-dragging");
  s.tile.style.position = "fixed";
  s.tile.style.left = `${s.baseLeft + s.lastX - s.startX}px`;
  s.tile.style.top = `${s.baseTop + s.lastY - s.startY}px`;
  const badge = grid.querySelector(`[data-remove-for="${CSS.escape(s.id)}"]`);
  if (badge) badge.hidden = true;
  updateDragTarget(s);
}

function updateDragTarget(s) {
  const grid = dragGridOf();
  if (!grid) return;
  const target = cellFromPoint({ x: s.lastX, y: s.lastY }, grid.getBoundingClientRect(), s.metrics, s.grab);
  const valid = canPlace(s.layout, s.id, { ...target, w: s.cell.w, h: s.cell.h }, s.columns);
  desktopUi = updateDrag(desktopUi, target, valid);
  drawDropHighlight(grid, target, s, valid);
}

function drawDropHighlight(grid, target, s, valid) {
  let highlight = grid.querySelector(":scope > .drop-highlight");
  if (!highlight) {
    highlight = createNode("div", "drop-highlight");
    highlight.setAttribute("aria-hidden", "true");
    grid.prepend(highlight);
  }
  highlight.dataset.valid = String(valid);
  highlight.style.setProperty("--x", String(Math.min(target.x, s.columns - s.cell.w)));
  highlight.style.setProperty("--y", String(Math.min(target.y, s.rows - s.cell.h)));
  highlight.style.setProperty("--w", String(s.cell.w));
  highlight.style.setProperty("--h", String(s.cell.h));
}

function stopDragFrame(s) {
  if (s?.frame) cancelAnimationFrame(s.frame);
  if (s) s.frame = 0;
}

// A re-render while dragging (e.g. weather data arrived) replaced the tiles: pick up the new node and redraw.
function reattachDrag() {
  const s = dragSession;
  const tile = favoritesRoot?.querySelector(`.desktop-grid > [data-widget-id="${CSS.escape(s.domId)}"]`);
  if (!tile || !desktopUi.editMode) {
    stopDragFrame(s);
    dragSession = null;
    desktopUi = endDrag(desktopUi);
    return;
  }
  s.tile = tile;
  if (s.started) applyDragVisuals(s);
}

function focusDragTile(domId) {
  const tile = favoritesRoot?.querySelector(`.desktop-grid > [data-widget-id="${CSS.escape(domId)}"]`);
  if (!(tile instanceof HTMLElement)) return;
  suppressTooltipOnFocus = true;
  try {
    tile.focus();
  } finally {
    suppressTooltipOnFocus = false;
  }
}

async function onDragPointerUp(event) {
  const s = dragSession;
  if (!s || event.pointerId !== s.pointerId) return;
  dragSession = null;
  stopDragFrame(s);
  if (!s.started) return; // below the threshold it is a tap: the click handler runs as before
  const drag = desktopUi.drag;
  desktopUi = endDrag(desktopUi);
  const target = drag?.target;
  if (drag?.valid && target && (target.x !== s.cell.x || target.y !== s.cell.y)) {
    // Atomic: on a write failure nothing is persisted, the re-render puts the tile back and #desktop-status says why.
    await runDesktopMutation((columns) => widgetsService.moveWidget(s.id, { x: target.x, y: target.y }, { columns }));
    focusDragTile(s.domId);
    return;
  }
  if (drag?.valid) {
    renderFavorites(); // dropped on its own cell: nothing to write
    focusDragTile(s.domId);
    return;
  }
  returnDraggedTile(s); // rejected drop: the tile animates back, nothing is written
}

function returnDraggedTile(s) {
  dragGridOf()?.querySelector(":scope > .drop-highlight")?.remove();
  const finish = () => {
    dropReturnTimer = 0;
    renderFavorites();
    focusDragTile(s.domId);
  };
  const grid = dragGridOf();
  if (prefersReducedMotion() || !grid || !s.tile.isConnected) {
    finish();
    return;
  }
  const origin = grid.getBoundingClientRect();
  const step = s.metrics.cell + s.metrics.gap;
  s.tile.classList.add("is-returning");
  s.tile.style.left = `${origin.left + s.cell.x * step}px`;
  s.tile.style.top = `${origin.top + s.cell.y * step}px`;
  dropReturnTimer = setTimeout(finish, DROP_RETURN_MS);
}

// Escape, pointercancel, window blur, the pointer leaving the window, a viewport resize, leaving edit mode.
function cancelDrag() {
  const s = dragSession;
  if (!s) return;
  dragSession = null;
  stopDragFrame(s);
  if (!s.started) return; // a pending press had changed nothing on screen
  desktopUi = endDrag(desktopUi);
  renderFavorites();
}

function applyPendingFocus() {
  if (!pendingFocus || favoritesBusy) {
    return;
  }

  const selectors = pendingFocus;
  pendingFocus = null;

  for (const selector of selectors) {
    const target = favoritesRoot?.querySelector(selector);
    if (target instanceof HTMLElement && !target.matches(":disabled")) {
      target.focus();
      return;
    }
  }
}

function setEditMode(on) {
  if (!on) cancelDrag();
  const before = desktopUi.editMode;
  desktopUi = on ? enterEditMode(desktopUi) : exitEditMode(desktopUi);
  if (desktopUi.editMode === before) return;
  showDesktopStatus("");
  announce(desktopUi.editMode ? "Editing layout. Activate Settings to finish." : "Layout editing off");
  renderFavorites();
}

function renderFavorites() {
  renderDesktop();
  applyPendingFocus();
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

    // R7 bootstrap order: legacy → widgets v1, v1 → v2, then ensure, then the first read. No read or mutation runs
    // before the v2 migration has succeeded; any failure locks the grid and leaves the stored data untouched.
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
        await migrateWidgetsToV2(syncStorageArea);
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
        await ensureWidgetsLayout(syncStorageArea);
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
    if (widgetsEnsureFailed) showDesktopStatus(ENSURE_FAILED_MESSAGE);
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

  // Normal mode: a link tile opens its URL, the hint tile opens the city modal. A click on the background does
  // nothing. The chrome tiles (Settings, Add) render but are wired by the edit-mode and add-link tasks.
  function handleFavoritesClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    if (event.target.closest('[data-chrome-role="settings"]')) {
      if (widgetsState && !widgetsNewer && !widgetsMigrationFailed) setEditMode(!desktopUi.editMode);
      return;
    }

    // Add: with no Add menu yet (Task 10) it opens the add-link dialog in both modes.
    if (event.target.closest(ADD_TILE_SELECTOR)) {
      if (!favoritesBusy && widgetsService && widgetsState) openDesktopDialog({ kind: "add-link" });
      return;
    }

    const target = event.target.closest("[data-favorite-action]");

    if (!(target instanceof HTMLElement) || favoritesBusy) {
      return;
    }

    const action = target.dataset.favoriteAction;

    if (action === "set-city") {
      if (!weatherBusy) showCityModal("change", HINT_TILE_SELECTOR);
    } else if (action === "open") {
      const favorite = widgetsState?.items.find(
        (item) => item.id === target.dataset.favoriteId
      );

      if (favorite) {
        window.location.assign(favorite.url);
      }
    }
  }

  favoritesRoot.addEventListener("click", handleFavoritesClick);

  // Background = the grid element or the root itself (gaps between tiles are background). A click needs pointerdown
  // AND pointerup on the background, so releasing a drag over it never exits.
  // Only a primary-button press of the primary pointer counts (a right click on the background never exits).
  const isBackground = (target) => target === favoritesRoot || (target instanceof Element && target.classList.contains("desktop-grid"));
  const isPrimaryPress = (event) => event.button === 0 && event.isPrimary;
  let backgroundPressed = false;
  favoritesRoot.addEventListener("pointerdown", (event) => {
    backgroundPressed = desktopUi.editMode && isPrimaryPress(event) && isBackground(event.target);
  });
  favoritesRoot.addEventListener("pointerup", (event) => {
    if (backgroundPressed && isPrimaryPress(event) && isBackground(event.target) && !desktopUi.drag) setEditMode(false);
    backgroundPressed = false;
  });
  favoritesRoot.addEventListener("pointercancel", () => {
    backgroundPressed = false;
  });

  // Drag: a press on a tile (never on a − badge, which is a sibling of its tile) may become a drag.
  favoritesRoot.addEventListener("pointerdown", (event) => {
    const tile = event.target instanceof Element ? event.target.closest("[data-widget-id]") : null;
    if (tile instanceof HTMLElement && !event.target.closest(".tile-remove")) beginPointerDrag(event, tile);
  });
  // Native image drag would steal the pointer (pointercancel) in edit mode.
  favoritesRoot.addEventListener("dragstart", (event) => {
    if (desktopUi.editMode) event.preventDefault();
  });
  window.addEventListener("pointermove", onDragPointerMove);
  window.addEventListener("pointerup", (event) => {
    void onDragPointerUp(event);
    // The trailing click of this press (if any) is dispatched before this timeout runs; clear the flag after it.
    if (suppressDragClick) setTimeout(() => { suppressDragClick = false; }, 0);
  });
  window.addEventListener("pointercancel", (event) => {
    if (dragSession && event.pointerId === dragSession.pointerId) cancelDrag();
    if (suppressDragClick) setTimeout(() => { suppressDragClick = false; }, 0);
  });
  // The pointer left the window (relatedTarget null and the point is outside the viewport).
  document.addEventListener("pointerout", (event) => {
    if (dragSession && event.relatedTarget === null && outsideViewport(event)) cancelDrag();
  });
  window.addEventListener("blur", () => {
    backgroundPressed = false;
    cancelDrag();
  });
  window.addEventListener(
    "click",
    (event) => {
      if (!suppressDragClick) return;
      suppressDragClick = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  // One Escape handler, topmost layer first: tooltip, city suggestions, city modal.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    // One layer per press, topmost first (desktopUiState.escapeLayer); the DOM-owned flags come from here.
    const layer = escapeLayer(desktopUi, {
      tooltip: !tooltipLayer.hidden,
      citySuggestions: isSuggestionsOpen(weatherUi),
      cityModal: Boolean(cityModalRoot)
    });
    if (layer === "drag") {
      event.preventDefault();
      cancelDrag();
      return;
    }
    if (layer === "tooltip") {
      hideTooltipIfVisible();
    } else if (layer === "citySuggestions") {
      activeCityForm?.cancelPending();
      weatherUi = hideSuggestions(weatherUi);
      activeCityForm?.renderSuggestions();
      activeCityForm?.focusField();
    } else if (layer === "cityModal") {
      // While a city request runs Escape does nothing at all (I1).
      if (!weatherBusy) hideCityModal({ dismiss: true });
    } else if (layer === "dialog") {
      if (!favoritesBusy) closeDesktopDialog();
    } else if (layer === "menu") {
      // Task 10 closes the Add menu here.
    } else if (layer === "exitEdit") {
      setEditMode(false);
    }
  });

  // Tab inside the open modal wraps; from body or outside it enters the modal (I3).
  document.addEventListener("keydown", (event) => {
    const trapRoot = cityModalRoot ?? desktopDialogRoot;
    if (event.key !== "Tab" || !trapRoot) return;
    const controls = [...trapRoot.querySelectorAll("input, button")].filter((el) => !el.disabled && !el.hidden);
    if (controls.length === 0) {
      event.preventDefault(); // busy: nothing to enter, focus stays on body and never leaves the page
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!(active instanceof Element) || !trapRoot.contains(active)) {
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
}

const CITY_INPUT_SELECTOR = 'input[name="city"]';
const HINT_TILE_SELECTOR = '[data-widget-id="weather:hint"]';

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
  renderFavorites();
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
  renderFavorites();
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
      renderFavorites();
      if (ok) {
        hideCityModal(); // selection never writes the flag
      } else {
        syncCityModal();
        cityModalRoot?.querySelector(CITY_INPUT_SELECTOR)?.focus();
      }
    }
  })();
}
