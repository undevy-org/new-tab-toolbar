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
