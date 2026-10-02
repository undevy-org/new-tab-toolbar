import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const css = await readFile(new URL("../src/newtab.css", import.meta.url), "utf8");

function block(selectorStart) {
  const start = css.indexOf(selectorStart);
  assert.ok(start >= 0, selectorStart);
  return css.slice(start, css.indexOf("}", start));
}
function token(scope, name) {
  const m = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(m, name);
  return m[1].trim();
}
function rgba(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = value.match(/^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*(\d+)%)?\s*\)$/);
  assert.ok(fn, value);
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4]) / 100];
}
const lum = ([r, g, b]) => { const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const over = ([r, g, b, a], [br, bg, bb]) => [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a)];
const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

describe("focus color tokens", () => {
  const light = block(":root {");
  const dark = css.slice(css.indexOf("@media (prefers-color-scheme: dark)"), css.indexOf("* {"));
  for (const [label, scope] of [["light", light], ["dark", dark]]) {
    const panel = rgba(token(scope, "--panel")).slice(0, 3);
    it(`${label}: the soft ring reaches 3:1 against the panel`, () => {
      assert.ok(ratio(over(rgba(token(scope, "--soft-ring")), panel), panel) >= 3);
    });
    it(`${label}: the tile focus ring token reaches 3:1 against the page and the panel (WCAG 1.4.11)`, () => {
      const bg = rgba(token(scope, "--bg")).slice(0, 3);
      const ring = rgba(token(scope, "--focus-ring"));
      assert.ok(ratio(over(ring, bg), bg) >= 3, `page ${ratio(over(ring, bg), bg).toFixed(2)}`);
      assert.ok(ratio(over(ring, panel), panel) >= 3, `panel ${ratio(over(ring, panel), panel).toFixed(2)}`);
    });
  }
});

describe("every tile type uses the tile focus ring token", () => {
  // The outline rule for `selector` (a selector may also head other rules, e.g. the favorite hover/focus border).
  const rule = (selector) => {
    const bodies = [];
    for (let at = css.indexOf(`${selector} {`); at >= 0; at = css.indexOf(`${selector} {`, at + 1)) bodies.push(css.slice(at, css.indexOf("}", at)));
    assert.ok(bodies.length > 0, selector);
    return bodies.find((b) => /outline:/.test(b)) ?? bodies[0];
  };
  for (const selector of [
    ".favorite-tile:focus-visible",
    ".chrome-tile:focus-visible",
    ".desktop-grid > .tile-remove:focus-visible",
    ".weather-tile:focus-visible,\n.city-hint-tile:focus-visible",
    '.desktop[data-edit="true"] .desktop-grid > [data-widget-id]:focus-visible'
  ]) {
    it(`${selector.split("\n")[0]} draws a solid ring in var(--focus-ring)`, () => {
      assert.match(rule(selector), /outline: \d+px solid var\(--focus-ring\);/);
    });
  }
  it("the reduced-motion edit ring is 3 px (over the 2 px dashed edit outline)", () => {
    assert.match(rule('.desktop[data-edit="true"] .desktop-grid > [data-widget-id]:focus-visible'), /outline: 3px solid var\(--focus-ring\);/);
  });
});

describe("no focus rule hides the outline without a visible replacement (fix wave 3, L3-R2-01)", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim(), body: m[2] }));
  const ruleFor = (selector) => rules.find((r) => r.selector === selector);
  // Shared base rules: a transparent outline for forced colors; each control type they cover has its own ring rule.
  const replacements = {
    ".desktop-dialog :is(button, input):focus-visible": [
      ".desktop-dialog .favorite-input:focus-visible",
      ".desktop-dialog .button:focus-visible",
      ".desktop-dialog .text-button:focus-visible",
      ".desktop-dialog .favorite-color-input:focus-visible",
      ".desktop-dialog .segmented:has(input:focus-visible)"
    ],
    ".city-modal :is(button, input, .weather-form__suggestion):focus-visible": [
      ".city-modal .favorite-input:focus-visible",
      ".city-modal .button:focus-visible,\n.city-modal .icon-button:focus-visible",
      ".city-modal .weather-form__suggestion:focus-visible"
    ]
  };
  it("every :focus-visible rule with a transparent outline draws a box-shadow ring or is a listed base rule", () => {
    const transparent = rules.filter((r) => /focus-visible|:focus\b/.test(r.selector) && /outline:[^;]*transparent/.test(r.body));
    assert.ok(transparent.length >= 3);
    for (const r of transparent) {
      if (/box-shadow:/.test(r.body)) continue;
      assert.ok(Object.hasOwn(replacements, r.selector), `transparent outline without a ring: ${r.selector}`);
    }
  });
  for (const [base, list] of Object.entries(replacements)) {
    for (const selector of list) {
      it(`${base.split(" ")[0]}: ${selector.split("\n")[0]} draws a 2px --soft-ring ring`, () => {
        const rule = ruleFor(selector);
        assert.ok(rule, selector);
        assert.match(rule.body, /box-shadow: 0 0 0 2px var\(--soft-ring\);/);
      });
    }
  }
  it("the color input is at full opacity while focused and the segmented option has no inner --focus outline in dialogs", () => {
    assert.match(ruleFor(".desktop-dialog .favorite-color-input:focus-visible").body, /opacity: 1;/);
    assert.match(ruleFor(".desktop-dialog .segmented__option:has(input:focus-visible)").body, /outline: none;/);
  });
});
