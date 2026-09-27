import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readManifest() {
  const contents = await readFile(
    new URL("../manifest.json", import.meta.url),
    "utf8"
  );
  return JSON.parse(contents);
}

describe("manifest", () => {
  it("uses only the required storage, favicon, and weather-lookup privileges", async () => {
    const manifest = await readManifest();

    assert.deepEqual(manifest.permissions, ["storage", "favicon"]);
    assert.deepEqual(manifest.host_permissions, [
      "https://api.open-meteo.com/*",
      "https://air-quality-api.open-meteo.com/*",
      "https://geocoding-api.open-meteo.com/*"
    ]);
  });

  it("lets Chrome assign the extension id — no pinned key for this independent listing", async () => {
    const manifest = await readManifest();

    assert.equal(manifest.key, undefined);
  });
});
