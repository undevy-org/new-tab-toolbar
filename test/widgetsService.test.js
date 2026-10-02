import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWidgetsStore, createInitialWidgetsState, isWidgetsState } from "../src/widgetsStore.js";
import { MAX_FAVORITE_WIDGETS, NEWER_WIDGETS_MESSAGE } from "../src/widgetsShared.js";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  PlacementError,
  createWidgetsService,
  normalizeFavoriteUrl,
  normalizeNullableImageUrl
} from "../src/widgetsService.js";

const NOW = "2026-07-07T10:00:00.000Z";
const COLS = { columns: 12 };
const g = (x, y, w = 1, h = 1) => ({ x, y, w, h });
const metric = (id, extra = {}) => ({ id, type: "weather-metric", enabled: true, ...extra });

// v2 seed with a validity guard, so a malformed fixture fails loudly instead of testing nothing.
async function seed(store, items) {
  const state = { version: 2, items, createdAt: NOW, updatedAt: NOW };
  assert.equal(isWidgetsState(state), true, "seed state must be a valid v2 state");
  await store.setState(state);
}
const gridsOf = (state) => Object.fromEntries(state.items.map((item) => [item.id, item.grid]));

async function createHarness() {
  let id = 0;
  const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
  const service = createWidgetsService({
    store,
    now: () => NOW,
    createId: () => `fav-${++id}`,
    defaultBackgroundColor: () => "#24292f"
  });

  return { service, store };
}

