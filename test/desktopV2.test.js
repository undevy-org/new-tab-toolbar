import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  WIDGETS_META_KEY, createWidgetsStore, inspectWidgetsMeta, isWidgetsState, widgetItemStorageKey
} from "../src/widgetsStore.js";
import { MAX_WIDGETS } from "../src/widgetsShared.js";


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
