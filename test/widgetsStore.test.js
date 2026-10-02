import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  INVALID_WIDGETS_MESSAGE,
  V1_WIDGETS_MESSAGE,
  WIDGETS_META_KEY,
  createWidgetsStore,
  createInitialWidgetsState,
  inspectWidgetsMeta,
  isWidgetItem,
  isWidgetsState,
  migrateToWidgets,
  widgetItemStorageKey,
  withWidgetsMutationLock
} from "../src/widgetsStore.js";
import { MAX_FAVORITE_WIDGETS, NEWER_WIDGETS_MESSAGE, WEATHER_METRIC_IDS } from "../src/widgetsShared.js";

const NOW = "2026-07-07T10:00:00.000Z";

function favorite(overrides = {}) {
  return {
    id: "fav-1",
    type: "favorite",
    url: "https://example.com/",
    label: "Example",
    domain: "example.com",
    iconMode: "favicon",
    customIconUrl: null,
    backgroundColor: "#24292f",
    backgroundColorSource: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

const cell = (x = 0, y = 0, w = 1, h = 1) => ({ x, y, w, h });
// A favorite placed at grid column `i` of row 0 (v2 writes always carry a grid).
const placed = (overrides = {}, i = 0) => favorite({ grid: cell(i % 12, Math.floor(i / 12)), ...overrides });
const v2State = (items = [placed()]) => ({ version: 2, items, createdAt: NOW, updatedAt: NOW });

describe("widgetsStore", () => {
  it("creates an empty initial favorites state", () => {
    assert.deepEqual(createInitialWidgetsState(NOW), {
      version: 2,
      items: [],
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it("accepts a valid favorites state", () => {
    assert.equal(isWidgetsState(v2State()), true);
  });

  it("rejects invalid favorites state shapes", () => {
    const valid = v2State();

    assert.equal(isWidgetsState(null), false);
    assert.equal(isWidgetsState([]), false);
    assert.equal(isWidgetsState({ ...valid, version: 1 }), false);
    assert.equal(isWidgetsState({ ...valid, version: 3 }), false);
    assert.equal(isWidgetsState({ ...valid, items: "bad" }), false);
    assert.equal(isWidgetsState({ ...valid, createdAt: "bad-date" }), false);
    assert.equal(isWidgetsState({ ...valid, updatedAt: "" }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ id: "" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ url: "javascript:alert(1)" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ iconMode: "unknown" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ customIconUrl: "file:///tmp/a.png" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ backgroundColor: "red" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [placed({ backgroundColorSource: "remote" })] }), false);
  });

  it("validates an explicit tileSize when present, but tolerates its absence", () => {
    const base = v2State();

    assert.equal(isWidgetsState(base), true, "absent tileSize (legacy item)");
    assert.equal(
      isWidgetsState({ ...base, items: [placed({ tileSize: "square" })] }),
      true,
      "square"
    );
    assert.equal(
      isWidgetsState({ ...base, items: [placed({ tileSize: "wide" })] }),
      true,
      "wide"
    );
    assert.equal(
      isWidgetsState({ ...base, items: [placed({ tileSize: "huge" })] }),
      false,
      "unknown tileSize"
    );
  });

  it("rejects states above the item cap", () => {
    const state = v2State(
      Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, index) =>
        placed({
          id: `fav-${index}`,
          url: `https://example-${index}.com/`,
          domain: `example-${index}.com`
        }, index)
      )
    );

    assert.equal(isWidgetsState(state), false);
  });

  it("rejects invalid favorites state on set", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const invalidState = { version: 2, items: "bad", createdAt: NOW, updatedAt: NOW };

    await assert.rejects(() => store.setState(invalidState), {
      message: "Invalid widgets state"
    });
  });

  it("persists, reads, clears, and clones favorites state across a meta key and per-item keys", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const state = v2State();

    await store.setState(state);
    state.items[0].label = "Mutated after set";

    const loaded = await store.getState();
    assert.equal(loaded.items[0].label, "Example");
    assert.deepEqual(await storageArea.get(WIDGETS_META_KEY), {
      [WIDGETS_META_KEY]: {
        version: 2,
        order: ["fav-1"],
        createdAt: NOW,
        updatedAt: NOW
      }
    });
    assert.deepEqual(await storageArea.get(widgetItemStorageKey("fav-1")), {
      [widgetItemStorageKey("fav-1")]: loaded.items[0]
    });

    loaded.items[0].label = "Mutated after get";
    assert.equal((await store.getState()).items[0].label, "Example");

    await store.clearState();
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
    assert.deepEqual(await storageArea.get(null), {});
  });

  it("returns initial state when stored favorites are absent or corrupt", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });

    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));

    await storageArea.set({ [WIDGETS_META_KEY]: { version: 2, order: "bad" } });
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("preserves item order via meta.order across get/set roundtrips, independent of insertion", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const state = v2State([
      placed({ id: "fav-b", url: "https://b.example/", domain: "b.example" }, 0),
      placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" }, 1)
    ]);

    await store.setState(state);
    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-b", "fav-a"]);
  });

  it("removes the per-item key for a deleted favorite, leaving no orphan", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" }, 0);
    const itemB = placed({ id: "fav-b", url: "https://b.example/", domain: "b.example" }, 1);

    await store.setState(v2State([itemA, itemB]));
    await store.setState(v2State([itemA]));

    assert.deepEqual(await storageArea.get(widgetItemStorageKey("fav-b")), {});
    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-a"]);
  });

  it("tolerates a meta entry whose item key hasn't synced yet, rather than discarding everything", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await storageArea.set({
      [WIDGETS_META_KEY]: {
        version: 2,
        order: ["fav-a", "fav-missing"],
        createdAt: NOW,
        updatedAt: NOW
      },
      [widgetItemStorageKey("fav-a")]: itemA
    });

    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-a"]);
  });

  it("clearState removes the meta key and every currently-referenced item key", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await store.setState(v2State([itemA]));
    await store.clearState();

    assert.deepEqual(await storageArea.get(null), {});
  });

  it("surfaces a friendly error when the sync write exceeds quota, without leaving partial state", async () => {
    const storageArea = createMemoryStorageArea({}, { quotaBytesPerItem: 50 });
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = placed({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await assert.rejects(
      () => store.setState(v2State([itemA])),
      /Couldn't save this change to Chrome Sync/
    );

    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("accepts the favorite, weather-metric and chrome types and rejects a missing or unknown type", () => {
    assert.equal(isWidgetItem(favorite()), true);
    assert.equal(isWidgetItem(favorite({ type: undefined })), false);
    assert.equal(isWidgetItem(favorite({ type: "weather-metric" })), false);
    assert.equal(isWidgetItem(favorite({ type: "widget" })), false);
  });

  it("caps favorites at 200 per type", () => {
    const items = Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, index) =>
      placed({
        id: `fav-${index}`,
        url: `https://example-${index}.com/`,
        domain: `example-${index}.com`
      }, index)
    );
    const state = v2State(items);
    assert.equal(isWidgetsState(state), false);
    assert.equal(isWidgetsState({ ...state, items: items.slice(0, MAX_FAVORITE_WIDGETS) }), true);
  });

  it("persists each item's grid and writes a meta without columns or position", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    await store.setState(v2State([placed({ grid: cell(3, 2) })]));

    const loaded = await store.getState();
    assert.deepEqual(loaded.items[0].grid, cell(3, 2));
    assert.deepEqual((await storageArea.get(WIDGETS_META_KEY))[WIDGETS_META_KEY], {
      version: 2,
      order: ["fav-1"],
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it("keeps a v2 state with an empty item list readable", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await store.setState(v2State([]));
    assert.deepEqual((await store.getState()).items, []);
  });

  it("accepts a wide tile when it carries a grid (the grid, not the column count, owns placement)", () => {
    assert.equal(isWidgetsState(v2State([placed({ tileSize: "wide", grid: cell(0, 0, 2, 1) })])), true);
  });
});

// Legacy key shapes, re-declared because favoritesStore.js no longer exists.
const LEGACY_META_KEY = "quietTabFavoritesMeta";
const LEGACY_BLOB_KEY = "quietTabFavorites";
const legacyItemKey = (id) => `quietTabFavorite:${id}`;

function legacyFavorite(overrides = {}) {
  const { type: _type, ...rest } = favorite(overrides); // legacy items have no `type`
  return rest;
}

function legacyArea(ids, { itemOverrides = () => ({}) } = {}) {
  const values = {
    [LEGACY_META_KEY]: { version: 1, order: ids, createdAt: NOW, updatedAt: NOW }
  };
  ids.forEach((id, index) => {
    values[legacyItemKey(id)] = legacyFavorite({
      id,
      url: `https://ex-${index}.example/`,
      domain: `ex-${index}.example`,
      ...itemOverrides(index)
    });
  });
  return values;
}

function bytesOf(values) {
  const encoder = new TextEncoder();
  return Object.entries(values).reduce(
    (sum, [key, value]) => sum + encoder.encode(key).length + encoder.encode(JSON.stringify(value)).length,
    0
  );
}

// The migration still writes the v1 layout (Task 3 converts it to v2): read it raw, not through the v2 store.
async function readV1(area) {
  const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
  if (!meta) return { meta: undefined, items: [] };
  const stored = await area.get(meta.order.map(widgetItemStorageKey));
  return { meta, items: meta.order.map((id) => stored[widgetItemStorageKey(id)]).filter(Boolean) };
}

function setup(syncValues = {}, localValues = {}, syncOptions = {}) {
  const local = createMemoryStorageArea(localValues);
  const sync = createMemoryStorageArea(syncValues, syncOptions);
  const store = createWidgetsStore(sync, { now: () => NOW });
  const migrate = () => migrateToWidgets(local, sync, { now: () => NOW });
  return { local, sync, store, migrate };
}

describe("migrateToWidgets", () => {
  it("no-ops when there is nothing to migrate", async () => {
    const { sync, store, migrate } = setup();
    assert.deepEqual(await migrate(), { migrated: false });
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
    assert.deepEqual(await sync.get(null), {});
  });

  it("migrates sharded legacy favorites: tags each item, keeps order, clears legacy keys", async () => {
    const { sync, migrate } = setup(legacyArea(["fav-a", "fav-b"]));

    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });

    const state = await readV1(sync);
    assert.deepEqual(state.items.map((item) => item.id), ["fav-a", "fav-b"]);
    assert.ok(state.items.every((item) => item.type === "favorite"));
    assert.equal(state.meta.columns, 2, "two square tiles → two columns");
    assert.equal(state.meta.position, "top");
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
    assert.deepEqual(await sync.get(legacyItemKey("fav-a")), {});
    assert.deepEqual(await sync.get(legacyItemKey("fav-b")), {});
  });

  it("derives the default columns from tile spans so the row does not re-wrap (Review Focus #4)", async () => {
    const { sync, migrate } = setup(
      legacyArea(["fav-a", "fav-b"], {
        itemOverrides: (index) => (index === 0 ? { tileSize: "wide" } : {})
      })
    );
    await migrate();
    assert.equal((await readV1(sync)).meta.columns, 3, "wide (2) + square (1)");
  });

  it("never manufactures a wide tile in a 1-column grid", async () => {
    const { sync, migrate } = setup(
      legacyArea(["fav-a"], { itemOverrides: () => ({ tileSize: "wide" }) })
    );
    await migrate();
    assert.equal((await readV1(sync)).meta.columns, 2);
  });

  it("clamps the default columns to 12 and uses 6 for an empty legacy set", async () => {
    const many = setup(legacyArea(Array.from({ length: 20 }, (_, i) => `fav-${i}`)));
    await many.migrate();
    assert.equal((await readV1(many.sync)).meta.columns, 12);

    const empty = setup(legacyArea([]));
    assert.deepEqual(await empty.migrate(), { migrated: true, source: "sharded-favorites" });
    assert.equal((await readV1(empty.sync)).meta.columns, 6);
  });

  it("drops duplicate ids and invalid legacy items instead of writing an invalid meta", async () => {
    const values = legacyArea(["fav-a", "fav-a", "fav-bad", "fav-b"]);
    values[legacyItemKey("fav-bad")] = { id: "fav-bad", url: "not a url" };
    const { sync, migrate } = setup(values);

    await migrate();
    assert.deepEqual((await readV1(sync)).items.map((item) => item.id), ["fav-a", "fav-b"]);
  });

  it("is idempotent when run twice in a row (Review Focus #3)", async () => {
    const { sync, migrate } = setup(legacyArea(["fav-a"]));
    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });
    assert.deepEqual(await migrate(), { migrated: false });
    assert.deepEqual((await readV1(sync)).items.map((item) => item.id), ["fav-a"]);
  });

  it("is safe when two pages migrate concurrently (Review Focus #3)", async () => {
    const { sync, migrate } = setup(legacyArea(["fav-a", "fav-b"]));
    const results = await Promise.all([migrate(), migrate()]);

    assert.equal(results.filter((result) => result.migrated).length, 1);
    assert.deepEqual((await readV1(sync)).items.map((item) => item.id), ["fav-a", "fav-b"]);
  });

  it("serializes with widgets mutations through the shared lock", async () => {
    const { sync, migrate } = setup(legacyArea(["fav-a"]));
    const order = [];
    const held = withWidgetsMutationLock(async () => {
      order.push("mutation-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("mutation-end");
    });
    const migrated = migrate().then(() => order.push("migrated"));
    await Promise.all([held, migrated]);
    assert.deepEqual(order, ["mutation-start", "mutation-end", "migrated"]);
    assert.equal((await readV1(sync)).items.length, 1);
  });

  it("never overwrites existing widgets and removes stale legacy keys (widgets meta wins)", async () => {
    const { sync, migrate } = setup({
      ...legacyArea(["old-a", "old-b"]),
      [WIDGETS_META_KEY]: { version: 1, order: ["new-1"], columns: 4, position: "center", createdAt: NOW, updatedAt: NOW },
      [widgetItemStorageKey("new-1")]: favorite({ id: "new-1" })
    });

    assert.deepEqual(await migrate(), { migrated: false, discardedStale: true });

    const state = await readV1(sync);
    assert.deepEqual(state.items.map((item) => item.id), ["new-1"]);
    assert.equal(state.meta.columns, 4);
    assert.equal(state.meta.position, "center");
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
    assert.deepEqual(await sync.get(legacyItemKey("old-a")), {});
  });

  it("migrates the oldest single-blob format through the same writer (Review Focus #5)", async () => {
    const blob = { version: 1, items: [legacyFavorite()], createdAt: NOW, updatedAt: NOW };
    const { local, sync, migrate } = setup({}, { [LEGACY_BLOB_KEY]: blob });

    assert.deepEqual(await migrate(), { migrated: true, source: "legacy-blob" });

    assert.deepEqual(await local.get(LEGACY_BLOB_KEY), {});
    const state = await readV1(sync);
    assert.deepEqual(state.items.map((item) => item.id), ["fav-1"]);
    assert.equal(state.items[0].type, "favorite");
  });

  it("discards a corrupt single blob instead of retrying it forever", async () => {
    const { local, migrate } = setup({}, { [LEGACY_BLOB_KEY]: { version: 1, items: "bad" } });
    assert.deepEqual(await migrate(), { migrated: false, discardedCorrupt: true });
    assert.deepEqual(await local.get(LEGACY_BLOB_KEY), {});
  });

  it("leaves legacy data untouched and writes no widgets meta when the write fails (Review Focus #1)", async () => {
    const { sync, migrate } = setup(legacyArea(["fav-a"]), {}, { quotaBytesPerItem: 1 });

    await assert.rejects(migrate, /Couldn't save this change to Chrome Sync/);

    assert.notDeepEqual(await sync.get(LEGACY_META_KEY), {});
    assert.notDeepEqual(await sync.get(legacyItemKey("fav-a")), {});
    assert.deepEqual(await sync.get(WIDGETS_META_KEY), {});
  });

  it("does not clear the legacy blob key when the sync write throws", async () => {
    const blob = { version: 1, items: [legacyFavorite()], createdAt: NOW, updatedAt: NOW };
    const { local, sync, migrate } = setup({}, { [LEGACY_BLOB_KEY]: blob }, { quotaBytesPerItem: 1 });

    await assert.rejects(migrate, /Couldn't save this change to Chrome Sync/);

    assert.deepEqual(await local.get(LEGACY_BLOB_KEY), { [LEGACY_BLOB_KEY]: blob });
    assert.deepEqual(await sync.get(WIDGETS_META_KEY), {});
  });

  it("stays under the sync TOTAL quota by deleting legacy keys chunk by chunk (Review Focus #1)", async () => {
    const ids = Array.from({ length: 100 }, (_, index) => `fav-${index}`);
    const values = legacyArea(ids);
    // Room for the legacy set plus ~40% — an all-at-once write (which needs ~2x) fails.
    const { sync, migrate } = setup(values, {}, { quotaBytes: Math.ceil(bytesOf(values) * 1.4) });

    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });

    assert.equal((await readV1(sync)).items.length, 100);
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
  });

  it("resumes an interrupted run, preferring an item's new key over its legacy key", async () => {
    const values = legacyArea(["fav-a", "fav-b", "fav-c"]);
    // Simulate a crash after chunk 1 wrote fav-a's new key but before its legacy key was
    // removed: BOTH keys exist, with different labels. The new key must win.
    values[legacyItemKey("fav-a")].label = "Legacy label";
    values[widgetItemStorageKey("fav-a")] = favorite({
      id: "fav-a",
      label: "New label",
      url: "https://ex-0.example/",
      domain: "ex-0.example"
    });
    const { sync, migrate } = setup(values);

    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });

    const state = await readV1(sync);
    assert.deepEqual(state.items.map((item) => item.id), ["fav-a", "fav-b", "fav-c"]);
    assert.equal(state.items[0].label, "New label");
    assert.deepEqual(await sync.get(legacyItemKey("fav-a")), {});
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
  });
});

