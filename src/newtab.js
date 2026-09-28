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
import { createWidgetsStore, migrateToWidgets } from "./widgetsStore.js";
import { gridLayout, tileSpan } from "./widgetsLayout.js";
import {
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS
} from "./widgetsShared.js";
import { searchCities, usAqiCategory, uvIndexLevel } from "./weatherApi.js";
import {
  formatPm25,
  formatPrecipitation,
  formatTemperature,
  rainTone,
  temperatureTone,
  usAqiTone,
  uvTone
} from "./weatherPresentation.js";
import { createWeatherService } from "./weatherService.js";
import { createWeatherCacheStore, createWeatherLocationStore } from "./weatherStore.js";
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
const weatherRoot = document.querySelector("#weather");

// Phase 1 only: the weather panel is still a separate fixed element at the bottom and
// its height changes (tile row vs. the city form with suggestions). Publish the space it
// needs so the favorites bar's bottom/center positions and its max height never overlap
// it. Read-only with respect to weather; Phase 2 moves weather into the grid and
// deletes this block and the --weather-reserve variable.
if (weatherRoot && typeof ResizeObserver === "function") {
  const publishWeatherReserve = () => {
    const { height } = weatherRoot.getBoundingClientRect();
    const bottomInset = Number.parseFloat(getComputedStyle(weatherRoot).bottom) || 0;
    document.documentElement.style.setProperty(
      "--weather-reserve",
      `${Math.ceil(height + bottomInset + 8)}px`
    );
  };

  new ResizeObserver(publishWeatherReserve).observe(weatherRoot);
  window.addEventListener("resize", publishWeatherReserve);
  publishWeatherReserve();
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

let tooltipIdSeq = 0;

function createTooltip(triggerNode, text) {
  triggerNode.dataset.tooltipTrigger = "";
  const tooltip = createNode("div", "tooltip", text);
  tooltip.id = `tooltip-${tooltipIdSeq++}`;
  tooltip.setAttribute("role", "tooltip");
  triggerNode.setAttribute("aria-describedby", tooltip.id);
  triggerNode.appendChild(tooltip);
  return tooltip;
}

function createStatus(text, { error = false, live = "polite" } = {}) {
  const status = createNode(
    "p",
    error ? "status status--error" : "status",
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
let pendingGearFocus = false;
let weatherResult = null;
let weatherUi = createInitialWeatherUiState();
let weatherFormError = "";
let weatherBusy = false;
let weatherFormGeneration = 0;

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
  gear.setAttribute("aria-label", "Manage quick links");
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

function renderFavoritesToolbar() {
  if (!favoritesRoot) {
    return;
  }

  if (widgetsMigrationFailed) {
    favoritesRoot.replaceChildren(
      createStatus(favoritesError, { error: true, live: "assertive" })
    );
    return;
  }

  const layout = gridLayout(widgetsState);
  favoritesRoot.dataset.position = layout.position;

  const fragment = document.createDocumentFragment();
  const items = widgetsState?.items ?? [];

  if (items.length > 0) {
    const list = createNode("div", "favorites-grid");
    list.style.setProperty("--columns", String(layout.columns));
    for (const item of items) {
      list.appendChild(createFavoriteTile(item, layout.columns));
    }
    fragment.appendChild(list);
  }

  fragment.appendChild(createFavoritesGear());
  favoritesRoot.replaceChildren(fragment);
}

function renderFavoritesPanel() {
  if (!favoritesPanelRoot) {
    return;
  }

  favoritesPanelRoot.dataset.barPosition = gridLayout(widgetsState).position;

  const open = isSettingsOpen(favoritesUi);
  favoritesPanelRoot.hidden = !open;

  if (!open) {
    favoritesPanelRoot.replaceChildren();
    return;
  }

  const fragment = document.createDocumentFragment();
  const items = widgetsState?.items ?? [];

  const top = createNode("div", "favorites-panel__top");
  const heading = createNode("div");
  heading.appendChild(createNode("h2", null, "Quick links"));
  heading.appendChild(
    createNode("p", null, "Add, reorder, and style your links — all from one place.")
  );
  const addButton = createIconButton("button button--primary", "Add link", "plus");
  addButton.type = "button";
  addButton.dataset.favoriteAction = "start-add";
  addButton.disabled = favoritesBusy || isFormOpen(favoritesUi);
  top.append(heading, addButton);
  fragment.appendChild(top);

  if (widgetsState) {
    fragment.appendChild(createGridSettingsRow(widgetsState));
  }

  if (isAdding(favoritesUi)) {
    fragment.appendChild(createFavoriteForm(null));
  }

  const currentEditingId = editingId(favoritesUi);
  const editingItem = items.find((item) => item.id === currentEditingId);
  if (editingItem) {
    fragment.appendChild(createFavoriteForm(editingItem));
  }

  const listWrap = createNode("div", "favorites-panel__list");
  items.forEach((item, index) => {
    listWrap.appendChild(createFavoritesPanelRow(item, index, items.length));
  });
  fragment.appendChild(listWrap);

  if (favoritesError) {
    fragment.appendChild(
      createStatus(favoritesError, { error: true, live: "assertive" })
    );
  }

  favoritesPanelRoot.replaceChildren(fragment);
}

function renderFavorites() {
  renderFavoritesToolbar();
  renderFavoritesPanel();

  if (pendingGearFocus) {
    pendingGearFocus = false;
    const gear = favoritesRoot?.querySelector('[data-favorite-action="open-settings"]');
    if (gear instanceof HTMLElement) {
      gear.focus();
    }
  }
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

    if (hasStorageArea(localStorageArea) && hasStorageArea(syncStorageArea)) {
      try {
        await migrateToWidgets(localStorageArea, syncStorageArea);
      } catch (error) {
        widgetsMigrationFailed = true;
        favoritesError =
          "Couldn't move your favorites to the new layout — Chrome Sync storage may be full or unavailable. Free up some sync space, then reload this tab to try again. Your favorites are kept.";
        renderFavorites();
        return;
      }
    }

    try {
      widgetsState = await widgetsService.getState();
      renderFavorites();
    } catch (error) {
      favoritesError = error instanceof Error ? error.message : String(error);
      renderFavorites();
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

    if (action === "open-settings") {
      favoritesUi = openSettings(favoritesUi);
      favoritesError = "";
      renderFavorites();
    } else if (action === "start-add") {
      favoritesUi = startAdd(favoritesUi);
      favoritesError = "";
      renderFavorites();
    } else if (action === "cancel") {
      favoritesUi = cancelForm(favoritesUi);
      favoritesError = "";
      renderFavorites();
    } else if (action === "edit") {
      const id = target.dataset.favoriteId;
      if (id) {
        favoritesUi = startEdit(favoritesUi, id);
        favoritesError = "";
        renderFavorites();
      }
    } else if (action === "delete") {
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
    if (event.key !== "Escape" || favoritesBusy) {
      return;
    }

    if (isSettingsOpen(favoritesUi)) {
      favoritesUi = closeSettings(favoritesUi);
      favoritesError = "";
      pendingGearFocus = true;
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
    pendingGearFocus = true;
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
          favoritesUi = cancelForm(favoritesUi);
          favoritesError = "";
        });

        if (added) {
          void refreshAutoAccent(added.id);
        }
      } catch (error) {
        finishFavoritesAction(generation, () => {
          favoritesError = error instanceof Error ? error.message : String(error);
        });
      }
    })();
  });
}

