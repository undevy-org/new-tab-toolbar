import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("design system wiring", () => {
  it("loads stylesheets in token → control → surface → app order", async () => {
    const html = await readFile(new URL("../src/newtab.html", import.meta.url), "utf8");
    const hrefs = [...html.matchAll(/<link rel="stylesheet" href="\.\/([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(hrefs, ["design-tokens.css", "controls.css", "surfaces.css", "newtab.css"]);
  });

  it("defines core control tokens", async () => {
    const css = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    assert.match(css, /--control-height:\s*40px;/);
    assert.match(css, /--radius-control:\s*8px;/);
    assert.match(css, /--title-margin-bottom:\s*12px;/);
    assert.match(css, /--control-disabled-opacity:\s*0\.62;/);
  });
});

describe("overlay control CSS (AS-DS-10)", () => {
  it("uses control-height tokens and forbids legacy magic heights in controls.css", async () => {
    const css = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    assert.match(css, /min-height:\s*var\(--control-height\)/);
    assert.match(css, /height:\s*calc\(var\(--control-height\) - 2 \* var\(--control-border-width\)\)/);
    assert.doesNotMatch(css, /height:\s*34px/);
    assert.doesNotMatch(css, /min-height:\s*44px/);
    assert.doesNotMatch(css, /\.add-menu__item[^}]*min-height:\s*36px/);
  });
});