function metric(id = "weather:temperature", overrides = {}) {
  return { id, type: "weather-metric", enabled: true, ...overrides };
}
function metaOf(order, overrides = {}) {
  return { version: 2, order, createdAt: NOW, updatedAt: NOW, ...overrides };
}

describe("weather-metric widgets", () => {
  it("validates metric items strictly", () => {
    assert.equal(isWidgetItem(metric()), true);
    assert.equal(isWidgetItem(metric("weather:nope")), false);
    assert.equal(isWidgetItem(metric("weather:uv", { tileSize: "huge" })), false);
    assert.equal(isWidgetItem(metric("weather:uv", { enabled: "yes" })), false);
    const { enabled, ...missing } = metric();
    assert.equal(isWidgetItem(missing), false);
  });

  it("accepts 200 favorites plus 4 metrics (204) and rejects a fifth metric or duplicate ids", () => {
    const favs = Array.from({ length: 200 }, (_, i) => placed({ id: `f${i}` }, i));
    const metrics = WEATHER_METRIC_IDS.map((id, i) => metric(id, { grid: cell(i, 20) }));
    const state = { version: 2, createdAt: NOW, updatedAt: NOW, items: [...favs, ...metrics] };
    assert.equal(isWidgetsState(state), true);
    assert.equal(isWidgetsState({ ...state, items: [...state.items, metric("weather:uv", { grid: cell(5, 20) })] }), false);
    assert.equal(isWidgetsState({ ...state, items: [favs[0], favs[0]] }), false);
  });

  it("round-trips metrics through the store in order", async () => {
    const area = createMemoryStorageArea();
    const store = createWidgetsStore(area, { now: () => NOW });
    const items = [placed({ id: "a" }), metric("weather:uv", { enabled: false, grid: cell(1, 0) })];
    await store.setState({ ...createInitialWidgetsState(NOW), items });
    assert.deepEqual((await store.getState()).items, items);
  });
});

