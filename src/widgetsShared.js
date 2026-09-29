export const WIDGET_TYPES = new Set(["favorite", "weather-metric"]);
export const WEATHER_METRIC_IDS = [
  "weather:temperature",
  "weather:precipitation",
  "weather:airQuality",
  "weather:uv"
];
export const DEFAULT_WEATHER_METRIC_SIZES = {
  "weather:temperature": "square",
  "weather:precipitation": "wide",
  "weather:airQuality": "wide",
  "weather:uv": "square"
};
export function weatherMetricKey(id) {
  return id.slice("weather:".length);
}
export const NEWER_WIDGETS_MESSAGE =
  "Your saved widgets were written by a newer version of Quiet Tab and can't be edited here. Update Quiet Tab to keep using them.";
export const GRID_POSITIONS = new Set(["top", "bottom", "center"]);
export const MIN_GRID_COLUMNS = 1;
export const MAX_GRID_COLUMNS = 12;
export const DEFAULT_GRID_COLUMNS = 6;
export const MAX_FAVORITE_WIDGETS = 200;
export const MAX_WEATHER_METRIC_WIDGETS = 4;
// Total cap = favorites + the 4 system weather metrics Phase 2 appends. Keeping the
// favorites cap separate means a user with 200 favorites still validates in Phase 2.
export const MAX_WIDGETS = MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS;
export const WIDGETS_MUTATION_LOCK_NAME = "quiet-tab:widgets-mutation";
