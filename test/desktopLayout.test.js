
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHROME_IDS, canPlace, cellFromPoint, displayLayout, effectiveColumns, gridMetrics, isValidGrid,
  migrateV1ToV2, placeMissing, placeNew, placeResized
} from "../src/desktopLayout.js";

const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const fav = (id, grid) => ({ id, type: "favorite", grid });
const plain = (map) => Object.fromEntries(map);

describe("effectiveColumns / gridMetrics", () => {
  it("matches the spec reference values", () => {
    assert.equal(effectiveColumns(1280), 12);
    assert.equal(effectiveColumns(500), 6);
    assert.equal(effectiveColumns(360), 5);
    assert.equal(effectiveColumns(361), 4);
    assert.equal(effectiveColumns(320), 5);
    assert.equal(effectiveColumns(305), 4); // 320 px with a 15 px classic scrollbar
  });
  it("never goes below 2 columns or above 12", () => {
    assert.equal(effectiveColumns(100), 2);
    assert.equal(effectiveColumns(5000), 12);
  });
  it("picks metrics by width", () => {
    assert.deepEqual(gridMetrics(360), { maxWidth: 360, cell: 56, gap: 6, pad: 8 });
    assert.equal(gridMetrics(600).cell, 64);
    assert.equal(gridMetrics(601).cell, 72);
  });
  it("the block never exceeds the content width", () => {
    for (let w = 120; w <= 1400; w += 1) {
      const c = effectiveColumns(w);
      const { cell, gap, pad } = gridMetrics(w);
      if (c > 2) assert.ok(c * cell + (c - 1) * gap <= w - 2 * pad, `width ${w}`);
    }
  });
});

describe("isValidGrid", () => {
  it("accepts 1/2 spans and non-negative integers only", () => {
    assert.equal(isValidGrid(g(0, 0, 2, 2)), true);
    assert.equal(isValidGrid(g(0, 0, 3, 1)), false);
    assert.equal(isValidGrid(g(-1, 0)), false);
    assert.equal(isValidGrid(g(0.5, 0)), false);
    assert.equal(isValidGrid(undefined), false);
  });
});

describe("displayLayout (spec AS-9 worked example)", () => {
  const items = [fav("A", g(0, 0)), fav("B", g(5, 0, 2, 1)), fav("D", g(8, 0, 2, 2))];
  it("repacks at C=6", () => {
    assert.deepEqual(plain(displayLayout(items, 6)), { A: g(0, 0), B: g(1, 0, 2, 1), D: g(3, 0, 2, 2) });
  });
  it("equals the stored layout at C=12", () => {
    assert.deepEqual(plain(displayLayout(items, 12)), { A: g(0, 0), B: g(5, 0, 2, 1), D: g(8, 0, 2, 2) });
  });
  it("is stateless: widening restores the stored cells", () => {
    displayLayout(items, 6);
    assert.deepEqual(displayLayout(items, 12).get("D"), g(8, 0, 2, 2));
  });
  it("ignores hidden metrics", () => {
    const withHidden = [...items, { id: "weather:uv", type: "weather-metric", enabled: false, grid: g(0, 0) }];
    assert.equal(displayLayout(withHidden, 12).has("weather:uv"), false);
    assert.deepEqual(displayLayout(withHidden, 12).get("A"), g(0, 0));
  });
  it("places unplaced widgets after the positioned ones, in order (spec § Reading grid)", () => {
    const broken = [fav("A", g(0, 0)), { id: "X", type: "favorite" }, { id: "Y", type: "favorite", grid: g(0, 0, 3, 1) }];
    assert.deepEqual(plain(displayLayout(broken, 12)), { A: g(0, 0), X: g(1, 0), Y: g(2, 0) });
  });
  it("never overlaps for any column count", () => {
    const many = Array.from({ length: 30 }, (_, i) => fav(`f${i}`, g((i * 3) % 12, Math.floor(i / 4), i % 3 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1)));
    for (let c = 2; c <= 12; c += 1) {
      const seen = new Set();
      for (const { x, y, w, h } of displayLayout(many, c).values()) {
        assert.ok(x + w <= c);
        for (let dx = 0; dx < w; dx += 1) for (let dy = 0; dy < h; dy += 1) {
          assert.equal(seen.has(`${x + dx},${y + dy}`), false);
          seen.add(`${x + dx},${y + dy}`);
        }
      }
    }
  });
});

describe("defaults (spec § Defaults)", () => {
  it("fresh install at 12 columns", () => {
    const ids = ["weather:temperature", "weather:precipitation", "weather:airQuality", "weather:uv", CHROME_IDS.settings, CHROME_IDS.add];
    assert.deepEqual(plain(placeMissing(ids, [])), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(1, 0, 2, 1), "weather:airQuality": g(3, 0, 2, 1),
      "weather:uv": g(5, 0), "chrome:settings": g(6, 0), "chrome:add": g(7, 0)
    });
  });
  it("displays at C=2 per the repack rules", () => {
    const stored = [
      { id: "weather:temperature", type: "weather-metric", enabled: true, grid: g(0, 0) },
      { id: "weather:precipitation", type: "weather-metric", enabled: true, grid: g(1, 0, 2, 1) },
      { id: "weather:airQuality", type: "weather-metric", enabled: true, grid: g(3, 0, 2, 1) },
      { id: "weather:uv", type: "weather-metric", enabled: true, grid: g(5, 0) },
      { id: "chrome:settings", type: "chrome", grid: g(6, 0) },
      { id: "chrome:add", type: "chrome", grid: g(7, 0) }
    ];
    assert.deepEqual(plain(displayLayout(stored, 2)), {
      "weather:temperature": g(0, 0), "weather:precipitation": g(0, 1, 2, 1), "weather:airQuality": g(0, 2, 2, 1),
      "weather:uv": g(1, 0), "chrome:settings": g(0, 3), "chrome:add": g(1, 3)
    });
  });
  it("ensure only places the missing ids around existing widgets", () => {
    const existing = [{ id: "f", type: "favorite", grid: g(0, 0) }];
    assert.deepEqual(plain(placeMissing([CHROME_IDS.settings], existing)), { "chrome:settings": g(1, 0) });
  });
});

