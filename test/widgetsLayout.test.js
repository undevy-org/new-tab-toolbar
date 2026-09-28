import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultColumnsForItems,
  gridLayout,
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
