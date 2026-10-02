import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultColumnsForItems,
  gridLayout,
  groupWidgets,
  isRenderedWidget,
  moveTargetIndex,
  panelDock,
  placeTooltip,
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
    assert.deepEqual(gridLayout(null), { columns: 6, position: "center" });
    assert.deepEqual(gridLayout({}), { columns: 6, position: "center" });
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
    assert.equal(moveTargetIndex(items, 2, -1), -1, "never crosses into the other group");
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

describe("placeTooltip", () => {
  const vp = { width: 1280, height: 800 };
  const tip = { width: 200, height: 60 };
  const trig = (left, top, width = 52, height = 52) => ({ left, top, width, bottom: top + height });

  it("goes above the trigger when there is room and centers on it", () => {
    const p = placeTooltip({ trigger: trig(600, 300), tooltip: tip, viewport: vp });
    assert.deepEqual(p, { left: 600 + 26 - 100, top: 300 - 8 - 60, side: "top" });
  });
  it("goes below when the room above is smaller than tooltip + gap + margin", () => {
    const p = placeTooltip({ trigger: trig(600, 27), tooltip: tip, viewport: vp });
    assert.equal(p.side, "bottom");
    assert.equal(p.top, 27 + 52 + 8);
  });
  it("clamps horizontally to the margin at both edges", () => {
    assert.equal(placeTooltip({ trigger: trig(0, 300), tooltip: tip, viewport: vp }).left, 8);
    assert.equal(placeTooltip({ trigger: trig(1250, 300, 30), tooltip: tip, viewport: vp }).left, 1280 - 8 - 200);
  });
  it("never leaves the viewport when the tooltip is wider than the room", () => {
    const p = placeTooltip({ trigger: trig(100, 300), tooltip: { width: 400, height: 60 }, viewport: { width: 320, height: 600 } });
    assert.equal(p.left, 8);
  });
  it("keeps the tooltip inside the viewport vertically when neither side fits well", () => {
    const p = placeTooltip({ trigger: trig(100, 5, 52, 590), tooltip: { width: 100, height: 80 }, viewport: { width: 320, height: 600 } });
    assert.ok(p.top >= 8 && p.top + 80 <= 600 - 8);
    assert.deepEqual(p, { left: 76, top: 512, side: "bottom" });
  });
  it("switches side exactly at tooltip + gap + margin of room above", () => {
    const at = placeTooltip({ trigger: trig(600, 76), tooltip: tip, viewport: vp });
    assert.deepEqual([at.side, at.top], ["top", 8]);
    assert.equal(placeTooltip({ trigger: trig(600, 75), tooltip: tip, viewport: vp }).side, "bottom");
  });
  it("stays on top near the viewport bottom when there is no room below", () => {
    const p = placeTooltip({ trigger: trig(600, 740), tooltip: tip, viewport: vp });
    assert.equal(p.side, "top");
  });
  it("goes below (and is clamped) when above does not fit, even if below fits worse", () => {
    const p = placeTooltip({
      trigger: { left: 100, top: 40, width: 52, bottom: 92 },
      tooltip: { width: 100, height: 80 },
      viewport: { width: 320, height: 100 }
    });
    assert.equal(p.side, "bottom");
    assert.equal(p.top, 12);
  });
});

describe("groupWidgets", () => {
  const f = (id) => ({ id, type: "favorite" });
  const m = (id, enabled = true) => ({ id, type: "weather-metric", enabled });

  it("puts favorites first and keeps the relative order inside each group", () => {
    const items = [f("a"), m("t"), f("b"), m("p"), m("q"), f("c")];
    assert.deepEqual(groupWidgets(items).map((i) => i.id), ["a", "b", "c", "t", "p", "q"]);
  });

  it("returns an equal copy for an already grouped list and does not mutate its input", () => {
    const items = [f("a"), m("t")];
    const copy = [...items];
    assert.deepEqual(groupWidgets(items), items);
    assert.notEqual(groupWidgets(items), items);
    assert.deepEqual(items, copy);
  });
});

describe("moveTargetIndex stays inside the group", () => {
  const f = (id) => ({ id, type: "favorite" });
  const m = (id, enabled = true) => ({ id, type: "weather-metric", enabled });
  const grouped = [f("a"), f("b"), m("t"), m("p", false), m("q")];

  it("a favorite never moves onto a metric", () => {
    assert.equal(moveTargetIndex(grouped, 1, 1), -1);
    assert.equal(moveTargetIndex(grouped, 0, -1), -1);
    assert.equal(moveTargetIndex(grouped, 0, 1), 1);
  });

  it("a metric never moves onto a favorite", () => {
    assert.equal(moveTargetIndex(grouped, 2, -1), -1);
    assert.equal(moveTargetIndex(grouped, 4, 1), -1);
  });

  it("an enabled metric jumps over a disabled neighbour, a disabled one moves exactly one row", () => {
    assert.equal(moveTargetIndex(grouped, 2, 1), 4);
    assert.equal(moveTargetIndex(grouped, 3, 1), 4);
    assert.equal(moveTargetIndex(grouped, 3, -1), 2);
  });
});

describe("gridLayout fallback", () => {
  it("falls back to center when there is no state", () => {
    assert.deepEqual(gridLayout(undefined), { columns: 6, position: "center" });
  });
});
