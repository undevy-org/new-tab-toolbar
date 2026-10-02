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
  }
});
