// Pure UI-state machine for the weather panel's city form: whether the city
// modal is open (in "first-run" or "change" mode), and the live city-suggestion
// dropdown (candidate list plus whether it's open). Unlike favoritesUiState
// there is no add/edit distinction — the same form covers first-time setup
// and later city changes.

export function createInitialWeatherUiState() {
  return { editing: false, suggestions: [], suggestionsOpen: false, modal: null };
}

export function startEditingCity(state) {
  return { ...state, editing: true };
}

export function stopEditingCity(state) {
  return { ...state, editing: false };
}

export function isEditingCity(state) {
  return state.editing === true;
}

export function showSuggestions(state, suggestions) {
  return { ...state, suggestions, suggestionsOpen: suggestions.length > 0 };
}

export function hideSuggestions(state) {
  return { ...state, suggestions: [], suggestionsOpen: false };
}

export function citySuggestions(state) {
  return state.suggestions;
}

export function isSuggestionsOpen(state) {
  return state.suggestionsOpen === true;
}

const CITY_MODAL_MODES = new Set(["first-run", "change"]);

export function openCityModal(state, mode) {
  if (!CITY_MODAL_MODES.has(mode)) {
    throw new Error("Unknown city modal mode");
  }
  return { ...state, modal: { mode }, suggestions: [], suggestionsOpen: false };
}

export function closeCityModal(state) {
  return { ...state, modal: null, suggestions: [], suggestionsOpen: false };
}

export function isCityModalOpen(state) {
  return state.modal != null;
}

export function cityModalMode(state) {
  return state.modal?.mode ?? null;
}
