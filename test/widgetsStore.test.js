import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  WIDGETS_META_KEY,
  createWidgetsStore,
  createInitialWidgetsState,
  ensureWeatherMetrics,
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

describe("widgetsStore", () => {
  it("creates an empty initial favorites state", () => {
    assert.deepEqual(createInitialWidgetsState(NOW), {
      version: 1, columns: 6, position: "top",
      items: [],
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it("accepts a valid favorites state", () => {
    assert.equal(
      isWidgetsState({
        version: 1, columns: 6, position: "top",
        items: [favorite()],
        createdAt: NOW,
        updatedAt: NOW
      }),
      true
    );
  });

  it("rejects invalid favorites state shapes", () => {
    const valid = {
      version: 1, columns: 6, position: "top",
      items: [favorite()],
      createdAt: NOW,
      updatedAt: NOW
    };

    assert.equal(isWidgetsState(null), false);
    assert.equal(isWidgetsState([]), false);
    assert.equal(isWidgetsState({ ...valid, version: 2 }), false);
    assert.equal(isWidgetsState({ ...valid, items: "bad" }), false);
    assert.equal(isWidgetsState({ ...valid, createdAt: "bad-date" }), false);
    assert.equal(isWidgetsState({ ...valid, updatedAt: "" }), false);
    assert.equal(isWidgetsState({ ...valid, items: [favorite({ id: "" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [favorite({ url: "javascript:alert(1)" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [favorite({ iconMode: "unknown" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [favorite({ customIconUrl: "file:///tmp/a.png" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [favorite({ backgroundColor: "red" })] }), false);
    assert.equal(isWidgetsState({ ...valid, items: [favorite({ backgroundColorSource: "remote" })] }), false);
  });

  it("validates an explicit tileSize when present, but tolerates its absence", () => {
    const base = {
      version: 1, columns: 6, position: "top",
      items: [favorite()],
      createdAt: NOW,
      updatedAt: NOW
    };

    assert.equal(isWidgetsState(base), true, "absent tileSize (legacy item)");
    assert.equal(
      isWidgetsState({ ...base, items: [favorite({ tileSize: "square" })] }),
      true,
      "square"
    );
    assert.equal(
      isWidgetsState({ ...base, items: [favorite({ tileSize: "wide" })] }),
      true,
      "wide"
    );
    assert.equal(
      isWidgetsState({ ...base, items: [favorite({ tileSize: "huge" })] }),
      false,
      "unknown tileSize"
    );
  });

  it("rejects states above the item cap", () => {
    const state = {
      version: 1, columns: 6, position: "top",
      items: Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, index) =>
        favorite({
          id: `fav-${index}`,
          url: `https://example-${index}.com/`,
          domain: `example-${index}.com`
        })
      ),
      createdAt: NOW,
      updatedAt: NOW
    };

    assert.equal(isWidgetsState(state), false);
  });

  it("rejects invalid favorites state on set", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const invalidState = {
      version: 1, columns: 6, position: "top",
      items: "bad",
      createdAt: NOW,
      updatedAt: NOW
    };

    await assert.rejects(() => store.setState(invalidState), {
      message: "Invalid widgets state"
    });
  });

  it("persists, reads, clears, and clones favorites state across a meta key and per-item keys", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const state = {
      version: 1, columns: 6, position: "top",
      items: [favorite()],
      createdAt: NOW,
      updatedAt: NOW
    };

    await store.setState(state);
    state.items[0].label = "Mutated after set";

    const loaded = await store.getState();
    assert.equal(loaded.items[0].label, "Example");
    assert.deepEqual(await storageArea.get(WIDGETS_META_KEY), {
      [WIDGETS_META_KEY]: {
        version: 1, columns: 6, position: "top",
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

    await storageArea.set({ [WIDGETS_META_KEY]: { version: 1, columns: 6, position: "top", order: "bad" } });
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("preserves item order via meta.order across get/set roundtrips, independent of insertion", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const state = {
      version: 1, columns: 6, position: "top",
      items: [
        favorite({ id: "fav-b", url: "https://b.example/", domain: "b.example" }),
        favorite({ id: "fav-a", url: "https://a.example/", domain: "a.example" })
      ],
      createdAt: NOW,
      updatedAt: NOW
    };

    await store.setState(state);
    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-b", "fav-a"]);
  });

  it("removes the per-item key for a deleted favorite, leaving no orphan", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = favorite({ id: "fav-a", url: "https://a.example/", domain: "a.example" });
    const itemB = favorite({ id: "fav-b", url: "https://b.example/", domain: "b.example" });

    await store.setState({ version: 1, columns: 6, position: "top", items: [itemA, itemB], createdAt: NOW, updatedAt: NOW });
    await store.setState({ version: 1, columns: 6, position: "top", items: [itemA], createdAt: NOW, updatedAt: NOW });

    assert.deepEqual(await storageArea.get(widgetItemStorageKey("fav-b")), {});
    const loaded = await store.getState();
    assert.deepEqual(loaded.items.map((item) => item.id), ["fav-a"]);
  });

  it("tolerates a meta entry whose item key hasn't synced yet, rather than discarding everything", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = favorite({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await storageArea.set({
      [WIDGETS_META_KEY]: {
        version: 1, columns: 6, position: "top",
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
    const itemA = favorite({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await store.setState({ version: 1, columns: 6, position: "top", items: [itemA], createdAt: NOW, updatedAt: NOW });
    await store.clearState();

    assert.deepEqual(await storageArea.get(null), {});
  });

  it("surfaces a friendly error when the sync write exceeds quota, without leaving partial state", async () => {
    const storageArea = createMemoryStorageArea({}, { quotaBytesPerItem: 50 });
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    const itemA = favorite({ id: "fav-a", url: "https://a.example/", domain: "a.example" });

    await assert.rejects(
      () => store.setState({ version: 1, columns: 6, position: "top", items: [itemA], createdAt: NOW, updatedAt: NOW }),
      /Couldn't save this change to Chrome Sync/
    );

    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("requires and validates columns and position", () => {
    const valid = {
      version: 1,
      items: [favorite()],
      columns: 6,
      position: "top",
      createdAt: NOW,
      updatedAt: NOW
    };
    assert.equal(isWidgetsState(valid), true);
    assert.equal(isWidgetsState({ ...valid, columns: 1 }), true);
    assert.equal(isWidgetsState({ ...valid, columns: 12 }), true);
    assert.equal(isWidgetsState({ ...valid, position: "bottom" }), true);
    assert.equal(isWidgetsState({ ...valid, position: "center" }), true);
    assert.equal(isWidgetsState({ ...valid, columns: 0 }), false, "below min");
    assert.equal(isWidgetsState({ ...valid, columns: 13 }), false, "above max");
    assert.equal(isWidgetsState({ ...valid, columns: 3.5 }), false, "non-integer");
    assert.equal(isWidgetsState({ ...valid, columns: "6" }), false, "string");
    assert.equal(isWidgetsState({ ...valid, position: "middle" }), false, "bad position");
    const { columns: _c, ...withoutColumns } = valid;
    assert.equal(isWidgetsState(withoutColumns), false, "missing columns");
  });

  it("accepts only the favorite type for now and rejects a missing or unknown type", () => {
    assert.equal(isWidgetItem(favorite()), true);
    assert.equal(isWidgetItem(favorite({ type: undefined })), false);
    assert.equal(isWidgetItem(favorite({ type: "weather-metric" })), false);
  });

  it("caps favorites at 200 per type", () => {
    const items = Array.from({ length: MAX_FAVORITE_WIDGETS + 1 }, (_, index) =>
      favorite({
        id: `fav-${index}`,
        url: `https://example-${index}.com/`,
        domain: `example-${index}.com`
      })
    );
    const state = {
      version: 1,
      items,
      columns: 6,
      position: "top",
      createdAt: NOW,
      updatedAt: NOW
    };
    assert.equal(isWidgetsState(state), false);
    assert.equal(isWidgetsState({ ...state, items: items.slice(0, MAX_FAVORITE_WIDGETS) }), true);
  });

  it("persists columns and position in the meta key", async () => {
    const storageArea = createMemoryStorageArea();
    const store = createWidgetsStore(storageArea, { now: () => NOW });
    await store.setState({
      version: 1,
      items: [favorite()],
      columns: 4,
      position: "bottom",
      createdAt: NOW,
      updatedAt: NOW
    });

    const loaded = await store.getState();
    assert.equal(loaded.columns, 4);
    assert.equal(loaded.position, "bottom");
    assert.deepEqual((await storageArea.get(WIDGETS_META_KEY))[WIDGETS_META_KEY], {
      version: 1,
      order: ["fav-1"],
      columns: 4,
      position: "bottom",
      createdAt: NOW,
      updatedAt: NOW
    });
  });

  it("keeps columns and position when the item list is empty", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await store.setState({
      version: 1,
      items: [],
      columns: 3,
      position: "center",
      createdAt: NOW,
      updatedAt: NOW
    });
    const loaded = await store.getState();
    assert.equal(loaded.columns, 3);
    assert.equal(loaded.position, "center");
  });

  it("accepts a wide tile regardless of the stored column count (layout handles the span)", () => {
    assert.equal(
      isWidgetsState({
        version: 1,
        items: [favorite({ tileSize: "wide" })],
        columns: 1,
        position: "top",
        createdAt: NOW,
        updatedAt: NOW
      }),
      true
    );
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

function setup(syncValues = {}, localValues = {}, syncOptions = {}) {
  const local = createMemoryStorageArea(localValues);
  const sync = createMemoryStorageArea(syncValues, syncOptions);
  const store = createWidgetsStore(sync, { now: () => NOW });
  const migrate = () => migrateToWidgets(local, sync, { now: () => NOW });
  return { local, sync, store, migrate };
}

describe("migrateToWidgets", () => {
  it("no-ops when there is nothing to migrate", async () => {
    const { store, migrate } = setup();
    assert.deepEqual(await migrate(), { migrated: false });
    assert.deepEqual(await store.getState(), createInitialWidgetsState(NOW));
  });

  it("migrates sharded legacy favorites: tags each item, keeps order, clears legacy keys", async () => {
    const { sync, store, migrate } = setup(legacyArea(["fav-a", "fav-b"]));

    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });

    const state = await store.getState();
    assert.deepEqual(state.items.map((item) => item.id), ["fav-a", "fav-b"]);
    assert.ok(state.items.every((item) => item.type === "favorite"));
    assert.equal(state.columns, 2, "two square tiles → two columns");
    assert.equal(state.position, "top");
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
    assert.deepEqual(await sync.get(legacyItemKey("fav-a")), {});
    assert.deepEqual(await sync.get(legacyItemKey("fav-b")), {});
  });

  it("derives the default columns from tile spans so the row does not re-wrap (Review Focus #4)", async () => {
    const { store, migrate } = setup(
      legacyArea(["fav-a", "fav-b"], {
        itemOverrides: (index) => (index === 0 ? { tileSize: "wide" } : {})
      })
    );
    await migrate();
    assert.equal((await store.getState()).columns, 3, "wide (2) + square (1)");
  });

  it("never manufactures a wide tile in a 1-column grid", async () => {
    const { store, migrate } = setup(
      legacyArea(["fav-a"], { itemOverrides: () => ({ tileSize: "wide" }) })
    );
    await migrate();
    assert.equal((await store.getState()).columns, 2);
  });

  it("clamps the default columns to 12 and uses 6 for an empty legacy set", async () => {
    const many = setup(legacyArea(Array.from({ length: 20 }, (_, i) => `fav-${i}`)));
    await many.migrate();
    assert.equal((await many.store.getState()).columns, 12);

    const empty = setup(legacyArea([]));
    assert.deepEqual(await empty.migrate(), { migrated: true, source: "sharded-favorites" });
    assert.equal((await empty.store.getState()).columns, 6);
  });

  it("drops duplicate ids and invalid legacy items instead of writing an invalid meta", async () => {
    const values = legacyArea(["fav-a", "fav-a", "fav-bad", "fav-b"]);
    values[legacyItemKey("fav-bad")] = { id: "fav-bad", url: "not a url" };
    const { store, migrate } = setup(values);

    await migrate();
    assert.deepEqual((await store.getState()).items.map((item) => item.id), ["fav-a", "fav-b"]);
  });

  it("is idempotent when run twice in a row (Review Focus #3)", async () => {
    const { store, migrate } = setup(legacyArea(["fav-a"]));
    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });
    assert.deepEqual(await migrate(), { migrated: false });
    assert.deepEqual((await store.getState()).items.map((item) => item.id), ["fav-a"]);
  });

  it("is safe when two pages migrate concurrently (Review Focus #3)", async () => {
    const { store, migrate } = setup(legacyArea(["fav-a", "fav-b"]));
    const results = await Promise.all([migrate(), migrate()]);

    assert.equal(results.filter((result) => result.migrated).length, 1);
    assert.deepEqual((await store.getState()).items.map((item) => item.id), ["fav-a", "fav-b"]);
  });

  it("serializes with widgets mutations through the shared lock", async () => {
    const { store, migrate } = setup(legacyArea(["fav-a"]));
    const order = [];
    const held = withWidgetsMutationLock(async () => {
      order.push("mutation-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push("mutation-end");
    });
    const migrated = migrate().then(() => order.push("migrated"));
    await Promise.all([held, migrated]);
    assert.deepEqual(order, ["mutation-start", "mutation-end", "migrated"]);
    assert.equal((await store.getState()).items.length, 1);
  });

  it("never overwrites existing widgets and removes stale legacy keys (widgets meta wins)", async () => {
    const { sync, store, migrate } = setup(legacyArea(["old-a", "old-b"]));
    await store.setState({
      version: 1,
      items: [favorite({ id: "new-1" })],
      columns: 4,
      position: "center",
      createdAt: NOW,
      updatedAt: NOW
    });

    assert.deepEqual(await migrate(), { migrated: false, discardedStale: true });

    const state = await store.getState();
    assert.deepEqual(state.items.map((item) => item.id), ["new-1"]);
    assert.equal(state.columns, 4);
    assert.equal(state.position, "center");
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
    assert.deepEqual(await sync.get(legacyItemKey("old-a")), {});
  });

  it("migrates the oldest single-blob format through the same writer (Review Focus #5)", async () => {
    const blob = { version: 1, items: [legacyFavorite()], createdAt: NOW, updatedAt: NOW };
    const { local, store, migrate } = setup({}, { [LEGACY_BLOB_KEY]: blob });

    assert.deepEqual(await migrate(), { migrated: true, source: "legacy-blob" });

    assert.deepEqual(await local.get(LEGACY_BLOB_KEY), {});
    const state = await store.getState();
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
    const { sync, store, migrate } = setup(values, {}, { quotaBytes: Math.ceil(bytesOf(values) * 1.4) });

    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });

    assert.equal((await store.getState()).items.length, 100);
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
    const { sync, store, migrate } = setup(values);

    assert.deepEqual(await migrate(), { migrated: true, source: "sharded-favorites" });

    const state = await store.getState();
    assert.deepEqual(state.items.map((item) => item.id), ["fav-a", "fav-b", "fav-c"]);
    assert.equal(state.items[0].label, "New label");
    assert.deepEqual(await sync.get(legacyItemKey("fav-a")), {});
    assert.deepEqual(await sync.get(LEGACY_META_KEY), {});
  });
});

function metric(id = "weather:temperature", overrides = {}) {
  return { id, type: "weather-metric", tileSize: "square", enabled: true, ...overrides };
}
function metaOf(order, overrides = {}) {
  return { version: 1, order, columns: 6, position: "top", createdAt: NOW, updatedAt: NOW, ...overrides };
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
    const favs = Array.from({ length: 200 }, (_, i) => favorite({ id: `f${i}` }));
    const metrics = WEATHER_METRIC_IDS.map((id) => metric(id));
    const state = { version: 1, columns: 6, position: "top", createdAt: NOW, updatedAt: NOW, items: [...favs, ...metrics] };
    assert.equal(isWidgetsState(state), true);
    assert.equal(isWidgetsState({ ...state, items: [...state.items, metric("weather:uv")] }), false);
    assert.equal(isWidgetsState({ ...state, items: [favs[0], favs[0]] }), false);
  });

  it("round-trips metrics through the store in order", async () => {
    const area = createMemoryStorageArea();
    const store = createWidgetsStore(area, { now: () => NOW });
    const items = [favorite({ id: "a" }), metric("weather:uv", { enabled: false, tileSize: "wide" })];
    await store.setState({ ...createInitialWidgetsState(NOW), items });
    assert.deepEqual((await store.getState()).items, items);
  });
});

describe("inspectWidgetsMeta", () => {
  it("classifies missing, valid, newer and invalid", () => {
    assert.equal(inspectWidgetsMeta({}), "missing");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"]) }), "valid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 2 }) }), "newer");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 2 } }), "newer");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 1, order: "x" } }), "invalid");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: null }), "invalid");
  });
});

describe("setState over a newer meta", () => {
  it("refuses to write and leaves storage untouched", async () => {
    const newer = metaOf(["a"], { version: 2 });
    const area = createMemoryStorageArea({ [WIDGETS_META_KEY]: newer });
    const store = createWidgetsStore(area, { now: () => NOW });
    await assert.rejects(
      store.setState({ ...createInitialWidgetsState(NOW), items: [favorite()] }),
      { message: NEWER_WIDGETS_MESSAGE }
    );
    assert.deepEqual(await area.get(null), { [WIDGETS_META_KEY]: newer });
  });

  it("assertWritable rejects for a newer meta and resolves otherwise", async () => {
    const newerStore = createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"], { version: 2 }) }));
    await assert.rejects(newerStore.assertWritable(), { message: NEWER_WIDGETS_MESSAGE });
    await createWidgetsStore(createMemoryStorageArea()).assertWritable();
    await createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: metaOf(["a"]) })).assertWritable();
    await createWidgetsStore(createMemoryStorageArea({ [WIDGETS_META_KEY]: { version: 1, order: "x" } })).assertWritable();
  });
});