describe("placement rules", () => {
  const layout = displayLayout([fav("a", g(0, 0)), fav("b", g(1, 0))], 12);
  it("rejects overlap, overflow and rows further than one below the lowest", () => {
    assert.equal(canPlace(layout, "a", g(1, 0), 12), false);
    assert.equal(canPlace(layout, "a", g(11, 0, 2, 1), 12), false);
    assert.equal(canPlace(layout, "a", g(0, 2), 12), false);
    assert.equal(canPlace(layout, "a", g(0, 1), 12), true);
    assert.equal(canPlace(layout, "a", g(3, 0), 12), true);
  });
  it("AS-19: resize relocates to the first free block from its own row", () => {
    assert.deepEqual(placeResized(layout, "a", { w: 2, h: 1 }, 12), g(2, 0, 2, 1));
    const full = displayLayout([fav("a", g(0, 0)), fav("b", g(1, 0)), fav("c", g(2, 0))], 3);
    assert.deepEqual(placeResized(full, "a", { w: 2, h: 1 }, 3), g(0, 1, 2, 1));
  });
  it("resize keeps its cell when the block still fits", () => {
    const solo = displayLayout([fav("a", g(4, 0))], 12);
    assert.deepEqual(placeResized(solo, "a", { w: 2, h: 2 }, 12), g(4, 0, 2, 2));
  });
  it("placeNew takes the first free block from (0,0)", () => {
    assert.deepEqual(placeNew(layout, { w: 1, h: 1 }, 12), g(2, 0));
    assert.deepEqual(placeNew(layout, { w: 2, h: 2 }, 12), g(2, 0, 2, 2));
  });
  it("cellFromPoint subtracts the grab offset and clamps at 0", () => {
    const metrics = { cell: 72, gap: 8 };
    assert.deepEqual(cellFromPoint({ x: 100, y: 100 }, { left: 20, top: 20 }, metrics), { x: 1, y: 1 });
    assert.deepEqual(cellFromPoint({ x: 100, y: 100 }, { left: 20, top: 20 }, metrics, { x: 1, y: 1 }), { x: 0, y: 0 });
    assert.deepEqual(cellFromPoint({ x: 0, y: 0 }, { left: 20, top: 20 }, metrics, { x: 2, y: 0 }), { x: 0, y: 0 });
  });
});

describe("migrateV1ToV2 (spec AS-12, AS-12b)", () => {
  const metric = (id, size, enabled = true) => ({ id, type: "weather-metric", tileSize: size, enabled });
  const v1 = [
    { id: "fw", type: "favorite", tileSize: "wide" }, { id: "fs", type: "favorite", tileSize: "square" },
    metric("weather:temperature", "square"), metric("weather:precipitation", "wide"),
    metric("weather:airQuality", "wide"), metric("weather:uv", "square")
  ];
  it("AS-12: exact grids at 6 columns", () => {
    assert.deepEqual(plain(migrateV1ToV2(v1, 6)), {
      fw: g(0, 0, 2, 1), fs: g(2, 0), "weather:temperature": g(3, 0), "weather:precipitation": g(4, 0, 2, 1),
      "weather:airQuality": g(0, 1, 2, 1), "weather:uv": g(2, 1), "chrome:settings": g(3, 1), "chrome:add": g(4, 1)
    });
  });
  it("backfills a hole (first-free rule)", () => {
    const items = [{ id: "a", type: "favorite", tileSize: "wide" }, { id: "b", type: "favorite", tileSize: "wide" }, { id: "c", type: "favorite", tileSize: "square" }];
    const out = migrateV1ToV2(items, 3);
    assert.deepEqual([out.get("a"), out.get("b"), out.get("c")], [g(0, 0, 2, 1), g(0, 1, 2, 1), g(2, 0)]);
  });
  it("a wide item at 1 column becomes 1×1", () => {
    assert.deepEqual(migrateV1ToV2([{ id: "a", type: "favorite", tileSize: "wide" }], 1).get("a"), g(0, 0));
  });
  it("hidden metrics take no cell and get a placeholder sized from tileSize", () => {
    const out = migrateV1ToV2([{ id: "a", type: "favorite", tileSize: "square" }, metric("weather:precipitation", "wide", false)], 6);
    assert.deepEqual(out.get("weather:precipitation"), g(0, 0, 2, 1));
    assert.deepEqual(out.get("chrome:settings"), g(1, 0));
  });
  it("AS-12b: resume after an interrupted run equals an uninterrupted run, with holes and >25 items", () => {
    const items = Array.from({ length: 27 }, (_, i) => ({ id: `f${i}`, type: "favorite", tileSize: i % 3 === 2 ? "square" : "wide" }));
    const full = migrateV1ToV2(items, 3);
    const resumed = migrateV1ToV2(items.map((item, i) => (i < 25 ? { ...item, grid: full.get(item.id) } : item)), 3);
    assert.deepEqual(plain(resumed), plain(full));
  });
  it("resume keeps an existing chrome grid", () => {
    const items = [{ id: "a", type: "favorite", tileSize: "square", grid: g(0, 0) }, { id: "chrome:settings", type: "chrome", grid: g(5, 0) }];
    assert.deepEqual(migrateV1ToV2(items, 6).get("chrome:settings"), g(5, 0));
  });
});
