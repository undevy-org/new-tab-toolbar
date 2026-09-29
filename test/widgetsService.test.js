import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWidgetsStore, createInitialWidgetsState, isWidgetsState } from "../src/widgetsStore.js";
import { MAX_FAVORITE_WIDGETS } from "../src/widgetsShared.js";
import { createMemoryStorageArea } from "./memoryStorageArea.js";
import {
  createWidgetsService,
  normalizeFavoriteUrl,
  normalizeNullableImageUrl
} from "../src/widgetsService.js";

const NOW = "2026-07-07T10:00:00.000Z";

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

    const state = await service.addFavorite({ url: "example.com/path" });

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
        tileSize: "square",
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
    });

    assert.equal(state.items[0].backgroundColor, "#112233");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("updates favorite fields", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "example.com" });

    const state = await service.updateFavorite("fav-1", {
      url: "news.ycombinator.com/item",
      label: "HN item",
      iconMode: "custom",
      customIconUrl: "cdn.example.com/icon.png",
      backgroundColor: "#ABCDEF",
      backgroundColorSource: "manual"
    });

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
      tileSize: "square",
      createdAt: NOW,
      updatedAt: NOW
    });
    assert.deepEqual(await store.getState(), state);
  });

  it("derives manual background color source when updating only color", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" });

    const state = await service.updateFavorite("fav-1", {
      backgroundColor: "#445566"
    });

    assert.equal(state.items[0].backgroundColor, "#445566");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("preserves a manual background color when color fields are omitted", async () => {
    const { service } = await createHarness();
    await service.addFavorite({
      url: "example.com",
      backgroundColor: "#ffcc00",
      backgroundColorSource: "manual"
    });

    const state = await service.updateFavorite("fav-1", { label: "Example" });

    assert.equal(state.items[0].backgroundColor, "#ffcc00");
    assert.equal(state.items[0].backgroundColorSource, "manual");
  });

  it("defaults tileSize to square when adding, and allows choosing wide", async () => {
    const { service } = await createHarness();

    const defaulted = await service.addFavorite({ url: "example.com" });
    assert.equal(defaulted.items[0].tileSize, "square");

    const wide = await service.addFavorite({
      url: "wide.example.com",
      tileSize: "wide"
    });
    assert.equal(wide.items[1].tileSize, "wide");
  });

  it("updates tileSize", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" });

    const state = await service.updateFavorite("fav-1", { tileSize: "wide" });
    assert.equal(state.items[0].tileSize, "wide");
  });

  it("rejects an unsupported tileSize", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.addFavorite({ url: "example.com", tileSize: "huge" }),
      /Choose a supported tile size/
    );
  });

  it("rejects an unsupported tileSize on update", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" });

    await assert.rejects(
      () => service.updateFavorite("fav-1", { tileSize: "huge" }),
      /Choose a supported tile size/
    );
  });

  it("deletes favorites", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "one.example.com" });
    await service.addFavorite({ url: "two.example.com" });

    const state = await service.deleteFavorite("fav-1");

    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-2"]
    );
    assert.deepEqual(await store.getState(), state);
  });

  it("moves favorites by direction and clamps at boundaries", async () => {
    const { service, store } = await createHarness();
    await service.addFavorite({ url: "one.example.com" });
    await service.addFavorite({ url: "two.example.com" });
    await service.addFavorite({ url: "three.example.com" });

    let state = await service.moveWidget("fav-2", -1);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-2", "fav-1", "fav-3"]
    );

    state = await service.moveWidget("fav-2", -1);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-2", "fav-1", "fav-3"]
    );

    state = await service.moveWidget("fav-2", 1);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-1", "fav-2", "fav-3"]
    );

    state = await service.moveWidget("fav-3", 1);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-1", "fav-2", "fav-3"]
    );
    assert.deepEqual(await store.getState(), state);
  });

  it("rejects invalid move directions", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "one.example.com" });
    await service.addFavorite({ url: "two.example.com" });

    await assert.rejects(
      () => service.moveWidget("fav-1"),
      /Move direction must be a finite number/
    );
    await assert.rejects(
      () => service.moveWidget("fav-1", "left"),
      /Move direction must be a finite number/
    );
  });

  it("rejects updates, deletes, and moves for unknown favorites", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.updateFavorite("missing", { label: "Missing" }),
      /Favorite not found/
    );
    await assert.rejects(() => service.deleteFavorite("missing"), /Favorite not found/);
    await assert.rejects(() => service.moveWidget("missing", 1), /Favorite not found/);
  });

  it("rejects invalid favorite background colors", async () => {
    const { service } = await createHarness();

    await assert.rejects(
      () => service.addFavorite({ url: "example.com", backgroundColor: "red" }),
      /Use a hex color/
    );
  });

  it("rejects adding a favorite once the limit is reached", async () => {
    const { service, store } = await createHarness();
    const items = Array.from({ length: MAX_FAVORITE_WIDGETS }, (_, index) =>
      favorite({
        id: `fav-seed-${index}`,
        url: `https://example-${index}.com/`,
        domain: `example-${index}.com`
      })
    );
    await store.setState({
      version: 1, columns: 6, position: "top",
      items,
      createdAt: NOW,
      updatedAt: NOW
    });

    await assert.rejects(
      () => service.addFavorite({ url: "https://new.example.com" }),
      new RegExp(`up to ${MAX_FAVORITE_WIDGETS} favorites`)
    );
    assert.equal((await store.getState()).items.length, MAX_FAVORITE_WIDGETS);
  });

  it("serializes simultaneous mutations from services sharing one store", async () => {
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    await store.setState({
      version: 1, columns: 6, position: "top",
      items: [
        favorite({ id: "fav-a", url: "https://a.example.com/", domain: "a.example.com" }),
        favorite({ id: "fav-b", url: "https://b.example.com/", domain: "b.example.com" }),
        favorite({ id: "fav-c", url: "https://c.example.com/", domain: "c.example.com" })
      ],
      createdAt: NOW,
      updatedAt: NOW
    });

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

    await Promise.all([
      serviceA.deleteFavorite("fav-a"),
      serviceB.moveWidget("fav-c", -1)
    ]);

    const stored = await store.getState();
    assert.deepEqual(
      stored.items.map((item) => item.id),
      ["fav-c", "fav-b"]
    );
  });

  it("keeps the favorites lock available after a rejected mutation", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "example.com" });

    await assert.rejects(
      () => service.moveWidget("missing", 1),
      /Favorite not found/
    );

    const state = await service.moveWidget("fav-1", 1);
    assert.deepEqual(
      state.items.map((item) => item.id),
      ["fav-1"]
    );
  });

  it("tags added favorites with type: 'favorite'", async () => {
    const { service } = await createHarness();
    const state = await service.addFavorite({ url: "example.com" });
    assert.equal(state.items[0].type, "favorite");
  });

  it("moveWidget reorders by a signed direction and is a no-op at the bounds", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "https://a.com" });
    const afterB = await service.addFavorite({ url: "https://b.com" });
    const [idA, idB] = afterB.items.map((item) => item.id);

    const moved = await service.moveWidget(idB, -1);
    assert.deepEqual(moved.items.map((item) => item.id), [idB, idA]);
    const clamped = await service.moveWidget(idB, -1);
    assert.deepEqual(clamped.items.map((item) => item.id), [idB, idA]);
  });

  it("setColumns accepts an in-range integer, coercing a numeric string from a form input", async () => {
    const { service } = await createHarness();
    assert.equal((await service.setColumns(4)).columns, 4);
    assert.equal((await service.setColumns("8")).columns, 8);
    assert.equal((await service.setColumns(" 5 ")).columns, 5);
  });

  it("setColumns rejects zero, decimals, out-of-range and non-numeric values (Review Focus #2)", async () => {
    const { service, store } = await createHarness();
    const before = await store.getState();

    for (const bad of [0, -1, 13, 3.5, "", "abc", "1e1x", null, undefined, NaN, [], {}]) {
      await assert.rejects(
        () => service.setColumns(bad),
        /Choose a number of columns between 1 and 12/,
        String(bad)
      );
    }
    assert.equal((await store.getState()).columns, before.columns, "state untouched");
  });

  it("setPosition accepts the three positions and rejects anything else", async () => {
    const { service } = await createHarness();
    for (const position of ["top", "bottom", "center"]) {
      assert.equal((await service.setPosition(position)).position, position);
    }
    await assert.rejects(() => service.setPosition("middle"), /Choose a supported grid position/);
    await assert.rejects(() => service.setPosition(undefined), /Choose a supported grid position/);
  });

  it("setColumns and setPosition keep the items and bump updatedAt", async () => {
    let tick = 0;
    const store = createWidgetsStore(createMemoryStorageArea(), { now: () => NOW });
    const service = createWidgetsService({
      store,
      now: () => `2026-07-07T10:00:0${++tick}.000Z`,
      createId: () => "fav-1",
      defaultBackgroundColor: () => "#24292f"
    });
    const added = await service.addFavorite({ url: "example.com" });
    const next = await service.setColumns(3);
    assert.equal(next.items.length, 1);
    assert.notEqual(next.updatedAt, added.updatedAt);
  });

  it("serializes setColumns with other mutations through the shared lock", async () => {
    const { service } = await createHarness();
    await service.addFavorite({ url: "https://a.com" });
    await Promise.all([service.setColumns(3), service.setPosition("center"), service.addFavorite({ url: "https://b.com" })]);
    const state = await service.getState();
    assert.equal(state.columns, 3);
    assert.equal(state.position, "center");
    assert.equal(state.items.length, 2);
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
          backgroundColorSource: "auto-detect",
          createdAt: base.createdAt,
          updatedAt: base.updatedAt
        }
      ]
    };
    assert.equal(isWidgetsState(state), false);
  });
});