function favorite(overrides = {}) {
  return {
    id: "fav-1",
    type: "favorite",
    url: "https://example.com/",
    label: "Example",
    domain: "example.com",
    iconMode: "favicon",
    customIconUrl: null,
    backgroundColor: "#24292f",
    backgroundColorSource: "auto",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

describe("widgetsService", () => {
  describe("normalizeFavoriteUrl", () => {
    it("normalizes URLs without an explicit protocol", () => {
      assert.deepEqual(normalizeFavoriteUrl("example.com/path"), {
        url: "https://example.com/path",
        domain: "example.com"
      });
    });

    it("normalizes localhost URLs while preserving http", () => {
      assert.deepEqual(normalizeFavoriteUrl(" http://localhost:3000/a "), {
        url: "http://localhost:3000/a",
        domain: "localhost"
      });
    });

    it("normalizes host-with-port URLs without an explicit protocol", () => {
      assert.deepEqual(normalizeFavoriteUrl("example.com:8443/path"), {
        url: "https://example.com:8443/path",
        domain: "example.com"
      });
    });

    it("normalizes bare host:port URLs without a dot in the host", () => {
      assert.deepEqual(normalizeFavoriteUrl("router:8080"), {
        url: "https://router:8080/",
        domain: "router"
      });
      assert.deepEqual(normalizeFavoriteUrl("nas:9000/share"), {
        url: "https://nas:9000/share",
        domain: "nas"
      });
    });

    it("rejects empty URLs", () => {
      assert.throws(() => normalizeFavoriteUrl(""), /Enter a URL/);
    });

    it("rejects unsupported URL protocols", () => {
      assert.throws(
        () => normalizeFavoriteUrl("javascript:alert(1)"),
        /Only http and https URLs are supported/
      );
      assert.throws(
        () => normalizeFavoriteUrl("file:///tmp/icon.png"),
        /Only http and https URLs are supported/
      );
    });
  });

  describe("normalizeNullableImageUrl", () => {
    it("normalizes empty image URLs to null", () => {
      assert.equal(normalizeNullableImageUrl(""), null);
      assert.equal(normalizeNullableImageUrl("   "), null);
      assert.equal(normalizeNullableImageUrl(null), null);
    });

    it("normalizes image URLs without an explicit protocol", () => {
      assert.equal(
        normalizeNullableImageUrl("cdn.example.com/icon.png"),
        "https://cdn.example.com/icon.png"
      );
    });

    it("normalizes host-with-port image URLs without an explicit protocol", () => {
      assert.equal(
        normalizeNullableImageUrl("cdn.example.com:8443/icon.png"),
        "https://cdn.example.com:8443/icon.png"
      );
    });

    it("normalizes bare host:port image URLs without a dot in the host", () => {
      assert.equal(
        normalizeNullableImageUrl("router:9000/icon.png"),
        "https://router:9000/icon.png"
      );
    });

    it("preserves explicit https image URLs", () => {
      assert.equal(
        normalizeNullableImageUrl("https://cdn.example.com/icon.png"),
        "https://cdn.example.com/icon.png"
      );
    });

    it("rejects unsupported image URL protocols", () => {
      assert.throws(
        () => normalizeNullableImageUrl("data:image/png;base64,abc"),
        /Only http and https image URLs are supported/
      );
    });
  });

  it("adds a favorite with normalized defaults and persists it", async () => {
    const { service, store } = await createHarness();

    const state = await service.addFavorite({ url: "example.com/path" }, COLS);

    assert.deepEqual(state.items, [
      {
        id: "fav-1",
        type: "favorite",
        url: "https://example.com/path",
        label: "example.com",
        domain: "example.com",
        iconMode: "favicon",
        customIconUrl: null,
        backgroundColor: "#24292f",
        backgroundColorSource: "auto",
        grid: g(0, 0),
        createdAt: NOW,
        updatedAt: NOW
      }
    ]);
    assert.deepEqual(await store.getState(), state);
  });

  it("derives manual background color source when adding a custom color", async () => {
    const { service } = await createHarness();

    const state = await service.addFavorite({
      url: "example.com",
      backgroundColor: "#112233"
    }, COLS);

    assert.equal(state.items[0].backgroundColor, "#112233");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("updates favorite fields", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    const state = await service.updateFavorite("fav-1", {
      url: "news.ycombinator.com/item",
      label: "HN item",
      iconMode: "custom",
      customIconUrl: "cdn.example.com/icon.png",
      backgroundColor: "#ABCDEF",
      backgroundColorSource: "manual"
    }, COLS);

    assert.deepEqual(state.items[0], {
      id: "fav-1",
      type: "favorite",
      url: "https://news.ycombinator.com/item",
      label: "HN item",
      domain: "news.ycombinator.com",
      iconMode: "custom",
      customIconUrl: "https://cdn.example.com/icon.png",
      backgroundColor: "#abcdef",
      backgroundColorSource: "manual",
      grid: g(0, 0),
      createdAt: NOW,
      updatedAt: NOW
    });
    assert.deepEqual(await store.getState(), state);
  });

  it("derives manual background color source when updating only color", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    const state = await service.updateFavorite("fav-1", {
      backgroundColor: "#445566"
    }, COLS);

    assert.equal(state.items[0].backgroundColor, "#445566");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("preserves a manual background color when color fields are omitted", async () => {
    const { service } = await createHarness();
    await service.addFavorite({
      url: "example.com",
      backgroundColor: "#ffcc00",
      backgroundColorSource: "manual"
    }, COLS);

    const state = await service.updateFavorite("fav-1", { label: "Example" }, COLS);

    assert.equal(state.items[0].backgroundColor, "#ffcc00");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("defaults the size to 1x1 when adding, and allows choosing a 2x1 span", async () => {
    const { service } = await createHarness();

    const defaulted = await service.addFavorite({ url: "example.com" }, COLS);
    assert.deepEqual(defaulted.items[0].grid, g(0, 0));

    const wide = await service.addFavorite({
      url: "wide.example.com",
      w: 2
    }, COLS);
    assert.deepEqual(wide.items[1].grid, g(1, 0, 2, 1));
  });

  it("updates the size", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    const state = await service.updateFavorite("fav-1", { w: 2 }, COLS);
    assert.deepEqual(state.items[0].grid, g(0, 0, 2, 1));
    assert.equal("tileSize" in state.items[0], false);
  });

  it("rejects an unsupported span", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.addFavorite({ url: "example.com", w: 3 }, COLS),
      /Choose a supported tile width/
    );
    await assert.rejects(
      () => service.addFavorite({ url: "example.com", h: "tall" }, COLS),
      /Choose a supported tile height/
    );
  });

  it("rejects an unsupported span on update", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    await assert.rejects(
      () => service.updateFavorite("fav-1", { w: 3 }, COLS),
      /Choose a supported tile width/
    );
  });

  it("deletes favorites", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "one.example.com" }, COLS);
    await service.addFavorite({ url: "two.example.com" }, COLS);

    const state = await service.deleteFavorite("fav-1", COLS);

    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-2"]
    );
    assert.deepEqual(gridsOf(state), { "fav-2": g(1, 0) });
    assert.deepEqual(await store.getState(), state);
  });

  it("rejects updates, deletes, and moves for unknown favorites", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.updateFavorite("missing", { label: "Missing" }, COLS),
      /Favorite not found/
    );
    await assert.rejects(() => service.deleteFavorite("missing", COLS), /Favorite not found/);
    await assert.rejects(() => service.moveWidget("missing", { x: 0, y: 0 }, COLS), /Widget not found/);
  });

  it("rejects invalid favorite background colors", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.addFavorite({ url: "example.com", backgroundColor: "red" }, COLS),
      /Use a hex color/
    );
  });

  it("rejects adding a favorite once the limit is reached", async () => {
    const { service, store } = await createHarness();
    const items = Array.from({ length: MAX_FAVORITE_WIDGETS }, (_, index) =>
      favorite({
        id: `fav-seed-${index}`,
        url: `https://example-${index}.com/`,
        domain: `example-${index}.com`,
        grid: g(index % 12, Math.floor(index / 12))
      })
    );
    await seed(store, items);

    await assert.rejects(
      () => service.addFavorite({ url: "https://new.example.com" }, COLS),
      new RegExp(`up to ${MAX_FAVORITE_WIDGETS} favorites`)
    );
    assert.equal((await store.getState()).items.length, MAX_FAVORITE_WIDGETS);
  });

  it("serializes simultaneous mutations from services sharing one store", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await seed(store, [
      favorite({ id: "fav-a", url: "https://a.example.com/", domain: "a.example.com", grid: g(0, 0) }),
      favorite({ id: "fav-b", url: "https://b.example.com/", domain: "b.example.com", grid: g(1, 0) }),
      favorite({ id: "fav-c", url: "https://c.example.com/", domain: "c.example.com", grid: g(2, 0) })
    ]);

    const serviceA = createWidgetsService({
      store,
      now: () => NOW,
      defaultBackgroundColor: () => "#24292f"
    });
    const serviceB = createWidgetsService({
      store,
      now: () => NOW,
      defaultBackgroundColor: () => "#24292f"
    });

    // The move targets the cell the delete frees: it only succeeds if the two run one after the other.
    await Promise.all([
      serviceA.deleteFavorite("fav-a", COLS),
      serviceB.moveWidget("fav-c", { x: 0, y: 0 }, COLS)
    ]);

    const stored = await store.getState();
    assert.deepEqual(gridsOf(stored), { "fav-b": g(1, 0), "fav-c": g(0, 0) });
  });

  it("keeps the favorites lock available after a rejected mutation", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" }, COLS);

    await assert.rejects(
      () => service.moveWidget("missing", { x: 0, y: 0 }, COLS),
      /Widget not found/
    );

    const state = await service.moveWidget("fav-1", { x: 3, y: 0 }, COLS);
    assert.deepEqual(gridsOf(state), { "fav-1": g(3, 0) });
  });

  it("tags added favorites with type: 'favorite'", async () => {
    const { service } = await createHarness();
    const state = await service.addFavorite({ url: "example.com" }, COLS);
    assert.equal(state.items[0].type, "favorite");
  });

  it("rejects a move onto an occupied cell with a PlacementError", async () => {
    const { service, store } = await createHarness();
    await seed(store, [favorite({ id: "a", grid: g(0, 0) }), favorite({ id: "b", grid: g(1, 0) })]);
    await assert.rejects(() => service.moveWidget("a", { x: 1, y: 0 }, COLS), PlacementError);
  });
});

