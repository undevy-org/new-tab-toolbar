import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultColumnsForItems, placeTooltip } from "../src/widgetsLayout.js";

const square = { tileSize: "square" };
const wide = { tileSize: "wide" };
const legacy = {}; // pre-tileSize items have no tileSize at all

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

describe("widgetsLayout exports", () => {
  it("exports only what is still imported: defaultColumnsForItems (v1 migration) and placeTooltip", async () => {
    const mod = await import("../src/widgetsLayout.js");
    assert.deepEqual(Object.keys(mod).sort(), ["defaultColumnsForItems", "placeTooltip"]);
  });
});
