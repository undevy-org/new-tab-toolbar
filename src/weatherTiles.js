import { usAqiCategory, uvIndexLevel } from "./weatherApi.js";
import {
  formatPm25,
  formatPrecipitation,
  formatTemperature,
  rainTone,
  temperatureTone,
  usAqiTone,
  uvTone
} from "./weatherPresentation.js";

const LABELS = {
  temperature: "Temperature",
  precipitation: "Precipitation",
  airQuality: "Air quality",
  uv: "UV index"
};
const STALE_PREFIX = "Couldn't refresh - showing saved data. ";

function readyModel(metricKey, data, size) {
  const wide = size === "wide";
  if (metricKey === "temperature") {
    return {
      primary: formatTemperature(data.temperature),
      secondary: null,
      tone: temperatureTone({ todayAt15: data.temperatureTodayAt15, yesterdayAt15: data.temperatureYesterdayAt15 }),
      description: `Currently ${formatTemperature(data.temperature)}°. Today at 15:00 — ${formatTemperature(data.temperatureTodayAt15)}°, yesterday at 15:00 — ${formatTemperature(data.temperatureYesterdayAt15)}°.`
    };
  }
  if (metricKey === "precipitation") {
    const [primary, start] = formatPrecipitation(data.precipitationProbabilityMax, data.precipitationStartHour);
    return {
      primary,
      secondary: wide ? start ?? null : null,
      tone: rainTone(data.precipitationProbabilityMax),
      description: start
        ? `Chance of rain for the rest of the day — ${primary}, expected from ${start}.`
        : `Chance of rain for the rest of the day — ${primary}.`
    };
  }
  if (metricKey === "airQuality") {
    return {
      primary: String(data.usAqi),
      secondary: wide ? `${formatPm25(data.pm2_5)} PM2.5` : null,
      tone: usAqiTone(data.usAqi),
      description: `US AQI ${data.usAqi} (${usAqiCategory(data.usAqi)}), PM2.5 ${formatPm25(data.pm2_5)} µg/m³.`
    };
  }
  return {
    primary: String(data.uvIndex),
    secondary: null,
    tone: uvTone(data.uvIndex),
    description: `Current UV index ${data.uvIndex} (${uvIndexLevel(data.uvIndex)}). Today's peak — ${data.uvIndexMax} (${uvIndexLevel(data.uvIndexMax)}).`
  };
}

// `result` is null while loading, else a weatherService result. Returns null when no tile
// should exist (no city).
export function describeWeatherMetric({ metricKey, result, size }) {
  const label = LABELS[metricKey];
  const base = { label, secondary: null, tone: null, stale: false, busy: false };

  if (result === null || result === undefined) {
    return { ...base, primary: "…", busy: true, description: "Loading weather…" };
  }
  if (result.status === "no-location") {
    return null;
  }
  if (result.status === "error") {
    return { ...base, primary: "—", description: `Weather unavailable: ${result.error}` };
  }

  const model = readyModel(metricKey, result.data, size);
  const isStale = result.status === "stale";
  return {
    ...base,
    ...model,
    stale: isStale,
    description: isStale ? `${STALE_PREFIX}${model.description}` : model.description
  };
}