describe("stored backgroundColorSource enum survives the label rename", () => {
  it("accepts items whose backgroundColorSource is auto or manual", () => {
    const base = createInitialWidgetsState("2026-07-11T00:00:00.000Z");
    for (const source of ["auto", "manual"]) {
      const state = {
        ...base,
        items: [
          {
            id: "fav-1",
            type: "favorite",
            url: "https://example.com/",
            label: "Example",
            domain: "example.com",
            iconMode: "favicon",
            customIconUrl: null,
            backgroundColor: "#24292f",
            backgroundColorSource: source,
            grid: g(0, 0),
            createdAt: base.createdAt,
            updatedAt: base.updatedAt
          }
        ]
      };
      assert.equal(isWidgetsState(state), true, `source=${source}`);
    }
  });

  it("rejects a renamed/localized backgroundColorSource value", () => {
    const base = createInitialWidgetsState("2026-07-11T00:00:00.000Z");
    const valid = {
      ...base,
      items: [
        {
          id: "fav-1",
          type: "favorite",
          url: "https://example.com/",
          label: "Example",
          domain: "example.com",
          iconMode: "favicon",
          customIconUrl: null,
          backgroundColor: "#24292f",
          backgroundColorSource: "auto",
          grid: g(0, 0),
          createdAt: base.createdAt,
          updatedAt: base.updatedAt
        }
      ]
    };
    assert.equal(isWidgetsState(valid), true, "the fixture is otherwise valid");
    const state = { ...valid, items: [{ ...valid.items[0], backgroundColorSource: "auto-detect" }] };
    assert.equal(isWidgetsState(state), false);
  });
});

