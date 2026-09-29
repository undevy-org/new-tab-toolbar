import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GRID_COLUMNS,
  GRID_POSITIONS,
  MAX_FAVORITE_WIDGETS,
  MAX_GRID_COLUMNS,
  MAX_WEATHER_METRIC_WIDGETS,
  MAX_WIDGETS,
  MIN_GRID_COLUMNS,
  WIDGETS_MUTATION_LOCK_NAME,
  WIDGET_TYPES
} from "../src/widgetsShared.js";

describe("widgetsShared", () => {
  it("only allows the favorite widget type until Phase 2 adds weather metrics", () => {
    assert.equal(WIDGET_TYPES.has("favorite"), true);
    assert.equal(WIDGET_TYPES.has("weather-metric"), false);
    assert.equal(WIDGET_TYPES.size, 1);
  });

  it("allows exactly the three grid positions", () => {
    assert.deepEqual([...GRID_POSITIONS].sort(), ["bottom", "center", "top"]);
  });

  it("bounds columns between 1 and 12 with a default of 6", () => {
    assert.equal(MIN_GRID_COLUMNS, 1);
    assert.equal(MAX_GRID_COLUMNS, 12);
    assert.equal(DEFAULT_GRID_COLUMNS, 6);
  });

  it("caps favorites at 200 and leaves room for the 4 weather metrics in the total", () => {
    assert.equal(MAX_FAVORITE_WIDGETS, 200);
    assert.equal(MAX_WEATHER_METRIC_WIDGETS, 4);
    assert.equal(MAX_WIDGETS, MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS);
  });

  it("names the extension-wide mutation lock", () => {
    assert.equal(WIDGETS_MUTATION_LOCK_NAME, "quiet-tab:widgets-mutation");
  });
});
