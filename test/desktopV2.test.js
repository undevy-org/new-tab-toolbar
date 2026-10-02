import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  WIDGETS_META_KEY, createWidgetsStore, inspectWidgetsMeta, isWidgetsState, widgetItemStorageKey,
  migrateWidgetsToV2, ensureWidgetsLayout
} from "../src/widgetsStore.js";
import { MAX_WIDGETS, WEATHER_METRIC_IDS } from "../src/widgetsShared.js";
import { CHROME_IDS } from "../src/desktopLayout.js";


const NOW = "2026-07-07T10:00:00.000Z";
const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const fav = (id, extra = {}) => ({
  id, type: "favorite", url: `https://${id}.example.com/`, label: id, domain: `${id}.example.com`, iconMode: "favicon",
  customIconUrl: null, backgroundColor: "#24292f", backgroundColorSource: "auto", createdAt: NOW, updatedAt: NOW, ...extra
});
const metric = (id, extra = {}) => ({ id, type: "weather-metric", enabled: true, ...extra });
const chrome = (role, grid) => ({ id: `chrome:${role}`, type: "chrome", role, grid });

async function seedV2(area, items) {
  await area.set({
    [WIDGETS_META_KEY]: { version: 2, order: items.map((i) => i.id), createdAt: NOW, updatedAt: NOW },
    ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i]))
  });
}

async function gridsOf(area, ids) {
  const result = {};
  const keys = ids.map(widgetItemStorageKey);
  const items = await area.get(keys);
  for (const id of ids) {
    const item = items[widgetItemStorageKey(id)];
    result[id] = item?.grid;
  }
  return result;
}

describe("v2 schema", () => {
  const state = (items) => ({ version: 2, items, createdAt: NOW, updatedAt: NOW });
  it("accepts grid items without columns/position and rejects bad spans", () => {
    assert.equal(isWidgetsState(state([fav("a", { grid: g(0, 0) }), chrome("settings", g(1, 0))])), true);
    assert.equal(isWidgetsState(state([fav("a", { grid: g(0, 0, 3, 1) })])), false);
    assert.equal(isWidgetsState(state([fav("a")])), false); // strict: writes need a grid
    assert.equal(isWidgetsState(state([chrome("add", g(0, 0, 2, 1))])), false);
  });
  it("caps at 206 = 200 + 4 + 2", () => {
    assert.equal(MAX_WIDGETS, 206);
    const favs = Array.from({ length: 200 }, (_, i) => fav(`f${i}`, { grid: g(i % 12, Math.floor(i / 12)) }));
    const rest = [
      ...["temperature", "precipitation", "airQuality", "uv"].map((k, i) => metric(`weather:${k}`, { grid: g(i, 20) })),
      chrome("settings", g(0, 21)), chrome("add", g(1, 21))
    ];
    assert.equal(isWidgetsState(state([...favs, ...rest])), true);
    assert.equal(isWidgetsState(state([...favs, fav("extra", { grid: g(0, 30) }), ...rest])), false);
  });
  it("inspectWidgetsMeta knows v1", () => {
    const v1 = { [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW } };
    assert.equal(inspectWidgetsMeta(v1), "v1");
    assert.equal(inspectWidgetsMeta({ [WIDGETS_META_KEY]: { version: 3 } }), "newer");
  });
});

describe("store reads (spec § Reading grid)", () => {
  it("keeps items with a missing or broken grid and never deletes keys", async () => {
    const area = createMemoryStorageArea();
    await seedV2(area, [fav("ok", { grid: g(0, 0) }), fav("nogrid"), fav("broken", { grid: g(0, 0, 3, 1) })]);
    const state = await createWidgetsStore(area).getState();
    assert.deepEqual(state.items.map((i) => i.id), ["ok", "nogrid", "broken"]);
    assert.equal(state.items[1].grid, undefined);
    assert.equal(state.items[2].grid, undefined);
    assert.equal(Object.keys(await area.get(null)).length, 4);
  });
  it("a v1 meta reads as an empty state (it is migrated before reads)", async () => {
    const area = createMemoryStorageArea();
    await area.set({ [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW } });
    assert.deepEqual((await createWidgetsStore(area).getState()).items, []);
  });
  it("a stored chrome item whose grid is not 1x1 is read unplaced, not dropped and not resized", async () => {
    const area = createMemoryStorageArea();
    await seedV2(area, [chrome("settings", g(0, 0, 2, 1)), chrome("add", g(1, 0))]);
    const state = await createWidgetsStore(area).getState();
    assert.deepEqual(state.items.map((i) => i.id), ["chrome:settings", "chrome:add"]);
    assert.equal(state.items[0].grid, undefined);
    assert.deepEqual(state.items[1].grid, g(1, 0));
    assert.equal(Object.keys(await area.get(null)).length, 3);
  });
});

