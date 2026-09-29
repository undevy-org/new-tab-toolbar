import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  WIDGETS_META_KEY,
  createWidgetsStore,
  createInitialWidgetsState,
  isWidgetItem,
  isWidgetsState,
  migrateToWidgets,
  widgetItemStorageKey,
  withWidgetsMutationLock
} from "../src/widgetsStore.js";
import { MAX_FAVORITE_WIDGETS } from "../src/widgetsShared.js";

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