const key = widgetItemStorageKey;
const fav = (id) => favorite({ id });
function phase1Storage(ids, metaOverrides = {}) {
  const s = { [WIDGETS_META_KEY]: metaOf(ids, metaOverrides) };
  for (const id of ids) s[key(id)] = fav(id);
  return s;
}

describe("ensureWeatherMetrics", () => {
  it("appends the four metrics in canonical order with defaults and raises columns to 6 (writes meta last)", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a", "b"], { columns: 2 }));
    const writes = [];
    const origSet = area.set.bind(area);
    area.set = async (p) => { writes.push(Object.keys(p)); return origSet(p); };
    const result = await ensureWeatherMetrics(area, { now: () => "2026-09-30T00:00:00.000Z" });
    assert.equal(result.changed, true);
    const all = await area.get(null);
    assert.deepEqual(all[WIDGETS_META_KEY].order, ["a", "b", ...WEATHER_METRIC_IDS]);
    assert.equal(all[WIDGETS_META_KEY].columns, 6);
    assert.deepEqual(all[key("weather:precipitation")], { id: "weather:precipitation", type: "weather-metric", tileSize: "wide", enabled: true });
    assert.equal(writes.at(-1).includes(WIDGETS_META_KEY), true, "meta is the last write");
    assert.equal(writes.slice(0, -1).some((w) => w.includes(WIDGETS_META_KEY)), false);
  });

  it("never lowers columns and does not touch a user-chosen larger value", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a"], { columns: 9 }));
    await ensureWeatherMetrics(area);
    assert.equal((await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].columns, 9);
  });

  it("is a no-op (no write at all) when everything is present", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a"]));
    await ensureWeatherMetrics(area);
    let writes = 0;
    const origSet = area.set.bind(area); area.set = async (p) => { writes += 1; return origSet(p); };
    const before = await area.get(null);
    const result = await ensureWeatherMetrics(area);
    assert.equal(result.changed, false);
    assert.equal(writes, 0);
    assert.deepEqual(await area.get(null), before);
  });

  it("creates meta on a fresh install with columns 6 and position top", async () => {
    const area = createMemoryStorageArea();
    const r = await ensureWeatherMetrics(area, { now: () => NOW });
    assert.equal(r.meta, "missing");
    const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
    assert.deepEqual([meta.order, meta.columns, meta.position], [WEATHER_METRIC_IDS, 6, "top"]);
  });

  it("re-creates the item of a listed id without duplicating the id", async () => {
    const s = phase1Storage(["a", "weather:uv"]);
    for (const id of WEATHER_METRIC_IDS.slice(0, 3)) { s[key(id)] = metric(id); s[WIDGETS_META_KEY].order.push(id); }
    const area = createMemoryStorageArea(s);
    await ensureWeatherMetrics(area);
    const all = await area.get(null);
    assert.equal(all[WIDGETS_META_KEY].order.filter((i) => i === "weather:uv").length, 1);
    assert.deepEqual(all[key("weather:uv")], { id: "weather:uv", type: "weather-metric", tileSize: "square", enabled: true });
    assert.equal(isWidgetsState(await createWidgetsStore(area).getState()), true);
  });

  it("keeps an orphan item's stored settings and appends its id once", async () => {
    const s = phase1Storage(["a"]);
    s[key("weather:uv")] = metric("weather:uv", { enabled: false, tileSize: "wide" });
    const area = createMemoryStorageArea(s);
    await ensureWeatherMetrics(area);
    const all = await area.get(null);
    assert.equal(all[WIDGETS_META_KEY].order.filter((i) => i === "weather:uv").length, 1);
    assert.deepEqual(all[key("weather:uv")], metric("weather:uv", { enabled: false, tileSize: "wide" }));
    assert.equal((await createWidgetsStore(area).getState()).items.length, 5);
  });

  it("raises columns for an interrupted run that left all four orphan items and no order entries", async () => {
    const s = phase1Storage(["a"], { columns: 2 });
    for (const id of WEATHER_METRIC_IDS) s[key(id)] = metric(id);
    const area = createMemoryStorageArea(s);
    await ensureWeatherMetrics(area);
    const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
    assert.equal(meta.columns, 6);
    assert.deepEqual(meta.order, ["a", ...WEATHER_METRIC_IDS]);
  });

  it("validates 200 favorites + 4 metrics after ensure", async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `f${i}`);
    const area = createMemoryStorageArea(phase1Storage(ids));
    await ensureWeatherMetrics(area);
    assert.equal((await createWidgetsStore(area).getState()).items.length, 204);
  });

  it("writes nothing for a newer or invalid meta", async () => {
    for (const bad of [metaOf(["a"], { version: 2 }), { version: 1, order: "x" }]) {
      const area = createMemoryStorageArea({ [WIDGETS_META_KEY]: bad, [key("a")]: fav("a") });
      const before = await area.get(null);
      await ensureWeatherMetrics(area);
      assert.deepEqual(await area.get(null), before);
    }
  });

  it("rejects on a write failure and leaves no meta change", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a"]));
    area.set = async () => { throw new Error("quota"); };
    const before = await area.get(null);
    await assert.rejects(ensureWeatherMetrics(area), /Chrome Sync/);
    assert.deepEqual(await area.get(null), before);
  });

  it("produces each metric once when two runs race", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a"]));
    await Promise.all([ensureWeatherMetrics(area), ensureWeatherMetrics(area)]);
    const order = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].order;
    assert.equal(order.length, 5);
    assert.equal(new Set(order).size, 5);
  });
});