if (weatherRoot) {
  function createWeatherForm(location) {
    weatherFormGeneration += 1;
    const formGeneration = weatherFormGeneration;
    weatherUi = hideSuggestions(weatherUi);

    const form = createNode("form", "weather-form");
    form.dataset.weatherForm = "city";

    const input = createNode("input", "favorite-input");
    input.name = "city";
    input.type = "text";
    input.placeholder = "City";
    input.value = location ? location.name : "";
    input.required = true;
    input.autocomplete = "off";
    input.disabled = weatherBusy;

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

    form.appendChild(row);

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

    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isSuggestionsOpen(weatherUi)) {
        cancelPendingSuggestionRequest();
        weatherUi = hideSuggestions(weatherUi);
        renderSuggestionsList();
      }
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

    return form;
  }

  function createWeatherTile({ size, tone, primary, secondary = null, tooltipText }) {
    const tile = createNode("div", `weather-tile weather-tile--${size}`);
    tile.dataset.weatherTone = tone;
    tile.tabIndex = 0;

    const values = createNode("div", "weather-tile__values");
    values.appendChild(createNode("span", "weather-tile__primary", primary));
    if (secondary) {
      values.appendChild(createNode("span", "weather-tile__secondary", secondary));
    }
    tile.appendChild(values);

    createTooltip(tile, tooltipText);
    return tile;
  }

  function renderWeatherTiles(data) {
    const tiles = createNode("div", "weather-tiles");

    tiles.appendChild(
      createWeatherTile({
        size: "square",
        tone: temperatureTone({
          todayAt15: data.temperatureTodayAt15,
          yesterdayAt15: data.temperatureYesterdayAt15
        }),
        primary: formatTemperature(data.temperature),
        tooltipText: `Currently ${formatTemperature(data.temperature)}°. Today at 15:00 — ${formatTemperature(data.temperatureTodayAt15)}°, yesterday at 15:00 — ${formatTemperature(data.temperatureYesterdayAt15)}°.`
      })
    );

    const [rainPrimary, rainSecondary] = formatPrecipitation(
      data.precipitationProbabilityMax,
      data.precipitationStartHour
    );
    tiles.appendChild(
      createWeatherTile({
        size: "wide",
        tone: rainTone(data.precipitationProbabilityMax),
        primary: rainPrimary,
        secondary: rainSecondary,
        tooltipText: data.precipitationStartHour
          ? `Chance of rain for the rest of the day — ${rainPrimary}, expected from ${data.precipitationStartHour}.`
          : `Chance of rain for the rest of the day — ${rainPrimary}.`
      })
    );

    tiles.appendChild(
      createWeatherTile({
        size: "wide",
        tone: usAqiTone(data.usAqi),
        primary: String(data.usAqi),
        secondary: `${formatPm25(data.pm2_5)} PM2.5`,
        tooltipText: `US AQI ${data.usAqi} (${usAqiCategory(data.usAqi)}), PM2.5 ${formatPm25(data.pm2_5)} µg/m³.`
      })
    );

    tiles.appendChild(
      createWeatherTile({
        size: "square",
        tone: uvTone(data.uvIndex),
        primary: String(data.uvIndex),
        tooltipText: `Current UV index ${data.uvIndex} (${uvIndexLevel(data.uvIndex)}). Today's peak — ${data.uvIndexMax} (${uvIndexLevel(data.uvIndexMax)}).`
      })
    );

    return tiles;
  }

  function renderWeather() {
    const fragment = document.createDocumentFragment();

    if (!weatherService) {
      fragment.appendChild(createNode("h2", "title", "Weather"));
      fragment.appendChild(
        createStatus("Chrome APIs for weather are unavailable.", {
          error: true,
          live: "assertive"
        })
      );
      weatherRoot.replaceChildren(fragment);
      return;
    }

    const location = weatherResult?.location ?? null;
    const showForm = !location || isEditingCity(weatherUi);

    if (showForm) {
      fragment.appendChild(
        createNode("h2", "title", location ? location.name : "Set a city")
      );
      fragment.appendChild(createWeatherForm(location));

      if (weatherFormError) {
        fragment.appendChild(
          createStatus(weatherFormError, { error: true, live: "assertive" })
        );
      }

      weatherRoot.replaceChildren(fragment);
      return;
    }

    const { status, data, error } = weatherResult;

    const gear = createNode("button", "favorite-settings");
    gear.type = "button";
    gear.dataset.weatherAction = "edit-city";
    gear.setAttribute("aria-label", "Change city");
    gear.appendChild(createIconNode("settings", { size: 20 }));

    if (status === "ready" || status === "stale") {
      fragment.appendChild(renderWeatherTiles(data));
    }

    fragment.appendChild(gear);

    if (status === "stale") {
      const staleStatus = createStatus("Couldn't refresh");
      staleStatus.classList.add("weather-status");
      fragment.appendChild(staleStatus);
    }

    if (status === "error") {
      fragment.appendChild(createStatus(error, { error: true, live: "assertive" }));
    }

    weatherRoot.replaceChildren(fragment);
  }

  void (async () => {
    if (!weatherService) {
      renderWeather();
      return;
    }

    try {
      weatherResult = await weatherService.initialize();
    } catch (error) {
      weatherResult = {
        status: "error",
        location: null,
        data: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }

    renderWeather();
  })();

  weatherRoot.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const target = event.target.closest("[data-weather-action]");

    if (!(target instanceof HTMLElement) || weatherBusy) {
      return;
    }

    const action = target.dataset.weatherAction;

    if (action === "edit-city") {
      weatherUi = startEditingCity(weatherUi);
      weatherFormError = "";
      renderWeather();
    } else if (action === "cancel-edit-city") {
      weatherUi = stopEditingCity(weatherUi);
      weatherFormError = "";
      renderWeather();
    } else if (action === "select-city") {
      const location = {
        name: target.dataset.cityName,
        country: target.dataset.cityCountry ?? "",
        latitude: Number(target.dataset.cityLatitude),
        longitude: Number(target.dataset.cityLongitude)
      };

      weatherUi = hideSuggestions(weatherUi);
      weatherBusy = true;
      renderWeather();

      void (async () => {
        try {
          weatherResult = await weatherService.selectLocation(location);
          weatherUi = stopEditingCity(weatherUi);
          weatherFormError = "";
        } catch (error) {
          weatherFormError = error instanceof Error ? error.message : String(error);
        } finally {
          weatherBusy = false;
          renderWeather();
        }
      })();
    }
  });

  weatherRoot.addEventListener("submit", (event) => {
    const form = event.target;

    if (!(form instanceof HTMLFormElement) || form.dataset.weatherForm !== "city") {
      return;
    }

    event.preventDefault();

    if (weatherBusy || !weatherService) {
      return;
    }

    const cityName = String(new FormData(form).get("city") ?? "").trim();

    if (!cityName) {
      return;
    }

    weatherBusy = true;
    renderWeather();

    void (async () => {
      try {
        weatherResult = await weatherService.setCity(cityName);
        weatherUi = stopEditingCity(weatherUi);
        weatherFormError = "";
      } catch (error) {
        weatherFormError = error instanceof Error ? error.message : String(error);
      } finally {
        weatherBusy = false;
        renderWeather();
      }
    })();
  });
}
