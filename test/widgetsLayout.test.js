import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultColumnsForItems,
  gridLayout,
  isRenderedWidget,
  moveTargetIndex,
  panelDock,
  tileSpan
} from "../src/widgetsLayout.js";

const square = { tileSize: "square" };
const wide = { tileSize: "wide" };
const legacy = {}; // pre-tileSize items have no tileSize at all

describe("tileSpan", () => {
  it("spans 2 only for a wide tile in a grid that has at least 2 columns", () => {
    assert.equal(tileSpan("wide", 2), 2);
    assert.equal(tileSpan("wide", 12), 2);
    assert.equal(tileSpan("wide", 1), 1, "a 2-span in a 1-column grid collapses to ~61px");
  });

  it("treats square, missing and unknown sizes as 1", () => {
    assert.equal(tileSpan("square", 6), 1);
    assert.equal(tileSpan(undefined, 6), 1);
    assert.equal(tileSpan("huge", 6), 1);
  });
});

describe("defaultColumnsForItems", () => {
  it("uses the default for an empty set", () => {
    assert.equal(defaultColumnsForItems([]), 6);
  });

  it("counts one column per square (or size-less) tile", () => {
    assert.equal(defaultColumnsForItems([square, legacy, square]), 3);
    assert.equal(defaultColumnsForItems([square]), 1);
  });

  it("counts two columns per wide tile so the row does not wrap on upgrade", () => {
    assert.equal(defaultColumnsForItems([wide, square]), 3);
    assert.equal(defaultColumnsForItems([wide, wide]), 4);
  });

  it("never returns fewer than 2 when any tile is wide", () => {
    assert.equal(defaultColumnsForItems([wide]), 2);
  });

  it("clamps to 12 for large sets", () => {
    assert.equal(defaultColumnsForItems(Array.from({ length: 30 }, () => square)), 12);
    assert.equal(defaultColumnsForItems(Array.from({ length: 10 }, () => wide)), 12);
  });
});

describe("gridLayout", () => {
  it("reads columns and position from state", () => {
    assert.deepEqual(gridLayout({ columns: 4, position: "center" }), {
      columns: 4,
      position: "center"
    });
  });

  it("falls back to the defaults when state is missing or partial", () => {
    assert.deepEqual(gridLayout(null), { columns: 6, position: "top" });
    assert.deepEqual(gridLayout({}), { columns: 6, position: "top" });
  });
});

describe("panelDock", () => {
  const base = { viewportHeight: 800, inset: 16, gap: 12, minHeight: 200 };

  it("docks to the bottom when the bar is at the top, limited to the space below the bar", () => {
    const dock = panelDock({ ...base, position: "top", barTop: 16, barBottom: 151 });
    assert.equal(dock.dock, "bottom");
    assert.equal(dock.maxHeight, 800 - 151 - 12 - 16);
  });

  it("docks to the top when the bar is at the bottom, limited to the space above the bar", () => {
    const dock = panelDock({ ...base, position: "bottom", barTop: 600, barBottom: 700 });
    assert.equal(dock.dock, "top");
    assert.equal(dock.maxHeight, 600 - 12 - 16);
  });

  it("docks a centered bar's panel to whichever side has more room", () => {
    assert.deepEqual(panelDock({ ...base, position: "center", barTop: 350, barBottom: 450 }), {
      dock: "top",
      maxHeight: 350 - 12 - 16,
      overlaps: false
    });
    const lower = panelDock({ ...base, position: "center", barTop: 100, barBottom: 300 });
    assert.equal(lower.dock, "bottom");
    assert.equal(lower.maxHeight, 800 - 300 - 12 - 16);
  });

  it("never returns less than the minimum height and flags the accepted overlap", () => {
    const dock = panelDock({ ...base, position: "top", barTop: 16, barBottom: 700 });
    assert.equal(dock.dock, "bottom");
    assert.equal(dock.maxHeight, 200);
    assert.equal(dock.overlaps, true);
  });
});

const fav = (id) => ({ id, type: "favorite" });
const met = (id, enabled = true) => ({ id: `weather:${id}`, type: "weather-metric", enabled });

describe("moveTargetIndex", () => {
  const items = [fav("f0"), fav("f1"), met("temperature"), met("precipitation", false), met("airQuality"), met("uv")];
  it("skips disabled metrics when a rendered widget moves", () => {
    assert.equal(moveTargetIndex(items, 2, 1), 4);   // temperature -> after airQuality
    assert.equal(moveTargetIndex(items, 4, -1), 2);  // airQuality -> before temperature
    assert.equal(moveTargetIndex(items, 2, -1), 1);
  });
  it("moves a disabled row exactly one step", () => {
    assert.equal(moveTargetIndex(items, 3, 1), 4);
    assert.equal(moveTargetIndex(items, 3, -1), 2);
  });
  it("returns -1 with no target", () => {
    assert.equal(moveTargetIndex(items, 0, -1), -1);
    assert.equal(moveTargetIndex(items, 5, 1), -1);
    assert.equal(moveTargetIndex([fav("a"), met("uv", false)], 0, 1), -1, "only a disabled row follows");
  });
  it("classifies rendered widgets", () => {
    assert.equal(isRenderedWidget(fav("a")), true);
    assert.equal(isRenderedWidget(met("uv", false)), false);
  });
});
