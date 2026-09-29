import { withWidgetsMutationLock } from "./widgetsStore.js";
import { moveTargetIndex } from "./widgetsLayout.js";
import {
  GRID_POSITIONS,
  MAX_FAVORITE_WIDGETS,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS
} from "./widgetsShared.js";
import {
  BACKGROUND_COLOR_SOURCES,
  HEX_COLOR_VALIDATION_PATTERN,
  ICON_MODES,
  TILE_SIZES,
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

function normalizeTileSize(tileSize) {
  if (!TILE_SIZES.has(tileSize)) {
    throw new Error("Choose a supported tile size");
  }

  return tileSize;
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

function normalizeMoveDirection(direction) {
  if (typeof direction !== "number" || !Number.isFinite(direction)) {
    throw new Error("Move direction must be a finite number");
  }

  return Math.sign(direction);
}

function findFavoriteIndex(state, id) {
  return state.items.findIndex((item) => item.type === "favorite" && item.id === id);
}

function normalizeColumns(columns) {
  // Number(null)/Number("")/Number([]) are 0 and are rejected by the range check;
  // Number(undefined)/Number({}) are NaN and are rejected by isInteger.
  const value = typeof columns === "string" ? Number(columns.trim() === "" ? NaN : columns) : Number(columns);
  if (!Number.isInteger(value) || value < MIN_GRID_COLUMNS || value > MAX_GRID_COLUMNS) {
    throw new Error(
      `Choose a number of columns between ${MIN_GRID_COLUMNS} and ${MAX_GRID_COLUMNS}`
    );
  }
  return value;
}

function normalizePosition(position) {
  if (!GRID_POSITIONS.has(position)) {
    throw new Error("Choose a supported grid position");
  }
  return position;
}

export function createWidgetsService({
  store,
  now = () => new Date().toISOString(),
  createId = createDefaultId,
  defaultBackgroundColor = () => "#24292f"
}) {
  return {
    getState() {
      return store.getState();
    },

    async addFavorite(input) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const payload = inputObject(input);
        const state = await store.getState();

        const favoriteCount = state.items.filter((item) => item.type === "favorite").length;
        if (favoriteCount >= MAX_FAVORITE_WIDGETS) {
          throw new Error(`You can save up to ${MAX_FAVORITE_WIDGETS} favorites`);
        }

        const createdAt = now();
        const normalizedUrl = normalizeFavoriteUrl(payload.url);
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
          tileSize: normalizeTileSize(payload.tileSize ?? "square"),
          createdAt,
          updatedAt: createdAt
        };

        return store.setState({
          ...state,
          items: state.items.toSpliced(
            state.items.findLastIndex((entry) => entry.type === "favorite") + 1,
            0,
            item
          ),
          updatedAt: createdAt
        });
      });
    },

    async updateFavorite(id, input) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const payload = inputObject(input);
        const state = await store.getState();
        const index = findFavoriteIndex(state, id);

        if (index === -1) {
          throw new Error("Favorite not found");
        }

        const updatedAt = now();
        const current = state.items[index];
        const nextItem = { ...current };

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
          nextItem.backgroundColorSource = normalizeBackgroundColorSource(
            payload.backgroundColorSource
          );
        } else if (Object.hasOwn(payload, "backgroundColor")) {
          nextItem.backgroundColorSource = deriveBackgroundColorSource(
            payload,
            "auto"
          );
        }

        if (Object.hasOwn(payload, "tileSize")) {
          nextItem.tileSize = normalizeTileSize(payload.tileSize);
        }

        nextItem.updatedAt = updatedAt;

        const items = state.items.with(index, nextItem);
        return store.setState({
          ...state,
          items,
          updatedAt
        });
      });
    },

    async deleteFavorite(id) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const state = await store.getState();
        const index = findFavoriteIndex(state, id);

        if (index === -1) {
          throw new Error("Favorite not found");
        }

        const updatedAt = now();
        return store.setState({
          ...state,
          items: state.items.filter((item) => item.id !== id),
          updatedAt
        });
      });
    },

    async updateWeatherMetric(id, input) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const payload = inputObject(input);
        const state = await store.getState();
        const index = state.items.findIndex((item) => item.type === "weather-metric" && item.id === id);

        if (index === -1) {
          throw new Error("Weather tile not found");
        }

        const next = { ...state.items[index] };
        if (Object.hasOwn(payload, "tileSize")) {
          next.tileSize = normalizeTileSize(payload.tileSize);
        }
        if (Object.hasOwn(payload, "enabled")) {
          if (typeof payload.enabled !== "boolean") {
            throw new Error("Choose whether the weather tile is shown");
          }
          next.enabled = payload.enabled;
        }

        return store.setState({ ...state, items: state.items.with(index, next), updatedAt: now() });
      });
    },

    async moveWidget(id, direction) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const state = await store.getState();
        const index = state.items.findIndex((item) => item.id === id);

        if (index === -1) {
          throw new Error("Widget not found");
        }

        const step = normalizeMoveDirection(direction);
        const target = moveTargetIndex(state.items, index, step);
        if (target === -1) {
          return state;
        }

        const updatedAt = now();
        const items = [...state.items];
        const [moved] = items.splice(index, 1);
        items.splice(target, 0, moved);
        return store.setState({ ...state, items, updatedAt });
      });
    },

    async setColumns(columns) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const nextColumns = normalizeColumns(columns);
        const state = await store.getState();
        return store.setState({ ...state, columns: nextColumns, updatedAt: now() });
      });
    },

    async setPosition(position) {
      return withWidgetsMutationLock(async () => {
        await store.assertWritable();
        const nextPosition = normalizePosition(position);
        const state = await store.getState();
        return store.setState({ ...state, position: nextPosition, updatedAt: now() });
      });
    }
  };
}
