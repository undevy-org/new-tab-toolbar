export const WIDGET_TYPES = new Set(["favorite", "weather-metric", "chrome"]);
export const WEATHER_METRIC_IDS = [
  "weather:temperature",
  "weather:precipitation",
  "weather:airQuality",
  "weather:uv"
];
export function weatherMetricKey(id) {
  return id.slice("weather:".length);
}
export const NEWER_WIDGETS_MESSAGE =
  "Your saved widgets were written by a newer version of Quiet Tab and can't be edited here. Update Quiet Tab to keep using them.";
// v1 meta only (columns/position were removed by the desktop grid); kept for the v1 -> v2 migration validators.
export const GRID_POSITIONS = new Set(["top", "bottom", "center"]);
export const MIN_GRID_COLUMNS = 1;
export const MAX_GRID_COLUMNS = 12;
export const DEFAULT_GRID_COLUMNS = 6;
export const MAX_FAVORITE_WIDGETS = 200;
export const MAX_WEATHER_METRIC_WIDGETS = 4;
export const MAX_CHROME_WIDGETS = 2;
// Total cap = favorites + the 4 system weather metrics + the 2 chrome tiles (200 + 4 + 2 = 206).
export const MAX_WIDGETS = MAX_FAVORITE_WIDGETS + MAX_WEATHER_METRIC_WIDGETS + MAX_CHROME_WIDGETS;
export const WIDGETS_MUTATION_LOCK_NAME = "quiet-tab:widgets-mutation";
