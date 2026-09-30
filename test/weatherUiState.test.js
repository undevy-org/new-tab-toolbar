import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  citySuggestions,
  cityModalMode,
  closeCityModal,
  createInitialWeatherUiState,
  hideSuggestions,
  isCityModalOpen,
  isSuggestionsOpen,
  openCityModal,
  showSuggestions
} from "../src/weatherUiState.js";

describe("weatherUiState", () => {
  it("starts with the modal closed, with no suggestions", () => {
    const state = createInitialWeatherUiState();
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("opens and closes the city modal", () => {
    let state = createInitialWeatherUiState();
    state = openCityModal(state, "change");
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "change");

    state = closeCityModal(state);
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
  });

  it("keeps the modal state when suggestions change, and drops suggestions when the modal opens or closes", () => {
    const candidates = [{ name: "Tbilisi", country: "Georgia", latitude: 41.72, longitude: 44.78 }];
    let state = openCityModal(createInitialWeatherUiState(), "change");
    state = showSuggestions(state, candidates);
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "change");
    assert.equal(isSuggestionsOpen(state), true);
    assert.deepEqual(citySuggestions(state), candidates);

    state = closeCityModal(state);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);

    state = openCityModal(showSuggestions(state, candidates), "first-run");
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
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

describe("city modal state", () => {
  it("starts closed", () => {
    const state = createInitialWeatherUiState();
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
  });

  it("opens in either mode and closes, dropping suggestions", () => {
    let state = showSuggestions(createInitialWeatherUiState(), [{ name: "Tbilisi" }]);
    state = openCityModal(state, "first-run");
    assert.equal(isCityModalOpen(state), true);
    assert.equal(cityModalMode(state), "first-run");
    assert.equal(isSuggestionsOpen(state), false);

    state = closeCityModal(openCityModal(state, "change"));
    assert.equal(isCityModalOpen(state), false);
    assert.equal(cityModalMode(state), null);
  });

  it("empties the suggestions when the modal closes", () => {
    let state = openCityModal(createInitialWeatherUiState(), "change");
    state = showSuggestions(state, [{ name: "Tbilisi" }, { name: "Tbilisi Beach" }]);
    assert.equal(citySuggestions(state).length, 2);
    state = closeCityModal(state);
    assert.equal(isSuggestionsOpen(state), false);
    assert.deepEqual(citySuggestions(state), []);
  });

  it("rejects an unknown mode", () => {
    assert.throws(() => openCityModal(createInitialWeatherUiState(), "other"), /mode/);
  });
});