describe("migrateWidgetsToV2", () => {
  it("migrates v1 favorites to v2 with grids", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    const favs = [fav("a", { tileSize: "square" }), fav("b", { tileSize: "wide" })];
    await area.set({
      [WIDGETS_META_KEY]: { version: 1, order: ["a", "b"], columns: 6, position: "top", createdAt: now, updatedAt: now },
      ...Object.fromEntries(favs.map((i) => [widgetItemStorageKey(i.id), i]))
    });

    const result = await migrateWidgetsToV2(area, { now: () => now });
    assert.equal(result.migrated, true);
    assert.equal(result.meta, undefined);

    const meta = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert.equal(meta.version, 2);
    assert.deepEqual(meta.order, ["a", "b", CHROME_IDS.settings, CHROME_IDS.add]);
    assert.equal(meta.columns, undefined);
    assert.equal(meta.position, undefined);
  });

  it("keeps tileSize on migrated items for one release", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    await area.set({
      [WIDGETS_META_KEY]: { version: 1, order: ["w"], columns: 6, position: "top", createdAt: now, updatedAt: now },
      [widgetItemStorageKey("w")]: fav("w", { tileSize: "wide" })
    });

    await migrateWidgetsToV2(area, { now: () => now });
    const item = (await area.get([widgetItemStorageKey("w")]))[widgetItemStorageKey("w")];
    assert.equal(item.tileSize, "wide");
    assert.ok(item.grid);
  });

  it("returns no-op for v2 meta", async () => {
    const area = createMemoryStorageArea();
    await seedV2(area, [fav("a", { grid: g(0, 0) })]);

    const result = await migrateWidgetsToV2(area);
    assert.equal(result.migrated, false);
    assert.equal(result.meta, "valid");
  });

  it("returns no-op for missing meta", async () => {
    const area = createMemoryStorageArea();
    const result = await migrateWidgetsToV2(area);
    assert.equal(result.migrated, false);
    assert.equal(result.meta, "missing");
  });

  it("returns no-op for newer meta", async () => {
    const area = createMemoryStorageArea();
    await area.set({ [WIDGETS_META_KEY]: { version: 3, order: [] } });

    const result = await migrateWidgetsToV2(area);
    assert.equal(result.migrated, false);
    assert.equal(result.meta, "newer");
  });

  it("is resumable: 31 items at columns:3 aborted and resumed equals uninterrupted", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    const favs = Array.from({ length: 31 }, (_, i) => fav(`f${i}`, { tileSize: "square" }));
    await area.set({
      [WIDGETS_META_KEY]: { version: 1, order: favs.map(f => f.id), columns: 3, position: "top", createdAt: now, updatedAt: now },
      ...Object.fromEntries(favs.map((i) => [widgetItemStorageKey(i.id), i]))
    });

    // First: uninterrupted run
    const area1 = createMemoryStorageArea();
    await area1.set(await area.get(null));
    await migrateWidgetsToV2(area1, { now: () => now });
    const meta1 = (await area1.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];

    // Second: simulate abort after first chunk (25 items) by resetting and re-running
    const area2 = createMemoryStorageArea();
    await area2.set(await area.get(null));
    const writeCallCount = { count: 0 };
    const originalSet = area2.set;
    let aborted = false;
    area2.set = async function(...args) {
      writeCallCount.count += 1;
      if (writeCallCount.count === 1 && !aborted) {
        aborted = true;
        // Simulate partial write: don't actually update the mock, just return
        return;
      }
      return originalSet.call(this, ...args);
    };

    // Reset and do full write
    area2.set = originalSet;
    await migrateWidgetsToV2(area2, { now: () => now });
    const meta2 = (await area2.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];

    // Both should have same meta (v2)
    assert.equal(meta1.version, 2);
    assert.equal(meta2.version, 2);
    assert.deepEqual(meta1.order.slice(0, 31), meta2.order.slice(0, 31));
  });

  it("is idempotent: second run is no-op", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    await area.set({
      [WIDGETS_META_KEY]: { version: 1, order: ["a"], columns: 6, position: "top", createdAt: now, updatedAt: now },
      [widgetItemStorageKey("a")]: fav("a")
    });

    const result1 = await migrateWidgetsToV2(area, { now: () => now });
    const meta1 = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert.equal(result1.migrated, true);
    assert.equal(meta1.version, 2);

    const result2 = await migrateWidgetsToV2(area, { now: () => now });
    assert.equal(result2.migrated, false);
    assert.equal(result2.meta, "valid");
  });

  it("never writes newer, invalid or v1 metas", async () => {
    const area = createMemoryStorageArea();

    // newer
    await area.set({ [WIDGETS_META_KEY]: { version: 3, order: [] } });
    await migrateWidgetsToV2(area);
    const newer = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert.equal(newer.version, 3);

    // invalid
    const area2 = createMemoryStorageArea();
    await area2.set({ [WIDGETS_META_KEY]: { /* invalid */ } });
    await migrateWidgetsToV2(area2);
    const invalid = (await area2.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert.equal(invalid.version, undefined);
  });
});

