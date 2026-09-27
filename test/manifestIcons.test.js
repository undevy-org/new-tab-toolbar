import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

async function readManifest() {
  const contents = await readFile(
    new URL("../manifest.json", import.meta.url),
    "utf8"
  );
  return JSON.parse(contents);
}

describe("manifest icons", () => {
  it("declares all four required sizes", async () => {
    const manifest = await readManifest();
    assert.deepEqual(Object.keys(manifest.icons).sort(), ["128", "16", "32", "48"]);
  });

  it("every declared icon file exists on disk", async () => {
    const manifest = await readManifest();

    for (const relativePath of Object.values(manifest.icons)) {
      await assert.doesNotReject(
        access(new URL(`../${relativePath}`, import.meta.url)),
        `missing icon file: ${relativePath}`
      );
    }
  });
});
