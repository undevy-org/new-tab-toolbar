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

async function gridsOf(area) {
  const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
  if (!meta?.order) return {};
  const result = {};
  const items = await area.get(meta.order.map(widgetItemStorageKey));
  for (const id of meta.order) {
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

describe("migrateWidgetsToV2 (AS-12)", () => {
  const v1Meta = (order, columns = 6) => ({ [WIDGETS_META_KEY]: { version: 1, order, columns, position: "center", createdAt: NOW, updatedAt: NOW } });
  const seedV1 = async (area, items, columns) => {
    await area.set({ ...v1Meta(items.map((i) => i.id), columns), ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
  };
  const v1Items = () => [
    fav("fw", { tileSize: "wide" }), fav("fs", { tileSize: "square" }),
    metric("weather:temperature", { tileSize: "square" }), metric("weather:precipitation", { tileSize: "wide" }),
    metric("weather:airQuality", { tileSize: "wide" }), metric("weather:uv", { tileSize: "square" })
  ];
  it("writes the exact AS-12 grids, v2 meta without columns/position, keeps tileSize", async () => {
    const area = createMemoryStorageArea();
    await seedV1(area, v1Items());
    assert.deepEqual(await migrateWidgetsToV2(area), { migrated: true });
    const meta = (await area.get(WIDGETS_META_KEY))[WIDGETS_META_KEY];
    assert.equal(meta.version, 2);
    assert.equal("columns" in meta, false);
    assert.equal("position" in meta, false);
    assert.deepEqual(await gridsOf(area), {
      fw: g(0, 0, 2, 1), fs: g(2, 0), "weather:temperature": g(3, 0), "weather:precipitation": g(4, 0, 2, 1),
      "weather:airQuality": g(0, 1, 2, 1), "weather:uv": g(2, 1), "chrome:settings": g(3, 1), "chrome:add": g(4, 1)
    });
    assert.equal((await area.get(widgetItemStorageKey("fw")))[widgetItemStorageKey("fw")].tileSize, "wide");
    assert.equal(inspectWidgetsMeta(await area.get(WIDGETS_META_KEY)), "valid");
  });
  it("is a no-op for v2, missing and newer metas", async () => {
    const a = createMemoryStorageArea();
    assert.equal((await migrateWidgetsToV2(a)).migrated, false);
    const b = createMemoryStorageArea();
    await b.set({ [WIDGETS_META_KEY]: { version: 9 } });
    assert.equal((await migrateWidgetsToV2(b)).meta, "newer");
    assert.deepEqual(await b.get(null), { [WIDGETS_META_KEY]: { version: 9 } });
  });
  it("AS-12b: aborted after chunk 1 then resumed equals an uninterrupted run (holes, 31 items)", async () => {
    const items = [
      ...Array.from({ length: 27 }, (_, i) => fav(`f${i}`, { tileSize: i % 3 === 2 ? "square" : "wide" })),
      metric("weather:temperature", { tileSize: "square" }), metric("weather:precipitation", { tileSize: "wide" }),
      metric("weather:airQuality", { tileSize: "wide" }), metric("weather:uv", { tileSize: "square" })
    ];
    const clean = createMemoryStorageArea();
    await seedV1(clean, items, 3);
    await migrateWidgetsToV2(clean);

    const flaky = createMemoryStorageArea();
    await seedV1(flaky, items, 3);
    let sets = 0;
    const realSet = flaky.set.bind(flaky);
    flaky.set = async (payload) => {
      sets += 1;
      if (sets === 2) throw new Error("aborted after chunk 1");
      return realSet(payload);
    };
    await assert.rejects(migrateWidgetsToV2(flaky));
    assert.equal(inspectWidgetsMeta(await flaky.get(WIDGETS_META_KEY)), "v1"); // meta is written last
    flaky.set = realSet;
    await migrateWidgetsToV2(flaky);
    assert.deepEqual(await gridsOf(flaky), await gridsOf(clean));
  });
  it("hidden metric (disabled) gets a placeholder grid and doesn't block other items", async () => {
    const area = createMemoryStorageArea();
    const v1Meta = (order, columns = 6) => ({ [WIDGETS_META_KEY]: { version: 1, order, columns, position: "center", createdAt: NOW, updatedAt: NOW } });
    const items = [
      fav("a", { tileSize: "square" }),
      metric("weather:precipitation", { enabled: false, tileSize: "wide" }),
      fav("b", { tileSize: "square" })
    ];
    await area.set({ ...v1Meta(items.map((i) => i.id), 6), ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
    await migrateWidgetsToV2(area);
    assert.deepEqual(await gridsOf(area), {
      a: g(0, 0), b: g(1, 0), "weather:precipitation": g(0, 0, 2, 1), "chrome:settings": g(2, 0), "chrome:add": g(3, 0)
    });
  });
  it("empty area returns no-op and leaves storage untouched", async () => {
    const area = createMemoryStorageArea();
    const result = await migrateWidgetsToV2(area);
    assert.deepEqual(result, { migrated: false, meta: "missing" });
    assert.deepEqual(await area.get(null), {});
  });
});

describe("ensureWidgetsLayout (Defaults, AS-1, AS-35)", () => {
  it("fresh install writes the six default grids", async () => {
    const area = createMemoryStorageArea();
    await ensureWidgetsLayout(area);
    assert.deepEqual(await gridsOf(area), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(1, 0, 2, 1), "weather:airQuality": g(3, 0, 2, 1),
      "weather:uv": g(5, 0), "chrome:settings": g(6, 0), "chrome:add": g(7, 0)
    });
  });
  it("is idempotent and writes nothing the second time", async () => {
    const area = createMemoryStorageArea();
    await ensureWidgetsLayout(area);
    const before = await area.get(null);
    assert.equal((await ensureWidgetsLayout(area)).changed, false);
    assert.deepEqual(await area.get(null), before);
  });
  it("self-heals a missing chrome tile around existing widgets", async () => {
    const area = createMemoryStorageArea();
    await seedV2(area, [fav("a", { grid: g(0, 0) }), ...["temperature", "precipitation", "airQuality", "uv"].map((k, i) => metric(`weather:${k}`, { grid: g(1 + i * 2, 0, 2, 1) })), chrome("add", g(0, 1))]);
    await ensureWidgetsLayout(area);
    const grids = await gridsOf(area);
    assert.deepEqual(grids["chrome:settings"], g(9, 0)); // first free 1×1: row 0 is taken up to x=8
    assert.deepEqual(grids.a, g(0, 0));
  });
  it("leaves newer, invalid and v1 metas alone", async () => {
    for (const meta of [{ version: 9 }, { version: 2, order: "x" }, { version: 1, order: [], columns: 6, position: "top", createdAt: NOW, updatedAt: NOW }]) {
      const area = createMemoryStorageArea();
      await area.set({ [WIDGETS_META_KEY]: meta });
      const result = await ensureWidgetsLayout(area);
      assert.equal(result.changed, false);
      assert.deepEqual(await area.get(null), { [WIDGETS_META_KEY]: meta });
    }
  });
  it("self-heals listed but absent item: meta.order has id but item key missing", async () => {
    const area = createMemoryStorageArea();
    const now = NOW;
    const items = [fav("a", { grid: g(0, 0) }), metric("weather:temperature", { grid: g(1, 0) }), metric("weather:precipitation", { grid: g(2, 0, 2, 1) }), metric("weather:airQuality", { grid: g(4, 0, 2, 1) }), metric("weather:uv", { grid: g(6, 0) }), chrome("add", { grid: g(7, 0) })];
    const meta = { version: 2, order: items.map((i) => i.id).concat([CHROME_IDS.settings]), createdAt: now, updatedAt: now };
    await area.set({ [WIDGETS_META_KEY]: meta, ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
    const gridsBefore = await gridsOf(area);
    const originalOrder = [...meta.order];

    const result = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result.changed, true);
    assert.equal(result.meta, "valid");

    const metaAfter = (await area.get([WIDGETS_META_KEY]))[WIDGETS_META_KEY];
    const gridsAfter = await gridsOf(area);

    // Exact grid for added item: row 0 occupied x=0-6 (a,temp,precip 2x1,aq 2x1,uv), so first free is (7,0)
    assert.deepEqual(gridsAfter["chrome:settings"], g(7, 0));

    // Meta.order unchanged (no duplicates added)
    assert.deepEqual(metaAfter.order, originalOrder);
    assert.equal(new Set(metaAfter.order).size, metaAfter.order.length, "no duplicate ids in order");

    // All other items' grids unchanged
    assert.deepEqual(gridsAfter.a, gridsBefore.a);
    assert.deepEqual(gridsAfter["weather:temperature"], gridsBefore["weather:temperature"]);
    assert.deepEqual(gridsAfter["weather:precipitation"], gridsBefore["weather:precipitation"]);
    assert.deepEqual(gridsAfter["weather:airQuality"], gridsBefore["weather:airQuality"]);
    assert.deepEqual(gridsAfter["weather:uv"], gridsBefore["weather:uv"]);
    assert.deepEqual(gridsAfter["chrome:add"], gridsBefore["chrome:add"]);

    // Second call is idempotent
    const afterFirstCall = await area.get(null);
    const result2 = await ensureWidgetsLayout(area, { now: () => now });
    assert.equal(result2.changed, false);
    assert.deepEqual(await area.get(null), afterFirstCall);
  });
  it("write order: items written before meta in both migrations and ensures", async () => {
    const writeLog = [];
    const logSet = async (payload) => {
      for (const key of Object.keys(payload)) {
        writeLog.push(key);
      }
    };

    // Test ensureWidgetsLayout write order
    const area1 = createMemoryStorageArea();
    const originalSet1 = area1.set.bind(area1);
    area1.set = async (payload) => {
      await logSet(payload);
      return originalSet1(payload);
    };
    writeLog.length = 0;
    await ensureWidgetsLayout(area1);
    const metaIndex = writeLog.indexOf(WIDGETS_META_KEY);
    const itemIndices = writeLog
      .map((k, i) => (k.startsWith("quietTabWidget:") ? i : -1))
      .filter((i) => i !== -1);
    assert.ok(itemIndices.length > 0);
    assert.ok(itemIndices.every((i) => i < metaIndex), "all item keys written before meta");

    // Test migrateWidgetsToV2 write order: meta is written last
    const area2 = createMemoryStorageArea();
    const v1Meta = (order, columns = 6) => ({ [WIDGETS_META_KEY]: { version: 1, order, columns, position: "center", createdAt: NOW, updatedAt: NOW } });
    const seedV1 = async (area, items, columns) => {
      await area.set({ ...v1Meta(items.map((i) => i.id), columns), ...Object.fromEntries(items.map((i) => [widgetItemStorageKey(i.id), i])) });
    };
    await seedV1(area2, [fav("x"), fav("y")], 6);

    const originalSet2 = area2.set.bind(area2);
    area2.set = async (payload) => {
      await logSet(payload);
      return originalSet2(payload);
    };
    writeLog.length = 0;
    await migrateWidgetsToV2(area2);
    assert.equal(writeLog[writeLog.length - 1], WIDGETS_META_KEY, "meta written in last set call");
    const metaPos = writeLog.lastIndexOf(WIDGETS_META_KEY);
    assert.ok(!writeLog.slice(metaPos + 1).some((k) => k.startsWith("quietTabWidget:")), "no item keys after meta");
  });
});
