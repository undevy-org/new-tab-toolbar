// src/widgetsStore.js
import { createMutationLock } from "./mutationLock.js";
import {
  cloneValue,
  hasOwnFields,
  isNonEmptyString,
  isParseableTimestamp,
  isRecord
} from "./storeUtils.js";
import {
  BACKGROUND_COLOR_SOURCES,
  HEX_COLOR_VALIDATION_PATTERN,
  ICON_MODES,
  TILE_SIZES
} from "./favoritesShared.js";
import {
  DEFAULT_GRID_COLUMNS,
  GRID_POSITIONS,
  MAX_CHROME_WIDGETS,
  MAX_FAVORITE_WIDGETS,
  MAX_GRID_COLUMNS,
  MAX_WEATHER_METRIC_WIDGETS,
  MAX_WIDGETS,
  MIN_GRID_COLUMNS,
  NEWER_WIDGETS_MESSAGE,
  WEATHER_METRIC_IDS,
  WIDGETS_MUTATION_LOCK_NAME,
  WIDGET_TYPES
} from "./widgetsShared.js";
import { defaultColumnsForItems } from "./widgetsLayout.js";
import { CHROME_IDS, isValidGrid, migrateV1ToV2, placeMissing } from "./desktopLayout.js";

export const WIDGETS_META_KEY = "quietTabWidgetsMeta";

// One lock instance for the whole extension: every widgets mutation AND the migrations
// run through it, so two new-tab pages can never interleave read-modify-write cycles.
export const withWidgetsMutationLock = createMutationLock(WIDGETS_MUTATION_LOCK_NAME);

const WIDGETS_VERSION = 2;
const WIDGETS_VERSION_V1 = 1;
const SYNC_WRITE_ERROR =
  "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few favorites or try again shortly.";

export function widgetItemStorageKey(id) {
  return `quietTabWidget:${id}`;
}

export function createInitialWidgetsState(now = new Date().toISOString()) {
  return { version: WIDGETS_VERSION, items: [], createdAt: now, updatedAt: now };
}

function isHttpUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isCustomIconUrl(value) {
  return value === null || isHttpUrl(value);
}

function isOptionalTileSize(value) {
  return !Object.hasOwn(value, "tileSize") || TILE_SIZES.has(value.tileSize);
}

