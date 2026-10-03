import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const read = (name) => readFile(new URL(`../src/${name}`, import.meta.url), "utf8");

// AS-CE-01..05 (docs/city-error-ux.md): source-level guards; the behavior itself is covered by e2e dg-47.
describe("city modal error feedback", () => {
  it("the input listener and the Clear handler empty the existing error slot", async () => {
    const code = await read("newtab.js");
    assert.match(code, /function clearCityError\(\) \{\s*cityModalError = "";\s*errorNode\.textContent = "";\s*errorNode\.hidden = true;\s*\}/);
    assert.match(code, /input\.addEventListener\("input", \(\) => \{\s*chosenCity = null;[^\n]*\n\s*clearCityError\(\);\s*\}\);/);
    assert.match(code, /clear\.addEventListener\("click", \(\) => \{[^}]*clearCityError\(\);/);
  });

  it("the slot keeps role=alert on the same node, no aria-live, and the helper never rebuilds it", async () => {
    const code = await read("newtab.js");
    assert.match(code, /errorNode\.setAttribute\("role", "alert"\);/);
    const start = code.indexOf("function clearCityError()");
    const helper = code.slice(start, code.indexOf("\n  }\n", start));
    assert.doesNotMatch(helper, /createNode|replaceWith|innerHTML|aria-live|syncCityModal/);
    const builderStart = code.indexOf('const errorNode = createNode("p"');
    const builder = code.slice(builderStart, code.indexOf("form.append(", builderStart));
    assert.doesNotMatch(builder, /aria-live/);
    assert.doesNotMatch(code, /city-modal[^\n]*aria-live/);
  });

  it("the error node sits in a feedback block with no role, aria or text of its own", async () => {
    const code = await read("newtab.js");
    assert.match(code, /const feedback = createNode\("div", "city-modal__feedback"\);\s*feedback\.append\(errorNode\);\s*form\.append\(field, feedback, actions\);/);
    assert.doesNotMatch(code, /feedback\.(setAttribute|textContent)/);
  });

  it("the feedback block only reserves two lines from the two tokens", async () => {
    const css = await read("surfaces.css");
    const rule = css.match(/\.city-modal__feedback \{([^}]*)\}/);
    assert.ok(rule, "rule .city-modal__feedback exists");
    assert.match(rule[1], /min-height: calc\(2 \* var\(--line-height-body\) \* var\(--font-size-md\)\);/);
    assert.deepEqual(rule[1].split(";").map((d) => d.split(":")[0].trim()).filter(Boolean), ["min-height"]);
  });
});
