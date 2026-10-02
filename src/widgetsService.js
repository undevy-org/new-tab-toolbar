import { withWidgetsMutationLock } from "./widgetsStore.js";
import {
  canPlace,
  defaultSize,
  displayLayout,
  isValidGrid,
  placeNew,
  placeResized,
  sizeOf
} from "./desktopLayout.js";
import { MAX_FAVORITE_WIDGETS, MAX_GRID_COLUMNS } from "./widgetsShared.js";
import {
  BACKGROUND_COLOR_SOURCES,
  HEX_COLOR_VALIDATION_PATTERN,
  ICON_MODES,
  trimString
} from "./favoritesShared.js";

const URL_SCHEME_PATTERN = /^([a-z][a-z\d+.-]*):(.*)$/i;

function hasUrlScheme(value) {
  const match = value.match(URL_SCHEME_PATTERN);

  if (!match) {
    return false;
  }

  const [, , rest] = match;
  if (rest.startsWith("//")) {
    return true;
  }

  return !isHostPortWithoutScheme(rest);
}

function isHostPortWithoutScheme(rest) {
  return /^\d+(?:[/?#]|$)/.test(rest);
}

function ensureUrlProtocol(input) {
  const value = trimString(input);

  if (value === "") {
    throw new Error("Enter a URL");
  }

  return hasUrlScheme(value) ? value : `https://${value}`;
}

function ensureNullableUrlProtocol(input) {
  const value = trimString(input);
  return hasUrlScheme(value) ? value : `https://${value}`;
}

export function normalizeFavoriteUrl(input) {
  const value = ensureUrlProtocol(input);
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }

  return {
    url: parsed.href,
    domain: parsed.hostname
  };
}

export function normalizeNullableImageUrl(input) {
  const value = trimString(input);

  if (value === "") {
    return null;
  }

  let parsed;
  try {
    parsed = new URL(ensureNullableUrlProtocol(value));
  } catch {
    throw new Error("Enter a valid image URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https image URLs are supported");
  }

  return parsed.href;
}

function normalizeLabel(label, domain) {
  return trimString(label) || domain;
}

function normalizeIconMode(iconMode) {
  if (!ICON_MODES.has(iconMode)) {
    throw new Error("Choose a supported icon mode");
  }

  return iconMode;
}

function normalizeBackgroundColorSource(backgroundColorSource) {
  if (!BACKGROUND_COLOR_SOURCES.has(backgroundColorSource)) {
    throw new Error("Choose a supported background color source");
  }

  return backgroundColorSource;
}

function deriveBackgroundColorSource(input, fallbackSource) {
  const source =
    input.backgroundColorSource ??
    (trimString(input.backgroundColor) ? "manual" : fallbackSource);

  return normalizeBackgroundColorSource(source);
}

function normalizeBackgroundColor(backgroundColor, domain, defaultBackgroundColor) {
  const color =
    trimString(backgroundColor) || trimString(defaultBackgroundColor(domain));

  if (!HEX_COLOR_VALIDATION_PATTERN.test(color)) {
    throw new Error("Use a hex color like #24292f");
  }

  return color.toLowerCase();
}

function inputObject(input) {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
}

function createDefaultId() {
  return `fav-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeSpan(value, name) {
  if (value !== 1 && value !== 2) {
    throw new Error(`Choose a supported tile ${name}`);
  }
  return value;
}

// The caller passes the current column count (effectiveColumns of the viewport): every explicit mutation
// is computed against the DISPLAYED layout (spec § Writes) and persists the displayed grid of every widget.
function requireColumns(options) {
  const columns = options?.columns;
  if (!Number.isInteger(columns) || columns < 2 || columns > MAX_GRID_COLUMNS) {
    throw new Error("The current column count is required");
  }
  return columns;
}

function placeholderGrid(item) {
  const size = item.type === "weather-metric" ? defaultSize(item.id) : sizeOf(item);
  return { x: 0, y: 0, w: size.w, h: size.h };
}

// Resolve every widget to a valid stored grid: on-grid ones to their displayed cell, hidden metrics keep (or get)
// a placeholder that is ignored while hidden.
function rebase(state, columns) {
  const layout = displayLayout(state.items, columns);
  return {
    ...state,
    items: state.items.map((item) => ({
      ...item,
      grid: layout.get(item.id) ?? (isValidGrid(item.grid) ? item.grid : placeholderGrid(item))
    }))
  };
}

export class PlacementError extends Error {
  constructor(message = "That spot is taken") {
    super(message);
    this.name = "PlacementError";
    this.code = "PLACEMENT_REJECTED";
  }
}

function withGrid(items, id, grid) {
  return items.map((item) => (item.id === id ? { ...item, grid } : item));
}

export function createWidgetsService({
  store,
  now = () => new Date().toISOString(),
  createId = createDefaultId,
  defaultBackgroundColor = () => "#24292f"
}) {
  async function mutate(options, build) {
    return withWidgetsMutationLock(async () => {
      await store.assertWritable();
      const columns = requireColumns(options);
      const base = rebase(await store.getState(), columns);
      const updatedAt = now();
      const items = build({ base, columns, updatedAt });
      return store.setState({ ...base, items, updatedAt });
    });
  }

  return {
    getState() {
      return store.getState();
    },

    // input.w / input.h (1 or 2, default 1×1). The new link takes the first free block from (0,0).
    addFavorite(input, options) {
      const payload = inputObject(input);
      return mutate(options, ({ base, columns, updatedAt }) => {
        const favoriteCount = base.items.filter((item) => item.type === "favorite").length;
        if (favoriteCount >= MAX_FAVORITE_WIDGETS) {
          throw new Error(`You can save up to ${MAX_FAVORITE_WIDGETS} favorites`);
        }

        const normalizedUrl = normalizeFavoriteUrl(payload.url);
        const size = { w: normalizeSpan(payload.w ?? 1, "width"), h: normalizeSpan(payload.h ?? 1, "height") };
        const layout = displayLayout(base.items, columns);
        const item = {
          id: createId(),
          type: "favorite",
          url: normalizedUrl.url,
          label: normalizeLabel(payload.label, normalizedUrl.domain),
          domain: normalizedUrl.domain,
          iconMode: normalizeIconMode(payload.iconMode ?? "favicon"),
          customIconUrl: normalizeNullableImageUrl(payload.customIconUrl),
          backgroundColor: normalizeBackgroundColor(
            payload.backgroundColor,
            normalizedUrl.domain,
            defaultBackgroundColor
          ),
          backgroundColorSource: deriveBackgroundColorSource(payload, "auto"),
          grid: placeNew(layout, size, columns),
          createdAt: updatedAt,
          updatedAt
        };
        return [...base.items, item];
      });
    },

    updateFavorite(id, input, options) {
      const payload = inputObject(input);
      return mutate(options, ({ base, columns, updatedAt }) => {
        const index = base.items.findIndex((item) => item.type === "favorite" && item.id === id);
        if (index === -1) {
          throw new Error("Favorite not found");
        }

        const nextItem = { ...base.items[index] };
        delete nextItem.tileSize; // v2 writes never carry the legacy size

        if (Object.hasOwn(payload, "url")) {
          const normalizedUrl = normalizeFavoriteUrl(payload.url);
          nextItem.url = normalizedUrl.url;
          nextItem.domain = normalizedUrl.domain;
        }
        if (Object.hasOwn(payload, "label")) {
          nextItem.label = normalizeLabel(payload.label, nextItem.domain);
        }
        if (Object.hasOwn(payload, "iconMode")) {
          nextItem.iconMode = normalizeIconMode(payload.iconMode);
        }
        if (Object.hasOwn(payload, "customIconUrl")) {
          nextItem.customIconUrl = normalizeNullableImageUrl(payload.customIconUrl);
        }
        if (Object.hasOwn(payload, "backgroundColor")) {
          nextItem.backgroundColor = normalizeBackgroundColor(
            payload.backgroundColor,
            nextItem.domain,
            defaultBackgroundColor
          );
        }
        if (Object.hasOwn(payload, "backgroundColorSource")) {
          nextItem.backgroundColorSource = normalizeBackgroundColorSource(payload.backgroundColorSource);
        } else if (Object.hasOwn(payload, "backgroundColor")) {
          nextItem.backgroundColorSource = deriveBackgroundColorSource(payload, "auto");
        }
        if (Object.hasOwn(payload, "w") || Object.hasOwn(payload, "h")) {
          const size = {
            w: normalizeSpan(payload.w ?? nextItem.grid.w, "width"),
            h: normalizeSpan(payload.h ?? nextItem.grid.h, "height")
          };
          nextItem.grid = placeResized(displayLayout(base.items, columns), id, size, columns);
        }
        nextItem.updatedAt = updatedAt;
        return base.items.with(index, nextItem);
      });
    },

    deleteFavorite(id, options) {
      return mutate(options, ({ base }) => {
        if (!base.items.some((item) => item.type === "favorite" && item.id === id)) {
          throw new Error("Favorite not found");
        }
        return base.items.filter((item) => item.id !== id);
      });
    },

    // payload: { enabled?: boolean, w?: 1|2, h?: 1|2 }. Hiding keeps the placeholder grid; restoring takes the first
    // free block for its size.
    updateWeatherMetric(id, input, options) {
      const payload = inputObject(input);
      return mutate(options, ({ base, columns }) => {
        const index = base.items.findIndex((item) => item.type === "weather-metric" && item.id === id);
        if (index === -1) {
          throw new Error("Weather tile not found");
        }

        const current = base.items[index];
        const next = { ...current };
        delete next.tileSize;
        let size = { w: current.grid.w, h: current.grid.h };
        if (Object.hasOwn(payload, "w") || Object.hasOwn(payload, "h")) {
          size = {
            w: normalizeSpan(payload.w ?? size.w, "width"),
            h: normalizeSpan(payload.h ?? size.h, "height")
          };
        }

        if (Object.hasOwn(payload, "enabled")) {
          if (typeof payload.enabled !== "boolean") {
            throw new Error("Choose whether the weather tile is shown");
          }
          next.enabled = payload.enabled;
        }

        const layout = displayLayout(base.items, columns);
        if (next.enabled && !current.enabled) {
          next.grid = placeNew(layout, size, columns);
        } else if (next.enabled) {
          next.grid = placeResized(layout, id, size, columns);
        } else {
          next.grid = { ...current.grid, ...size };
        }
        return base.items.with(index, next);
      });
    },

    // Drop at cell (x, y). Rejected with PlacementError when the block overlaps, overflows or is too far below.
    moveWidget(id, target, options) {
      return mutate(options, ({ base, columns }) => {
        const layout = displayLayout(base.items, columns);
        const current = layout.get(id);
        if (!current) {
          throw new Error("Widget not found");
        }
        const next = { x: target?.x, y: target?.y, w: current.w, h: current.h };
        if (!isValidGrid(next) || !canPlace(layout, id, next, columns)) {
          throw new PlacementError();
        }
        return withGrid(base.items, id, next);
      });
    }
  };
}