function isFavoriteWidgetItem(value) {
  const requiredFields = [
    "id",
    "type",
    "url",
    "label",
    "domain",
    "iconMode",
    "customIconUrl",
    "backgroundColor",
    "backgroundColorSource",
    "createdAt",
    "updatedAt"
  ];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.type === "favorite" &&
    isNonEmptyString(value.id) &&
    isHttpUrl(value.url) &&
    isNonEmptyString(value.label) &&
    isNonEmptyString(value.domain) &&
    ICON_MODES.has(value.iconMode) &&
    isCustomIconUrl(value.customIconUrl) &&
    isOptionalTileSize(value) &&
    typeof value.backgroundColor === "string" &&
    HEX_COLOR_VALIDATION_PATTERN.test(value.backgroundColor) &&
    BACKGROUND_COLOR_SOURCES.has(value.backgroundColorSource) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

// v1 items carry `tileSize`; v2 items do not (it stays optional so migrated items can keep it for one release).
function isWeatherMetricItem(value) {
  return (
    hasOwnFields(value, ["id", "type", "enabled"]) &&
    value.type === "weather-metric" &&
    WEATHER_METRIC_IDS.includes(value.id) &&
    isOptionalTileSize(value) &&
    typeof value.enabled === "boolean"
  );
}

const CHROME_ROLE_BY_ID = { [CHROME_IDS.settings]: "settings", [CHROME_IDS.add]: "add" };

function isChromeItem(value) {
  return (
    hasOwnFields(value, ["id", "type", "role"]) &&
    value.type === "chrome" &&
    CHROME_ROLE_BY_ID[value.id] === value.role
  );
}

// Field-level validity. The grid is checked separately: reads tolerate a missing/invalid grid (spec § Reading grid).
export function isWidgetItem(value) {
  if (!isRecord(value) || !WIDGET_TYPES.has(value.type)) {
    return false;
  }
  if (value.type === "favorite") return isFavoriteWidgetItem(value);
  if (value.type === "weather-metric") return isWeatherMetricItem(value);
  return isChromeItem(value);
}

function hasValidGrid(item) {
  return isValidGrid(item.grid) && (item.type !== "chrome" || (item.grid.w === 1 && item.grid.h === 1));
}

function isStrictWidgetItem(value) {
  return isWidgetItem(value) && hasValidGrid(value);
}

function countOf(items, type) {
  return items.filter((item) => item?.type === type).length;
}

// `lenient` is for reads: items may lack a valid grid. Writes (setState) are strict: every item has one.
function isWidgetsStateWith(value, itemCheck) {
  const requiredFields = ["version", "items", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION &&
    Array.isArray(value.items) &&
    value.items.length <= MAX_WIDGETS &&
    countOf(value.items, "favorite") <= MAX_FAVORITE_WIDGETS &&
    countOf(value.items, "weather-metric") <= MAX_WEATHER_METRIC_WIDGETS &&
    countOf(value.items, "chrome") <= MAX_CHROME_WIDGETS &&
    new Set(value.items.map((item) => item?.id)).size === value.items.length &&
    value.items.every(itemCheck) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

export function isWidgetsState(value) {
  return isWidgetsStateWith(value, isStrictWidgetItem);
}

function isWidgetsMeta(value) {
  const requiredFields = ["version", "order", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_WIDGETS &&
    value.order.every(isNonEmptyString) &&
    new Set(value.order).size === value.order.length &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

function isColumns(value) {
  return Number.isInteger(value) && value >= MIN_GRID_COLUMNS && value <= MAX_GRID_COLUMNS;
}

// The pre-desktop (version 1) meta: still read by the v1 -> v2 migration.
function isWidgetsMetaV1(value) {
  const requiredFields = ["version", "order", "columns", "position", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION_V1 &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS &&
    value.order.every(isNonEmptyString) &&
    new Set(value.order).size === value.order.length &&
    isColumns(value.columns) &&
    GRID_POSITIONS.has(value.position) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

function isWidgetsStateV1(value) {
  const requiredFields = ["version", "items", "columns", "position", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION_V1 &&
    Array.isArray(value.items) &&
    value.items.length <= MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS &&
    countOf(value.items, "favorite") <= MAX_FAVORITE_WIDGETS &&
    countOf(value.items, "weather-metric") <= MAX_WEATHER_METRIC_WIDGETS &&
    new Set(value.items.map((item) => item?.id)).size === value.items.length &&
    value.items.every((item) => isWidgetItem(item) && item.type !== "chrome") &&
    isColumns(value.columns) &&
    GRID_POSITIONS.has(value.position) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

function buildWidgetsMeta(state) {
  return {
    version: WIDGETS_VERSION,
    order: state.items.map((item) => item.id),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

function buildWidgetsMetaV1(state) {
  return {
    version: WIDGETS_VERSION_V1,
    order: state.items.map((item) => item.id),
    columns: state.columns,
    position: state.position,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
}

// `result` is what storageArea.get(WIDGETS_META_KEY) returned.
// missing | valid (v2) | v1 (valid pre-desktop meta, to be migrated) | newer (version above ours) | invalid
export function inspectWidgetsMeta(result) {
  if (!Object.hasOwn(result ?? {}, WIDGETS_META_KEY)) {
    return "missing";
  }
  const raw = result[WIDGETS_META_KEY];
  if (isWidgetsMeta(raw)) {
    return "valid";
  }
  if (isWidgetsMetaV1(raw)) {
    return "v1";
  }
  if (isRecord(raw) && Number.isInteger(raw.version) && raw.version > WIDGETS_VERSION) {
    return "newer";
  }
  return "invalid";
}

async function readMeta(storageArea) {
  const result = await storageArea.get(WIDGETS_META_KEY);
  const meta = result?.[WIDGETS_META_KEY];
  return isWidgetsMeta(meta) ? meta : null;
}

async function setOrThrow(storageArea, payload) {
  try {
    await storageArea.set(payload);
  } catch (cause) {
    throw new Error(SYNC_WRITE_ERROR, { cause });
  }
}

// A read keeps an item whose fields are valid but whose grid is missing or malformed: the grid is dropped and
// the item is "unplaced" (displayLayout gives it a cell). A read never deletes a key.
function readItem(value) {
  if (!isWidgetItem(value)) return null;
  if (value.grid === undefined || hasValidGrid(value)) return value;
  const { grid: _dropped, ...rest } = value;
  return rest;
}

export function createWidgetsStore(
  storageArea,
  { now = () => new Date().toISOString() } = {}
) {
  async function assertWritable() {
    if (inspectWidgetsMeta(await storageArea.get(WIDGETS_META_KEY)) === "newer") {
      throw new Error(NEWER_WIDGETS_MESSAGE);
    }
  }

  return {
    assertWritable,

    // Items may lack `grid` (unplaced); callers lay them out with displayLayout. Order is `meta.order`.
    async getState() {
      const meta = await readMeta(storageArea);

      if (!meta) {
        return createInitialWidgetsState(now());
      }

      const itemKeys = meta.order.map(widgetItemStorageKey);
      const itemsResult = itemKeys.length > 0 ? await storageArea.get(itemKeys) : {};
      const items = meta.order
        .map((id) => readItem(itemsResult[widgetItemStorageKey(id)]))
        .filter((item) => item !== null);

      const candidate = {
        version: WIDGETS_VERSION,
        items,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      };
      return isWidgetsStateWith(candidate, isWidgetItem)
        ? cloneValue(candidate)
        : createInitialWidgetsState(now());
    },

    async setState(state) {
      if (!isWidgetsState(state)) {
        throw new Error("Invalid widgets state");
      }
      await assertWritable();

      const nextState = cloneValue(state);
      const previousMeta = await readMeta(storageArea);
      const previousOrder = previousMeta?.order ?? [];
      const nextIds = new Set(nextState.items.map((item) => item.id));
      const removedIds = previousOrder.filter((id) => !nextIds.has(id));

      const writePayload = { [WIDGETS_META_KEY]: buildWidgetsMeta(nextState) };
      for (const item of nextState.items) {
        writePayload[widgetItemStorageKey(item.id)] = item;
      }

      await setOrThrow(storageArea, writePayload);

      if (removedIds.length > 0) {
        await storageArea.remove(removedIds.map(widgetItemStorageKey));
      }

      return cloneValue(nextState);
    },

    async clearState() {
      const meta = await readMeta(storageArea);
      const order = meta?.order ?? [];
      await storageArea.remove([WIDGETS_META_KEY, ...order.map(widgetItemStorageKey)]);
    }
  };
}

// Migration from the pre-unification favorites-only storage.
//
// Legacy keys are read only here. Rules (see the spec's "Migration" section):
//  - a valid quietTabWidgetsMeta is authoritative and is never overwritten;
//  - writes are chunked and the meta is written LAST, so the total sync quota
//    (100KB) is never exceeded and an interrupted run simply resumes;
//  - the whole thing runs under the shared mutation lock.
// ---------------------------------------------------------------------------
const LEGACY_FAVORITES_BLOB_KEY = "quietTabFavorites";
const LEGACY_FAVORITES_META_KEY = "quietTabFavoritesMeta";
const legacyFavoriteItemStorageKey = (id) => `quietTabFavorite:${id}`;
const MIGRATION_CHUNK_SIZE = 25;

function tagFavorite(item) {
  return isRecord(item) ? { ...item, type: "favorite" } : item;
}

function uniqueValidItems(candidates) {
  const seen = new Set();
  const items = [];

  for (const candidate of candidates) {
    if (!isWidgetItem(candidate) || seen.has(candidate.id)) {
      continue;
    }
    seen.add(candidate.id);
    items.push(candidate);
    if (items.length === MAX_FAVORITE_WIDGETS) {
      break;
    }
  }

  return items;
}

async function writeMigratedState(storageArea, state, legacyItemKeyFor) {
  if (!isWidgetsStateV1(state)) {
    throw new Error("Invalid widgets state");
  }

  for (let start = 0; start < state.items.length; start += MIGRATION_CHUNK_SIZE) {
    const chunk = state.items.slice(start, start + MIGRATION_CHUNK_SIZE);
    await setOrThrow(
      storageArea,
      Object.fromEntries(chunk.map((item) => [widgetItemStorageKey(item.id), item]))
    );
    if (legacyItemKeyFor) {
      await storageArea.remove(chunk.map((item) => legacyItemKeyFor(item.id)));
    }
  }

  await setOrThrow(storageArea, { [WIDGETS_META_KEY]: buildWidgetsMetaV1(state) });
}

export function migrateToWidgets(
  localStorageArea,
  syncStorageArea,
  { now = () => new Date().toISOString() } = {}
) {
  return withWidgetsMutationLock(async () => {
    const widgetsMetaResult = await syncStorageArea.get(WIDGETS_META_KEY);
    const metaKind = inspectWidgetsMeta(widgetsMetaResult);
    if (metaKind === "newer") {
      return { migrated: false, newer: true };
    }
    const existingMeta = metaKind === "valid" || metaKind === "v1" ? widgetsMetaResult[WIDGETS_META_KEY] : null;

    const legacyMetaResult = await syncStorageArea.get(LEGACY_FAVORITES_META_KEY);
    const legacyMeta = legacyMetaResult?.[LEGACY_FAVORITES_META_KEY];
    const legacyIds =
      isRecord(legacyMeta) && Array.isArray(legacyMeta.order)
        ? [...new Set(legacyMeta.order.filter(isNonEmptyString))]
        : null;

    const blobResult = await localStorageArea.get(LEGACY_FAVORITES_BLOB_KEY);
    const hasBlob = Object.hasOwn(blobResult ?? {}, LEGACY_FAVORITES_BLOB_KEY);

    if (existingMeta) {
      // Widgets are authoritative. Whatever legacy data is still around is a stale
      // duplicate (an interrupted earlier run, or an older-version device syncing it
      // back) and only consumes sync quota.
      if (legacyIds === null && !hasBlob) {
        return { migrated: false };
      }
      if (legacyIds !== null) {
        await syncStorageArea.remove([
          LEGACY_FAVORITES_META_KEY,
          ...legacyIds.map(legacyFavoriteItemStorageKey)
        ]);
      }
      if (hasBlob) {
        await localStorageArea.remove(LEGACY_FAVORITES_BLOB_KEY);
      }
      return { migrated: false, discardedStale: true };
    }

    if (legacyIds !== null) {
      const legacyItems = await syncStorageArea.get(legacyIds.map(legacyFavoriteItemStorageKey));
      const resumedItems = await syncStorageArea.get(legacyIds.map(widgetItemStorageKey));

      const items = uniqueValidItems(
        legacyIds.map((id) => {
          const resumed = resumedItems[widgetItemStorageKey(id)];
          return isWidgetItem(resumed)
            ? resumed
            : tagFavorite(legacyItems[legacyFavoriteItemStorageKey(id)]);
        })
      );

      const nowValue = now();
      await writeMigratedState(
        syncStorageArea,
        {
          version: WIDGETS_VERSION_V1,
          items,
          columns: defaultColumnsForItems(items),
          position: "top",
          createdAt: isParseableTimestamp(legacyMeta.createdAt) ? legacyMeta.createdAt : nowValue,
          updatedAt: nowValue
        },
        legacyFavoriteItemStorageKey
      );

      await syncStorageArea.remove([
        LEGACY_FAVORITES_META_KEY,
        ...legacyIds.map(legacyFavoriteItemStorageKey)
      ]);
      return { migrated: true, source: "sharded-favorites" };
    }

    if (!hasBlob) {
      return { migrated: false };
    }

    const legacyBlob = blobResult[LEGACY_FAVORITES_BLOB_KEY];
    const rawItems =
      isRecord(legacyBlob) && Array.isArray(legacyBlob.items) ? legacyBlob.items : null;
    const taggedItems = rawItems?.map(tagFavorite);
    const isValidBlob =
      rawItems !== null &&
      rawItems.length <= MAX_FAVORITE_WIDGETS &&
      taggedItems.every(isWidgetItem) &&
      isParseableTimestamp(legacyBlob.createdAt) &&
      isParseableTimestamp(legacyBlob.updatedAt);

    if (!isValidBlob) {
      await localStorageArea.remove(LEGACY_FAVORITES_BLOB_KEY);
      return { migrated: false, discardedCorrupt: true };
    }

    const items = uniqueValidItems(taggedItems);
    await writeMigratedState(
      syncStorageArea,
      {
        version: WIDGETS_VERSION_V1,
        items,
        columns: defaultColumnsForItems(items),
        position: "top",
        createdAt: legacyBlob.createdAt,
        updatedAt: now()
      },
      null
    );

    await localStorageArea.remove(LEGACY_FAVORITES_BLOB_KEY);
    return { migrated: true, source: "legacy-blob" };
  });
}
