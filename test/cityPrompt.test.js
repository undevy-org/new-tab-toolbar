import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldAutoShowCityPrompt } from "../src/cityPrompt.js";

const ok = {
  locationRead: true, hasLocation: false, flagRead: true, dismissed: false,
  anyMetricEnabled: true, weatherAvailable: true, gridLocked: false
};

describe("shouldAutoShowCityPrompt", () => {
  it("shows only when every condition holds", () => {
    assert.equal(shouldAutoShowCityPrompt(ok), true);
  });

  it("flipping any single input to its blocking value hides the prompt", () => {
    const blockers = {
      locationRead: false, hasLocation: true, flagRead: false, dismissed: true,
      anyMetricEnabled: false, weatherAvailable: false, gridLocked: true
    };
    for (const [key, value] of Object.entries(blockers)) {
      assert.equal(shouldAutoShowCityPrompt({ ...ok, [key]: value }), false, key);
    }
  });

  it("treats unknown (missing or non-boolean) inputs as blocking", () => {
    for (const key of Object.keys(ok)) {
      const { [key]: _omitted, ...rest } = ok;
      assert.equal(shouldAutoShowCityPrompt(rest), false, `${key} missing`);
      assert.equal(shouldAutoShowCityPrompt({ ...ok, [key]: null }), false, `${key} null`);
    }
    assert.equal(shouldAutoShowCityPrompt({ ...ok, dismissed: "false" }), false);
    assert.equal(shouldAutoShowCityPrompt(undefined), false);
  });
});
