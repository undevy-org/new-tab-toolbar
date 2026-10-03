import {
  fetchAirQuality as defaultFetchAirQuality,
  fetchWeather as defaultFetchWeather,
  geocodeCity as defaultGeocodeCity,
  weatherErrorMessage
} from "./weatherApi.js";

const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;

function isCacheFresh(cache, location, now) {
  return (
    cache !== null &&
    location !== null &&
    cache.locationName === location.name &&
    now - cache.fetchedAt < WEATHER_CACHE_TTL_MS
  );
}

export function createWeatherService({
  locationStore,
  cacheStore,
  fetchWeather = defaultFetchWeather,
  fetchAirQuality = defaultFetchAirQuality,
  geocodeCity = defaultGeocodeCity,
  now = () => Date.now()
}) {
  async function fetchAndCache(location) {
    const [weather, airQuality] = await Promise.all([
      fetchWeather({ latitude: location.latitude, longitude: location.longitude }),
      fetchAirQuality({ latitude: location.latitude, longitude: location.longitude })
    ]);

    return cacheStore.setCache({
      locationName: location.name,
      fetchedAt: now(),
      temperature: weather.temperature,
      uvIndex: weather.uvIndex,
      uvIndexMax: weather.uvIndexMax,
      precipitationProbabilityMax: weather.precipitationProbabilityMax,
      temperatureTodayAt15: weather.temperatureTodayAt15,
      temperatureYesterdayAt15: weather.temperatureYesterdayAt15,
      precipitationStartHour: weather.precipitationStartHour,
      usAqi: airQuality.usAqi,
      pm2_5: airQuality.pm2_5
    });
  }

  async function persistAndFetch(resolvedLocation) {
    const location = await locationStore.setLocation(resolvedLocation);

    try {
      const data = await fetchAndCache(location);
      return { status: "ready", location, data, error: null };
    } catch (error) {
      return { status: "error", location, data: null, error: weatherErrorMessage(error) };
    }
  }

  return {
    async initialize() {
      let location = null;

      try {
        location = await locationStore.getLocation();
      } catch (error) {
        return { status: "error", location: null, data: null, error: weatherErrorMessage(error) };
      }

      if (!location) {
        return { status: "no-location", location: null, data: null, error: null };
      }

      let cached = null;

      try {
        cached = await cacheStore.getCache();
      } catch (error) {
        return { status: "error", location, data: null, error: weatherErrorMessage(error) };
      }

      if (isCacheFresh(cached, location, now())) {
        return { status: "ready", location, data: cached, error: null };
      }

      try {
        const data = await fetchAndCache(location);
        return { status: "ready", location, data, error: null };
      } catch (error) {
        if (cached && cached.locationName === location.name) {
          return { status: "stale", location, data: cached, error: weatherErrorMessage(error) };
        }
        return { status: "error", location, data: null, error: weatherErrorMessage(error) };
      }
    },

    async setCity(name) {
      const resolved = await geocodeCity(name);
      return persistAndFetch(resolved);
    },

    async selectLocation(location) {
      return persistAndFetch(location);
    }
  };
}
