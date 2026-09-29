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
  MAX_FAVORITE_WIDGETS,
  MAX_GRID_COLUMNS,
  MAX_WIDGETS,
  MIN_GRID_COLUMNS,
  WIDGETS_MUTATION_LOCK_NAME,
  WIDGET_TYPES
} from "./widgetsShared.js";
import { defaultColumnsForItems } from "./widgetsLayout.js";

export const WIDGETS_META_KEY = "quietTabWidgetsMeta";

// One lock instance for the whole extension: every widgets mutation AND the migration
// run through it, so two new-tab pages can never interleave read-modify-write cycles.
export const withWidgetsMutationLock = createMutationLock(WIDGETS_MUTATION_LOCK_NAME);

const WIDGETS_VERSION = 1;
const SYNC_WRITE_ERROR =
  "Couldn't save this change to Chrome Sync — it may be full, offline, or temporarily unavailable. Try removing a few favorites or try again shortly.";

export function widgetItemStorageKey(id) {
  return `quietTabWidget:${id}`;
}

export function createInitialWidgetsState(now = new Date().toISOString()) {
  return {
    version: WIDGETS_VERSION,
    items: [],
    columns: DEFAULT_GRID_COLUMNS,
    position: "top",
    createdAt: now,
    updatedAt: now
  };
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

export function isWidgetItem(value) {
  if (!isRecord(value) || !WIDGET_TYPES.has(value.type)) {
    return false;
  }

  // Phase 2 adds the "weather-metric" branch here.
  return value.type === "favorite" ? isFavoriteWidgetItem(value) : false;
}

function isColumns(value) {
  return Number.isInteger(value) && value >= MIN_GRID_COLUMNS && value <= MAX_GRID_COLUMNS;
}

function isWidgetsMeta(value) {
  const requiredFields = ["version", "order", "columns", "position", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION &&
    Array.isArray(value.order) &&
    value.order.length <= MAX_WIDGETS &&
    value.order.every(isNonEmptyString) &&
    new Set(value.order).size === value.order.length &&
    isColumns(value.columns) &&
    GRID_POSITIONS.has(value.position) &&
    isParseableTimestamp(value.createdAt) &&
    isParseableTimestamp(value.updatedAt)
  );
}

export function isWidgetsState(value) {
  const requiredFields = ["version", "items", "columns", "position", "createdAt", "updatedAt"];

  return (
    isRecord(value) &&
    hasOwnFields(value, requiredFields) &&
    value.version === WIDGETS_VERSION &&
    Array.isArray(value.items) &&
    value.items.length <= MAX_WIDGETS &&
    value.items.filter((item) => item?.type === "favorite").length <= MAX_FAVORITE_WIDGETS &&
    value.items.every(isWidgetItem) &&
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
    columns: state.columns,
    position: state.position,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt
  };
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

export function createWidgetsStore(
  storageArea,
  { now = () => new Date().toISOString() } = {}
) {
  return {
    async getState() {
      const meta = await readMeta(storageArea);

      if (!meta) {
        return createInitialWidgetsState(now());
      }

      if (meta.order.length === 0) {
        const empty = {
          version: WIDGETS_VERSION,
          items: [],
          columns: meta.columns,
          position: meta.position,
          createdAt: meta.createdAt,
          updatedAt: meta.updatedAt
        };
        return isWidgetsState(empty) ? empty : createInitialWidgetsState(now());
      }

      const itemKeys = meta.order.map(widgetItemStorageKey);
      const itemsResult = await storageArea.get(itemKeys);
      const items = meta.order
        .map((id) => itemsResult[widgetItemStorageKey(id)])
        .filter((item) => isWidgetItem(item));

      const candidate = {
        version: WIDGETS_VERSION,
        items,
        columns: meta.columns,
        position: meta.position,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt
      };
      return isWidgetsState(candidate)
        ? cloneValue(candidate)
        : createInitialWidgetsState(now());
    },

    async setState(state) {
      if (!isWidgetsState(state)) {
        throw new Error("Invalid widgets state");
      }

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

// ---------------------------------------------------------------------------
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
  if (!isWidgetsState(state)) {
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

  await setOrThrow(storageArea, { [WIDGETS_META_KEY]: buildWidgetsMeta(state) });
}

export function migrateToWidgets(
  localStorageArea,
  syncStorageArea,
  { now = () => new Date().toISOString() } = {}
) {
  return withWidgetsMutationLock(async () => {
    const existingMeta = await readMeta(syncStorageArea);

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
          version: WIDGETS_VERSION,
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
        version: WIDGETS_VERSION,
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