describe("ensureWeatherMetrics columns raise", () => {
  const colsOf = async (area) => (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].columns;
  const orderOf = async (area) => (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY].order;

  it("does not raise columns when 3 of 4 metrics are already listed", async () => {
    const s = phase1Storage(["a"], { columns: 2 });
    for (const id of WEATHER_METRIC_IDS.slice(0, 3)) { s[key(id)] = metric(id); s[WIDGETS_META_KEY].order.push(id); }
    const area = createMemoryStorageArea(s);
    await ensureWeatherMetrics(area);
    assert.equal(await colsOf(area), 2);
    const order = await orderOf(area);
    assert.equal(order.filter((i) => i === WEATHER_METRIC_IDS[3]).length, 1);
    assert.equal(order.length, 5);
  });

  it("does not raise columns when an id is listed but its item is missing", async () => {
    const s = phase1Storage(["a", "weather:uv"], { columns: 2 });
    const area = createMemoryStorageArea(s);
    await ensureWeatherMetrics(area);
    assert.equal(await colsOf(area), 2);
    const all = await area.get(null);
    assert.equal(all[WIDGETS_META_KEY].order.filter((i) => i === "weather:uv").length, 1);
    assert.equal(all[key("weather:uv")].type, "weather-metric");
  });

  it("does not raise columns for one orphan item while the other three are listed", async () => {
    const s = phase1Storage(["a"], { columns: 2 });
    for (const id of WEATHER_METRIC_IDS.slice(0, 3)) { s[key(id)] = metric(id); s[WIDGETS_META_KEY].order.push(id); }
    s[key(WEATHER_METRIC_IDS[3])] = metric(WEATHER_METRIC_IDS[3]);
    const area = createMemoryStorageArea(s);
    await ensureWeatherMetrics(area);
    assert.equal(await colsOf(area), 2);
  });

  it("raises once, then leaves a user-changed columns value alone with no writes", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a"], { columns: 2 }));
    await ensureWeatherMetrics(area);
    assert.equal(await colsOf(area), 6);
    const all = await area.get(null);
    all[WIDGETS_META_KEY] = { ...all[WIDGETS_META_KEY], columns: 3 };
    await area.set({ [WIDGETS_META_KEY]: all[WIDGETS_META_KEY] });
    let writes = 0;
    const origSet = area.set.bind(area); area.set = async (p) => { writes += 1; return origSet(p); };
    const result = await ensureWeatherMetrics(area);
    assert.equal(result.changed, false);
    assert.equal(writes, 0);
    assert.equal(await colsOf(area), 3);
  });

  it("recovers after only the meta write fails: orphan items stay, meta unchanged, retry completes", async () => {
    const area = createMemoryStorageArea(phase1Storage(["a"], { columns: 2 }));
    const origSet = area.set.bind(area);
    let calls = 0;
    area.set = async (p) => { calls += 1; if (calls === 2) throw new Error("quota"); return origSet(p); };
    const metaBefore = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
    await assert.rejects(ensureWeatherMetrics(area), /Chrome Sync/);
    assert.deepEqual((await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY], metaBefore);
    const after = await area.get(null);
    for (const id of WEATHER_METRIC_IDS) assert.ok(after[key(id)], `${id} item present`);
    area.set = origSet;
    const result = await ensureWeatherMetrics(area);
    assert.equal(result.changed, true);
    assert.deepEqual(await orderOf(area), ["a", ...WEATHER_METRIC_IDS]);
    assert.equal(await colsOf(area), 6);
  });
});

describe("migrateToWidgets over a newer meta", () => {
  it("neither migrates nor cleans up legacy keys", async () => {
    const sync = createMemoryStorageArea({
      [WIDGETS_META_KEY]: metaOf(["a"], { version: 2 }),
      quietTabFavoritesMeta: { version: 1, order: ["x"], createdAt: NOW, updatedAt: NOW },
      "quietTabFavorite:x": favorite({ id: "x", type: undefined })
    });
    const before = await sync.get(null);
    const result = await migrateToWidgets(createMemoryStorageArea(), sync);
    assert.deepEqual(result, { migrated: false, newer: true });
    assert.deepEqual(await sync.get(null), before);
  });
});