// Two favorites and the four weather tiles on a 12-column grid.
async function serviceWithMetrics() {
  const area = createMemoryStorageArea();
  const store = createWidgetsStore(area);
  let n = 0;
  const service = createWidgetsService({ store, createId: () => `new${n++}` });
  await seed(store, [
    favorite({ id: "f0", url: "https://f0.example.com/", domain: "f0.example.com", grid: g(0, 0) }),
    favorite({ id: "f1", url: "https://f1.example.com/", domain: "f1.example.com", grid: g(1, 0) }),
    metric("weather:temperature", { grid: g(2, 0) }),
    metric("weather:precipitation", { grid: g(3, 0, 2, 1) }),
    metric("weather:airQuality", { grid: g(5, 0, 2, 1) }),
    metric("weather:uv", { grid: g(7, 0) })
  ]);
  return { area, store, service };
}

describe("widgetsService with weather metrics", () => {
  it("places a new favorite in the first free cell, leaving the weather tiles where they are", async () => {
    const { service } = await serviceWithMetrics();
    const state = await service.addFavorite({ url: "https://new.example.com" }, COLS);
    const grids = gridsOf(state);
    assert.deepEqual(grids.new0, g(8, 0));
    assert.deepEqual(grids["weather:temperature"], g(2, 0));
    assert.deepEqual(grids["weather:uv"], g(7, 0));
  });

  it("updates a metric's size and enabled, rejects bad input and unknown ids", async () => {
    const { service } = await serviceWithMetrics();
    const state = await service.updateWeatherMetric("weather:temperature", { w: 2, enabled: false }, COLS);
    const t = state.items.find((i) => i.id === "weather:temperature");
    assert.deepEqual([t.grid.w, t.enabled], [2, false]);
    await assert.rejects(service.updateWeatherMetric("weather:nope", { enabled: true }, COLS), /Weather tile not found/);
    await assert.rejects(service.updateWeatherMetric("weather:uv", { w: 3 }, COLS), /tile width/);
    await assert.rejects(service.updateWeatherMetric("weather:uv", { enabled: "yes" }, COLS), /whether the weather tile is shown/);
    await assert.rejects(service.updateWeatherMetric("f0", { enabled: true }, COLS), /Weather tile not found/);
  });

  it("does not let favorite operations touch a metric", async () => {
    const { service } = await serviceWithMetrics();
    await assert.rejects(service.deleteFavorite("weather:uv", COLS), /Favorite not found/);
    await assert.rejects(service.updateFavorite("weather:uv", { label: "x" }, COLS), /Favorite not found/);
  });

  it("every mutation reports the newer-version message (not 'not found') when the meta became newer", async () => {
    const { area, service } = await serviceWithMetrics();
    const before = await area.get(null);
    const newer = { ...before.quietTabWidgetsMeta, version: 3 };
    await area.set({ quietTabWidgetsMeta: newer });
    const snapshot = await area.get(null);
    const message = { message: NEWER_WIDGETS_MESSAGE };
    await assert.rejects(service.updateWeatherMetric("weather:uv", { enabled: false }, COLS), message);
    await assert.rejects(service.moveWidget("weather:uv", { x: 0, y: 1 }, COLS), message);
    await assert.rejects(service.deleteFavorite("f0", COLS), message);
    await assert.rejects(service.updateFavorite("f0", { label: "x" }, COLS), message);
    await assert.rejects(service.addFavorite({ url: "https://n.example.com" }, COLS), message);
    assert.deepEqual(await area.get(null), snapshot);
  });
});