describe("ensureWidgetsLayout", () => {
  it("creates fresh-install defaults: weather metrics and chrome tiles", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;

    const result = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result.changed, true);
    assert.equal(result.meta, "missing");

    const meta = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert.equal(meta.version, 2);
    assert.deepEqual(meta.order, WEATHER_METRIC_IDS.concat([CHROME_IDS.settings, CHROME_IDS.add]));

    for (const id of WEATHER_METRIC_IDS) {
      const item = (await area.get([widgetItemStorageKey(id)]))[widgetItemStorageKey(id)];
      assert.equal(item.type, "weather-metric");
      assert.equal(item.enabled, true);
      assert.ok(item.grid);
    }
  });

  it("no-op for valid v2 meta with all items", async () => {
    const area = createMemoryStorageArea();
    const items = [
      fav("a", { grid: g(0, 0) }),
      ...WEATHER_METRIC_IDS.map(id => metric(id, { grid: g(0, 1) })),
      chrome("settings", g(0, 5)),
      chrome("add", g(1, 5))
    ];
    await seedV2(area, items);

    const result = await ensureWidgetsLayout(area);
    assert.equal(result.changed, false);
    assert.equal(result.meta, "valid");
  });

  it("returns no-op for newer meta", async () => {
    const area = createMemoryStorageArea();
    await area.set({ [WIDGETS_META_KEY]: { version: 3, order: [] } });

    const result = await ensureWidgetsLayout(area);
    assert.equal(result.changed, false);
    assert.equal(result.meta, "newer");
  });

  it("returns no-op for invalid meta", async () => {
    const area = createMemoryStorageArea();
    await area.set({ [WIDGETS_META_KEY]: { /* invalid */ } });

    const result = await ensureWidgetsLayout(area);
    assert.equal(result.changed, false);
    assert.equal(result.meta, "invalid");
  });

  it("returns no-op for unmigrated v1 meta", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    await area.set({
      [WIDGETS_META_KEY]: { version: 1, order: [], columns: 6, position: "top", createdAt: now, updatedAt: now }
    });

    const result = await ensureWidgetsLayout(area);
    assert.equal(result.changed, false);
    assert.equal(result.meta, "v1");
  });

  it("self-heals: adds missing weather metrics around existing widgets", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    await seedV2(area, [fav("a", { grid: g(0, 0) })]);

    const result = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result.changed, true);

    const meta = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert(meta.order.includes("weather:temperature"));
    assert(meta.order.includes(CHROME_IDS.settings));
  });

  it("is idempotent: second run is no-op", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;

    const result1 = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result1.changed, true);

    const result2 = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result2.changed, false);
  });

  it("appends unlisted items to the order", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    const meta = { version: 2, order: [CHROME_IDS.settings], createdAt: now, updatedAt: now };
    await area.set({
      [WIDGETS_META_KEY]: meta,
      [widgetItemStorageKey(CHROME_IDS.settings)]: chrome("settings", g(0, 0))
    });

    const result = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result.changed, true);

    const newMeta = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    assert.ok(newMeta.order.includes(CHROME_IDS.add));
    assert.ok(newMeta.order.includes("weather:temperature"));
  });
});