describe("inspectWidgetsMeta", () => {
  it("classifies missing, valid, newer and invalid", () => {
    assert.equal(inspectWidgetsMeta({}), "missing");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"]) }), "valid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 3 }) }), "newer");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 3 } }), "newer");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 2, order: "x" } }), "invalid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: null }), "invalid");
    assert.equal(
      inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW } }),
      "v1"
    );
  });
});

describe("setState over a newer meta", () => {
  it("refuses to write and leaves storage untouched", async () => {
    const newer = metaOf(["a"], { version: 3 });
    const area = createMemoryStorageArea({ [WIDGETS_META_KEY]: newer });
    const store = createWidgetsStore(area, { now: () => NOW });
    await assert.rejects(
      store.setState({ ...createInitialWidgetsState(NOW), items: [placed()] }),
      { message: NEWER_WIDGETS_MESSAGE }
    );
    assert.deepEqual(await area.get(null), { [WIDGETS_META_KEY]: newer });
  });

  it("assertWritable rejects a newer, v1 or invalid meta and resolves for a valid or missing one", async () => {
    const newerStore = createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 3 }) }));
    await assert.rejects(newerStore.assertWritable(), { message: NEWER_WIDGETS_MESSAGE });
    await createWidgetsStore(createMemoryStorageArea()).assertWritable();
    await createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"]) })).assertWritable();
    await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: { version: 2, order: "x" } })).assertWritable(), { message: INVALID_WIDGETS_MESSAGE });
    const v1 = { version: 1, order: ["a"], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW };
    await assert.rejects(createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: v1 })).assertWritable(), { message: V1_WIDGETS_MESSAGE });
  });
});

describe("migrateToWidgets over a newer meta", () => {
  it("neither migrates nor cleans up legacy keys", async () => {
    const sync = createMemoryStorageArea({
      [WIDGETS_META_KEY]: metaOf(["a"], { version: 3 }),
      quietTabFavoritesMeta: { version: 1, order: ["x"], createdAt: NOW, updatedAt: NOW },
      "quietTabFavorite:x": favorite({ id: "x", type: undefined })
    });
    const before = await sync.get(null);
    const result = await migrateToWidgets(createMemoryStorageArea(), sync);
    assert.deepEqual(result, { migrated: false, newer: true });
    assert.deepEqual(await sync.get(null), before);
  });
});
