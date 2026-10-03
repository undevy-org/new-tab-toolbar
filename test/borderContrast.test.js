import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const tokenCss = await read("../src/design-tokens.css");
const sources = {
  "controls.css": await read("../src/controls.css"),
  "surfaces.css": await read("../src/surfaces.css"),
  "newtab.css": await read("../src/newtab.css"),
};
const designSystem = await read("../docs/design-system.md");

function token(scope, name) {
  const m = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(m, `${name} is declared`);
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

const light = tokenCss.slice(tokenCss.indexOf(":root {"), tokenCss.indexOf("@media (prefers-color-scheme: dark)"));
const dark = tokenCss.slice(tokenCss.indexOf("@media (prefers-color-scheme: dark)"));

describe("AS-CT-01: --color-border-control clears 3:1 in both themes", () => {
  for (const [label, scope, oldBorder] of [["light", light, "#d8dee6"], ["dark", dark, "#343b45"]]) {
    const declared = () => rgba(token(scope, "--color-border-control")).slice(0, 3);
    it(`${label}: against the panel and the page (unrounded)`, () => {
      for (const name of ["--color-surface", "--color-bg"]) {
        const r = ratio(declared(), rgba(token(scope, name)).slice(0, 3));
        assert.ok(r >= 3, `${name} ${r.toFixed(3)}`);
      }
    });
    it(`${label}: --color-border keeps its decorative value`, () => {
      assert.equal(token(scope, "--color-border"), oldBorder);
    });
    it(`${label}: the soft ring clears 3:1 on the focused field fill (--color-fill-soft)`, () => {
      const fill = rgba(token(scope, "--color-fill-soft")).slice(0, 3);
      const ring = rgba(token(scope, "--soft-ring"));
      const panel = rgba(token(scope, "--color-surface")).slice(0, 3);
      // The ring is drawn outside the field, so it sits on the panel and on the fill-soft focused background.
      assert.ok(ratio(over(ring, fill), fill) >= 3, `fill ${ratio(over(ring, fill), fill).toFixed(2)}`);
      assert.ok(ratio(over(ring, panel), panel) >= 3, `panel ${ratio(over(ring, panel), panel).toFixed(2)}`);
    });
  }
  it("--border-control is an alias of the token", () => {
    assert.equal(token(light, "--border-control"), "var(--color-border-control)");
  });
});

function rules(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  }
  return out;
}

describe("AS-CT-05: only the five control-boundary rules use --border-control", () => {
  const five = [".chrome-tile", ".city-hint-tile", ".favorite-input", ".favorite-color-input", ".segmented"];
  const all = Object.entries(sources).flatMap(([file, css]) => rules(css).map((r) => ({ ...r, file })));
  const borderDecl = (r) => r.body.match(/(?:^|[;\s])border(?:-color)?:[^;]*/)?.[0] ?? "";
  for (const selector of five) {
    it(`${selector} draws its border with var(--border-control)`, () => {
      const rule = all.find((r) => r.selector === selector && /(?:^|[;\s])border:/.test(r.body));
      assert.ok(rule, selector);
      assert.match(borderDecl(rule), /var\(--border-control\)/);
    });
  }
  it("no other rule in controls.css, surfaces.css or newtab.css uses it", () => {
    const users = all.filter((r) => /var\(--border-control\)/.test(r.body)).map((r) => r.selector);
    assert.deepEqual(users.filter((s) => !five.includes(s)), []);
  });
  it(".segmented__option keeps the decorative divider", () => {
    const option = all.find((r) => r.selector === ".segmented__option");
    assert.match(option.body, /border-right:[^;]*var\(--border\)/);
  });
});

describe("AS-CT-06: docs name the token", () => {
  const section = (heading) => {
    const start = designSystem.indexOf(heading);
    assert.ok(start >= 0, heading);
    const next = designSystem.indexOf("\n### ", start + heading.length);
    return designSystem.slice(start, next < 0 ? undefined : next);
  };
  it("design-system.md lists --color-border-control", () => {
    assert.match(designSystem, /--color-border-control/);
  });
  for (const heading of ["### `.favorite-input`", "### `.segmented` / `.segmented__option`", "### `.favorite-color-input`"]) {
    it(`${heading} does not use a bare --color-border`, () => {
      assert.doesNotMatch(section(heading).replace(/--color-border-control/g, ""), /--color-border\b/);
    });
  }
  it("the Components lines for those three name the control token", () => {
    for (const heading of ["### `.favorite-input`", "### `.segmented` / `.segmented__option`", "### `.favorite-color-input`"]) {
      assert.match(section(heading), /--color-border-control/, heading);
    }
  });
});
