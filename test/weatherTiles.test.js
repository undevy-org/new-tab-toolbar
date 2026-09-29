import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeWeatherMetric } from "../src/weatherTiles.js";

const data = {
  temperature: 21, temperatureTodayAt15: 24, temperatureYesterdayAt15: 22,
  uvIndex: 3, uvIndexMax: 6, precipitationProbabilityMax: 40, precipitationStartHour: "15:00",
  usAqi: 40, pm2_5: 9
};
const ready = { status: "ready", data, error: null };
const stale = { status: "stale", data, error: "offline" };
const failed = { status: "error", data: null, error: "boom" };
const keys = ["temperature", "precipitation", "airQuality", "uv"];

describe("describeWeatherMetric", () => {
  it("returns null when there is nothing to render (no city)", () => {
    for (const k of keys) assert.equal(describeWeatherMetric({ metricKey: k, result: { status: "no-location", data: null }, size: "wide" }), null);
  });

  it("loading: '…', busy, no tone, 'Loading weather…'", () => {
    for (const k of keys) {
      const m = describeWeatherMetric({ metricKey: k, result: null, size: "square" });
      assert.deepEqual([m.primary, m.busy, m.tone, m.description], ["…", true, null, "Loading weather…"]);
    }
  });

  it("error: '—' and the reason", () => {
    const m = describeWeatherMetric({ metricKey: "uv", result: failed, size: "square" });
    assert.deepEqual([m.primary, m.tone, m.description, m.stale], ["—", null, "Weather unavailable: boom", false]);
  });

  it("ready temperature/uv are the same in square and wide (no secondary)", () => {
    for (const k of ["temperature", "uv"]) {
      const a = describeWeatherMetric({ metricKey: k, result: ready, size: "square" });
      const b = describeWeatherMetric({ metricKey: k, result: ready, size: "wide" });
      assert.deepEqual(a, b);
      assert.equal(a.secondary, null);
    }
    assert.equal(describeWeatherMetric({ metricKey: "temperature", result: ready, size: "square" }).primary, "21");
    assert.equal(describeWeatherMetric({ metricKey: "temperature", result: ready, size: "square" }).tone, "green"); // todayAt15 24 <= 25
  });

  it("precipitation shows the start hour only when wide", () => {
    assert.equal(describeWeatherMetric({ metricKey: "precipitation", result: ready, size: "wide" }).secondary, "15:00");
    assert.equal(describeWeatherMetric({ metricKey: "precipitation", result: ready, size: "square" }).secondary, null);
    assert.equal(describeWeatherMetric({ metricKey: "precipitation", result: ready, size: "wide" }).primary, "40%");
    assert.equal(
      describeWeatherMetric({ metricKey: "precipitation", result: { status: "ready", data: { ...data, precipitationStartHour: null } }, size: "wide" }).secondary,
      null
    );
  });

  it("air quality shows PM2.5 only when wide; description is complete either way", () => {
    const wide = describeWeatherMetric({ metricKey: "airQuality", result: ready, size: "wide" });
    const square = describeWeatherMetric({ metricKey: "airQuality", result: ready, size: "square" });
    assert.equal(wide.secondary, "9.0 PM2.5");
    assert.equal(square.secondary, null);
    assert.equal(wide.description, "US AQI 40 (Good), PM2.5 9.0 µg/m³.");
    assert.equal(square.description, wide.description);
  });

  it("stale prefixes the description, sets stale and keeps the data", () => {
    const m = describeWeatherMetric({ metricKey: "uv", result: stale, size: "square" });
    assert.equal(m.stale, true);
    assert.equal(m.primary, "3");
    assert.match(m.description, /^Couldn't refresh - showing saved data\. Current UV index 3/);
  });

  it("labels", () => {
    assert.deepEqual(keys.map((k) => describeWeatherMetric({ metricKey: k, result: null, size: "square" }).label),
      ["Temperature", "Precipitation", "Air quality", "UV index"]);
  });

  const sizes = ["square", "wide"];
  const expectedTone = { temperature: "green", precipitation: "rain-2", airQuality: "green", uv: "orange" };
  const descPrefix = {
    temperature: "Currently 21°.",
    precipitation: "Chance of rain for the rest of the day — 40%",
    airQuality: "US AQI 40 (Good)",
    uv: "Current UV index 3 (Moderate)."
  };

  it("loading is identical in shape for every metric and size", () => {
    for (const k of keys) for (const z of sizes) {
      const m = describeWeatherMetric({ metricKey: k, result: null, size: z });
      assert.deepEqual([m.primary, m.secondary, m.tone, m.stale, m.busy, m.description],
        ["…", null, null, false, true, "Loading weather…"]);
    }
  });

  it("error is identical in shape for every metric and size", () => {
    for (const k of keys) for (const z of sizes) {
      const m = describeWeatherMetric({ metricKey: k, result: failed, size: z });
      assert.deepEqual([m.primary, m.secondary, m.tone, m.stale, m.busy, m.description],
        ["—", null, null, false, false, "Weather unavailable: boom"]);
    }
  });

  it("ready sets the tone for each metric, not busy, not stale", () => {
    for (const k of keys) for (const z of sizes) {
      const m = describeWeatherMetric({ metricKey: k, result: ready, size: z });
      assert.equal(m.tone, expectedTone[k]);
      assert.deepEqual([m.stale, m.busy], [false, false]);
      assert.ok(m.description.startsWith(descPrefix[k]), m.description);
    }
  });

  it("stale keeps the data, tone and secondary of ready and only prefixes the description", () => {
    for (const k of keys) for (const z of sizes) {
      const r = describeWeatherMetric({ metricKey: k, result: ready, size: z });
      const s = describeWeatherMetric({ metricKey: k, result: stale, size: z });
      assert.equal(s.stale, true);
      assert.equal(s.busy, false);
      assert.equal(s.tone, expectedTone[k]);
      assert.equal(s.primary, r.primary);
      assert.equal(s.secondary, r.secondary);
      assert.equal(s.description, `Couldn't refresh - showing saved data. ${r.description}`);
    }
  });
});
