import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  citySuggestions,
  createInitialWeatherUiState,
  hideSuggestions,
  isEditingCity,
  isSuggestionsOpen,
  showSuggestions,
  startEditingCity,
  stopEditingCity
} from "../src/weatherUiState.js";

describe("weatherUiState", () => {
  it("starts not editing, with no suggestions", () => {
    const state = createInitialWeatherUiState();
    assert.equal(isEditingCity(state), false);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("starts and stops editing the city", () => {
    let state = createInitialWeatherUiState();
    state = startEditingCity(state);
    assert.equal(isEditingCity(state), true);

    state = stopEditingCity(state);
    assert.equal(isEditingCity(state), false);
  });

  it("preserves suggestion state across editing transitions", () => {
    let state = createInitialWeatherUiState();
    state = showSuggestions(state, [
      { name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.78 }
    ]);
    state = startEditingCity(state);

    assert.equal(isEditingCity(state), true);
    assert.equal(isSuggestionsOpen(state), true);
    assert.equal(citySuggestions(state).length, 1);
  });

  it("shows and hides suggestions", () => {
    let state = createInitialWeatherUiState();
    const candidates = [
      { name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.78 },
      { name: "Tblisi", country: "Georgia", latitude: 41.7, longitude: 44.8 }
    ];

    state = showSuggestions(state, candidates);
    assert.equal(isSuggestionsOpen(state), true);
    assert.deepEqual(citySuggestions(state), candidates);

    state = hideSuggestions(state);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("treats an empty suggestion list as closed", () => {
    let state = createInitialWeatherUiState();
    state = showSuggestions(state, []);
    assert.equal(isSuggestionsOpen(state), false);
  });
});
