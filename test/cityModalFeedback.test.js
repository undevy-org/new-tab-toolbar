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

  // Coverage note (docs/city-modal-low-window.md): resetting `cityModalError` in the helper has no UI-visible effect today.
  // `syncCityModal` has four callers and each assigns the variable right before the call, `buildCityModal` reads it only at
  // open (`showCityModal` and `hideCityModal` reset it first), and the field is disabled while a request runs. The reset
  // guards a future caller; this source test is its only check.
  it("clearCityError resets the variable first (equivalent through the UI, covered here)", async () => {
    const code = await read("newtab.js");
    assert.match(code, /function clearCityError\(\) \{\s*cityModalError = "";/);
  });
});

// AS-LW-01..04 (docs/city-modal-low-window.md): source-level guards; the behavior itself is covered by e2e dg-48.
describe("city modal in a very low window", () => {
  const place = async () => {
    const code = await read("newtab.js");
    const start = code.indexOf("function placePopover()");
    return code.slice(start, code.indexOf("\n  }\n", start));
  };

  it("placePopover drops docked, scroll and compact, then measures the reserve-based height, sets compact, then measures free and tooTall", async () => {
    const body = await place();
    const at = (re) => body.search(re);
    const order = [
      /classList\.remove\("weather-form__suggestions--docked"\)/,
      /classList\.remove\("city-modal__dialog--scroll", "city-modal__dialog--compact"\)/,
      /const withReserve =/,
      /classList\.toggle\("city-modal__dialog--compact"/,
      /const free =/,
      /const tooTall =/,
      /classList\.toggle\("weather-form__suggestions--docked"/,
      /classList\.toggle\("city-modal__dialog--scroll"/
    ].map(at);
    assert.ok(order.every((i) => i >= 0), `all steps present: ${order}`);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), "steps are in the mandatory order");
  });

  it("the height is error-independent: current feedback height out, the reserve in; no new listener or observer", async () => {
    const body = await place();
    assert.match(body, /withReserve = dialog\.getBoundingClientRect\(\)\.height - feedback\.getBoundingClientRect\(\)\.height \+ reserve;/);
    assert.match(body, /compact", withReserve > window\.innerHeight - 2 \* VIEWPORT_MARGIN\)/);
    const code = await read("newtab.js");
    assert.doesNotMatch(code, /ResizeObserver/);
  });

  it("the compact rule only gives up the reserve and the feedback block itself is unchanged", async () => {
    const css = await read("surfaces.css");
    const rule = css.match(/\.city-modal__dialog--compact \.city-modal__feedback \{([^}]*)\}/);
    assert.ok(rule, "compact rule exists");
    assert.deepEqual(rule[1].split(";").map((d) => d.split(":")[0].trim()).filter(Boolean), ["min-height"]);
    assert.match(rule[1], /min-height: 0;/);
    assert.match(css, /\.city-modal__feedback \{\s*min-height: calc\(2 \* var\(--line-height-body\) \* var\(--font-size-md\)\);\s*\}/);
  });
});
