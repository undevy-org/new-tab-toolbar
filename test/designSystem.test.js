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

describe("grid / page chrome tokens (AS-DS-16)", () => {
  it("declares Phase 2 grid and page chrome tokens in design-tokens.css", async () => {
    const css = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    assert.match(css, /--radius-tile:\s*13px;/);
    assert.match(css, /--radius-drop-highlight:\s*14px;/);
    assert.match(css, /--radius-status-chip:\s*10px;/);
    assert.match(css, /--shadow-status:\s*var\(--shadow-popover\);/);
    assert.match(css, /--status-chip-padding-y:\s*10px;/);
    assert.match(css, /--status-chip-padding-x:\s*14px;/);
    assert.match(css, /--status-chip-offset-bottom:\s*16px;/);
    assert.match(css, /--tile-remove-size:\s*24px;/);
    assert.match(css, /--tile-remove-offset:\s*8px;/);
    assert.match(css, /--font-size-weather-primary-cell-64:\s*16px;/);
    assert.match(css, /--font-size-weather-secondary-cell-64:\s*10px;/);
    assert.match(css, /--font-size-weather-primary-cell-56:\s*14px;/);
    assert.match(css, /--font-size-weather-secondary-cell-56:\s*9px;/);
    assert.match(css, /--line-height-page:\s*1\.45;/);
    assert.match(css, /--space-grid-8:\s*8px;/);
    assert.match(css, /--space-grid-10:\s*10px;/);
    assert.match(css, /--space-grid-12:\s*12px;/);
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

  it("declares .button--danger after .button so the modifier wins the equal-specificity cascade", async () => {
    const css = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    const base = css.search(/^\.button \{/m);
    const danger = css.search(/^\.button--danger \{/m);
    assert.ok(base > -1 && danger > base, `.button at ${base}, .button--danger at ${danger}`);
    assert.match(css.slice(danger, css.indexOf("}", danger)), /border-color: var\(--danger\);\s*color: var\(--danger\);/);
  });

  it("keeps vertical padding on suggestion rows so a wrapped city name does not touch the row edges", async () => {
    const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
    const css = await readFile(new URL("../src/controls.css", import.meta.url), "utf8");
    assert.match(tokens, /--list-row-padding-y:\s*8px;/);
    assert.match(css, /\.weather-form__suggestion \{[^}]*padding: var\(--list-row-padding-y\) var\(--control-padding-x\);/s);
  });

  it("modal titles use title-margin-bottom token in surfaces.css", async () => {
    const css = await readFile(new URL("../src/surfaces.css", import.meta.url), "utf8");
    assert.match(css, /\.desktop-dialog__title\s*\{[^}]*margin:\s*0 0 var\(--title-margin-bottom\)/s);
    assert.match(css, /\.city-modal__title\s*\{[^}]*margin:\s*0 0 var\(--title-margin-bottom\)/s);
  });
});
