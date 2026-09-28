import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WeatherApiError,
  fetchAirQuality,
  fetchWeather,
  geocodeCity,
  searchCities,
  summarizeHourlyForecast,
  usAqiCategory,
  uvIndexLevel
} from "../src/weatherApi.js";

function response(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    async json() {
      return body;
    }
  };
}

describe("fetchWeather", () => {
  it("requests enriched local weather data with the given coordinates", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: { time: ["2026-07-12", "2026-07-13"], uv_index_max: [4.4, 7.7] },
        hourly: {
          time: [
            "2026-07-12T15:00",
            "2026-07-13T00:00",
            "2026-07-13T15:00",
            "2026-07-13T17:00",
            "2026-07-13T19:00"
          ],
          temperature_2m: [29, 22, 27, 26, 25],
          precipitation_probability: [0, 0, 0, 30, 90]
        }
      });
    };

    const result = await fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl });
    const requestedUrl = new URL(calls[0]);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      "https://api.open-meteo.com/v1/forecast"
    );
    assert.equal(requestedUrl.searchParams.get("latitude"), "41.72");
    assert.equal(requestedUrl.searchParams.get("longitude"), "44.78");
    assert.equal(requestedUrl.searchParams.get("current"), "temperature_2m,uv_index");
    assert.equal(requestedUrl.searchParams.get("daily"), "uv_index_max");
    assert.equal(
      requestedUrl.searchParams.get("hourly"),
      "temperature_2m,precipitation_probability"
    );
    assert.equal(requestedUrl.searchParams.get("past_days"), "1");
    assert.equal(requestedUrl.searchParams.get("forecast_days"), "1");
    assert.equal(requestedUrl.searchParams.get("timezone"), "auto");
    assert.deepEqual(result, {
      temperature: 26.7,
      temperatureTodayAt15: 27,
      temperatureYesterdayAt15: 29,
      uvIndex: 3.2,
      uvIndexMax: 7.7,
      precipitationProbabilityMax: 90,
      precipitationStartHour: "17:00"
    });
  });

  it("returns zero precipitation probability and no noticeable precipitation start hour", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: { time: ["2026-07-13"], uv_index_max: [7.7] },
        hourly: {
          time: ["2026-07-12T15:00", "2026-07-13T00:00", "2026-07-13T15:00"],
          temperature_2m: [29, 22, 27],
          precipitation_probability: [0, 0, 0]
        }
      });

    const result = await fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl });

    assert.equal(result.precipitationProbabilityMax, 0);
    assert.equal(result.precipitationStartHour, null);
  });

  it("recalculates today's rain probability against the current hour, not the whole day", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 18.4, uv_index: 0, time: "2026-07-18T06:42" },
        daily: { time: ["2026-07-17", "2026-07-18"], uv_index_max: [3.1, 2.8] },
        hourly: {
          time: [
            "2026-07-17T15:00",
            "2026-07-18T00:00",
            "2026-07-18T01:00",
            "2026-07-18T06:00",
            "2026-07-18T15:00",
            "2026-07-18T23:00"
          ],
          temperature_2m: [24, 17, 17, 18, 22, 18],
          precipitation_probability: [0, 90, 60, 0, 0, 0]
        }
      });

    const result = await fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl });

    assert.equal(result.precipitationProbabilityMax, 0);
    assert.equal(result.precipitationStartHour, null);
  });

  it("throws WeatherApiError for invalid coordinates", async () => {
    const fetchImpl = async () => {
      throw new Error("fetchImpl should not be called for invalid coordinates");
    };

    await assert.rejects(
      () => fetchWeather({ latitude: Number.NaN, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError && error.details?.fieldName === "latitude"
    );
  });

  it("throws WeatherApiError on non-200 responses", async () => {
    const fetchImpl = async () => response({}, { ok: false, status: 503 });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError && error.message.includes("503")
    );
  });

  it("throws WeatherApiError when current.time is missing", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2 },
        daily: { time: ["2026-07-13"], uv_index_max: [7.7] },
        hourly: {
          time: ["2026-07-12T15:00", "2026-07-13T00:00", "2026-07-13T15:00"],
          temperature_2m: [29, 22, 27],
          precipitation_probability: [0, 0, 0]
        }
      });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError && error.details?.fieldName === "current.time"
    );
  });

  it("throws WeatherApiError when the daily local date is missing", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: { uv_index_max: [7.7] }
      });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError when the daily local date is blank", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: { time: [""], uv_index_max: [7.7] }
      });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError when an earlier daily date is blank", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: {
          time: ["", "2026-07-13"],
          uv_index_max: [4.4, 7.7]
        }
      });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError when an earlier daily UV value is missing", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: {
          time: ["2026-07-12", "2026-07-13"],
          uv_index_max: [undefined, 7.7]
        }
      });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError when daily dates and UV values are misaligned", async () => {
    const fetchImpl = async () =>
      response({
        current: { temperature_2m: 26.7, uv_index: 3.2, time: "2026-07-13T00:00" },
        daily: {
          time: ["2026-07-12", "2026-07-13"],
          uv_index_max: [4.4]
        }
      });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError when the response body is not valid JSON", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("Unexpected token in JSON");
      }
    });

    await assert.rejects(
      () => fetchWeather({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });
});

describe("summarizeHourlyForecast", () => {
  const validHourlyForecast = {
    today: "2026-07-13",
    currentTime: "2026-07-13T00:00",
    time: [
      "2026-07-12T15:00",
      "2026-07-13T00:00",
      "2026-07-13T15:00",
      "2026-07-13T17:00"
    ],
    temperatures: [29, 22, 27, 26],
    probabilities: [0, 0, 0, 30]
  };

  it("throws WeatherApiError when either local 15:00 timestamp is missing", () => {
    assert.throws(
      () =>
        summarizeHourlyForecast({
          ...validHourlyForecast,
          time: validHourlyForecast.time.slice(1),
          temperatures: validHourlyForecast.temperatures.slice(1),
          probabilities: validHourlyForecast.probabilities.slice(1)
        }),
      WeatherApiError
    );
    assert.throws(
      () =>
        summarizeHourlyForecast({
          ...validHourlyForecast,
          time: validHourlyForecast.time.filter((timestamp) => timestamp !== "2026-07-13T15:00"),
          temperatures: validHourlyForecast.temperatures.slice(0, -1),
          probabilities: validHourlyForecast.probabilities.slice(0, -1)
        }),
      WeatherApiError
    );
  });

  it("throws WeatherApiError when either local 15:00 temperature is undefined or non-finite", () => {
    for (const [index, value] of [
      [0, undefined],
      [0, Number.NaN],
      [2, undefined],
      [2, Number.POSITIVE_INFINITY]
    ]) {
      const temperatures = [...validHourlyForecast.temperatures];
      temperatures[index] = value;

      assert.throws(
        () => summarizeHourlyForecast({ ...validHourlyForecast, temperatures }),
        WeatherApiError
      );
    }
  });

  it("throws WeatherApiError when a current-day precipitation probability is non-finite", () => {
    const probabilities = [...validHourlyForecast.probabilities];
    probabilities[1] = Number.NaN;

    assert.throws(
      () => summarizeHourlyForecast({ ...validHourlyForecast, probabilities }),
      WeatherApiError
    );
  });

  it("excludes hours before the current hour from precipitation calculations", () => {
    const result = summarizeHourlyForecast({
      ...validHourlyForecast,
      currentTime: "2026-07-13T15:00",
      probabilities: [0, 90, 0, 0]
    });

    assert.equal(result.precipitationProbabilityMax, 0);
    assert.equal(result.precipitationStartHour, null);
  });

  it("keeps a later rain window that has not started yet", () => {
    const result = summarizeHourlyForecast({
      ...validHourlyForecast,
      currentTime: "2026-07-13T15:00",
      probabilities: [0, 90, 10, 80]
    });

    assert.equal(result.precipitationProbabilityMax, 80);
    assert.equal(result.precipitationStartHour, "17:00");
  });

  it("treats the current hour itself as the earliest possible start", () => {
    const result = summarizeHourlyForecast({
      ...validHourlyForecast,
      currentTime: "2026-07-13T15:00",
      probabilities: [0, 50, 60, 0]
    });

    assert.equal(result.precipitationProbabilityMax, 60);
    assert.equal(result.precipitationStartHour, "15:00");
  });

  it("rounds the current timestamp down to its hour bucket", () => {
    const result = summarizeHourlyForecast({
      ...validHourlyForecast,
      currentTime: "2026-07-13T15:45",
      probabilities: [0, 70, 60, 0]
    });

    assert.equal(result.precipitationProbabilityMax, 60);
    assert.equal(result.precipitationStartHour, "15:00");
  });

  it("ignores non-finite probabilities for hours that have already passed", () => {
    const result = summarizeHourlyForecast({
      ...validHourlyForecast,
      currentTime: "2026-07-13T15:00",
      probabilities: [0, Number.NaN, 0, 40]
    });

    assert.equal(result.precipitationProbabilityMax, 40);
    assert.equal(result.precipitationStartHour, "17:00");
  });

  it("defaults to zero probability when no hourly buckets remain for today", () => {
    const result = summarizeHourlyForecast({
      ...validHourlyForecast,
      currentTime: "2026-07-13T19:00"
    });

    assert.equal(result.precipitationProbabilityMax, 0);
    assert.equal(result.precipitationStartHour, null);
  });

  it("throws WeatherApiError when currentTime is missing or malformed", () => {
    assert.throws(
      () => summarizeHourlyForecast({ ...validHourlyForecast, currentTime: undefined }),
      (error) => error instanceof WeatherApiError && error.details?.fieldName === "current.time"
    );
    assert.throws(
      () => summarizeHourlyForecast({ ...validHourlyForecast, currentTime: "not-a-timestamp" }),
      (error) => error instanceof WeatherApiError && error.details?.fieldName === "current.time"
    );
  });
});

describe("fetchAirQuality", () => {
  it("requests US AQI and PM2.5 with the given coordinates", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return response({ current: { us_aqi: 34, pm2_5: 11.4 } });
    };

    const result = await fetchAirQuality({ latitude: 41.72, longitude: 44.78, fetchImpl });
    const requestedUrl = new URL(calls[0]);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      "https://air-quality-api.open-meteo.com/v1/air-quality"
    );
    assert.equal(requestedUrl.searchParams.get("latitude"), "41.72");
    assert.equal(requestedUrl.searchParams.get("longitude"), "44.78");
    assert.equal(requestedUrl.searchParams.get("current"), "us_aqi,pm2_5");
    assert.deepEqual(result, { usAqi: 34, pm2_5: 11.4 });
  });

  it("throws WeatherApiError on non-200 responses", async () => {
    const fetchImpl = async () => response({}, { ok: false, status: 500 });

    await assert.rejects(
      () => fetchAirQuality({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError && error.message.includes("500")
    );
  });

  it("throws WeatherApiError when expected fields are missing", async () => {
    const fetchImpl = async () => response({ current: {} });

    await assert.rejects(
      () => fetchAirQuality({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError when the response body is not valid JSON", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("Unexpected token in JSON");
      }
    });

    await assert.rejects(
      () => fetchAirQuality({ latitude: 41.72, longitude: 44.78, fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });
});

describe("geocodeCity", () => {
  it("resolves the first search result to a location", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return response({
        results: [
          { name: "Springfield", country: "United States", latitude: 39.78, longitude: -89.65 },
          { name: "Springfield Gardens", country: "United States", latitude: 40.66, longitude: -73.76 }
        ]
      });
    };

    const result = await geocodeCity("Springfield", { fetchImpl });
    const requestedUrl = new URL(calls[0]);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      "https://geocoding-api.open-meteo.com/v1/search"
    );
    assert.equal(requestedUrl.searchParams.get("name"), "Springfield");
    assert.equal(requestedUrl.searchParams.get("count"), "1");
    assert.equal(requestedUrl.searchParams.get("language"), "en");
    assert.deepEqual(result, {
      name: "Springfield",
      country: "United States",
      latitude: 39.78,
      longitude: -89.65
    });
  });

  it("throws WeatherApiError when no results are found", async () => {
    const fetchImpl = async () => response({ results: [] });

    await assert.rejects(
      () => geocodeCity("Nonexistent Place", { fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError for an empty city name", async () => {
    const fetchImpl = async () => {
      throw new Error("fetchImpl should not be called for an empty name");
    };

    await assert.rejects(
      () => geocodeCity("   ", { fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError on non-200 responses", async () => {
    const fetchImpl = async () => response({}, { ok: false, status: 429 });

    await assert.rejects(
      () => geocodeCity("Springfield", { fetchImpl }),
      (error) => error instanceof WeatherApiError && error.message.includes("429")
    );
  });

  it("throws WeatherApiError when the response body is not valid JSON", async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      async json() {
        throw new SyntaxError("Unexpected token in JSON");
      }
    });

    await assert.rejects(
      () => geocodeCity("Springfield", { fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });
});

describe("searchCities", () => {
  it("requests multiple candidates and returns them as location objects", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return response({
        results: [
          { name: "Springfield", country: "United States", latitude: 39.78, longitude: -89.65 },
          { name: "Springfield Gardens", country: "United States", latitude: 40.66, longitude: -73.76 }
        ]
      });
    };

    const result = await searchCities("Spring", { count: 6, fetchImpl });
    const requestedUrl = new URL(calls[0]);

    assert.equal(
      requestedUrl.origin + requestedUrl.pathname,
      "https://geocoding-api.open-meteo.com/v1/search"
    );
    assert.equal(requestedUrl.searchParams.get("name"), "Spring");
    assert.equal(requestedUrl.searchParams.get("count"), "6");
    assert.equal(requestedUrl.searchParams.get("language"), "en");
    assert.deepEqual(result, [
      { name: "Springfield", country: "United States", admin1: "", latitude: 39.78, longitude: -89.65 },
      {
        name: "Springfield Gardens",
        country: "United States",
        admin1: "",
        latitude: 40.66,
        longitude: -73.76
      }
    ]);
  });

  it("defaults count to 6 when not given", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      return response({ results: [] });
    };

    await searchCities("Spring", { fetchImpl });
    const requestedUrl = new URL(calls[0]);

    assert.equal(requestedUrl.searchParams.get("count"), "6");
  });

  it("returns an empty array when no results are found", async () => {
    const fetchImpl = async () => response({ results: [] });

    const result = await searchCities("Nonexistent Place", { fetchImpl });

    assert.deepEqual(result, []);
  });

  it("filters out malformed individual results", async () => {
    const fetchImpl = async () =>
      response({
        results: [
          { name: "Valid City", country: "Testland", latitude: 1.5, longitude: 2.5 },
          { name: "", country: "Testland", latitude: 1.5, longitude: 2.5 },
          { name: "No Coords", country: "Testland", latitude: "oops", longitude: 2.5 }
        ]
      });

    const result = await searchCities("Test", { fetchImpl });

    assert.deepEqual(result, [
      { name: "Valid City", country: "Testland", admin1: "", latitude: 1.5, longitude: 2.5 }
    ]);
  });

  it("includes admin1 to help disambiguate same-named cities", async () => {
    const fetchImpl = async () =>
      response({
        results: [
          {
            name: "Springfield",
            country: "United States",
            admin1: "Illinois",
            latitude: 39.78,
            longitude: -89.65
          },
          {
            name: "Springfield",
            country: "United States",
            admin1: "Missouri",
            latitude: 37.21,
            longitude: -93.29
          }
        ]
      });

    const result = await searchCities("Springfield", { fetchImpl });

    assert.deepEqual(result, [
      {
        name: "Springfield",
        country: "United States",
        admin1: "Illinois",
        latitude: 39.78,
        longitude: -89.65
      },
      {
        name: "Springfield",
        country: "United States",
        admin1: "Missouri",
        latitude: 37.21,
        longitude: -93.29
      }
    ]);
  });

  it("throws WeatherApiError for an empty query", async () => {
    const fetchImpl = async () => {
      throw new Error("fetchImpl should not be called for an empty query");
    };

    await assert.rejects(
      () => searchCities("   ", { fetchImpl }),
      (error) => error instanceof WeatherApiError
    );
  });

  it("throws WeatherApiError on non-200 responses", async () => {
    const fetchImpl = async () => response({}, { ok: false, status: 429 });

    await assert.rejects(
      () => searchCities("Spring", { fetchImpl }),
      (error) => error instanceof WeatherApiError && error.message.includes("429")
    );
  });
});

describe("uvIndexLevel", () => {
  it("maps values to the WHO UV scale", () => {
    assert.equal(uvIndexLevel(0), "Low");
    assert.equal(uvIndexLevel(2), "Low");
    assert.equal(uvIndexLevel(3), "Moderate");
    assert.equal(uvIndexLevel(5), "Moderate");
    assert.equal(uvIndexLevel(6), "High");
    assert.equal(uvIndexLevel(7), "High");
    assert.equal(uvIndexLevel(8), "Very High");
    assert.equal(uvIndexLevel(10), "Very High");
    assert.equal(uvIndexLevel(11), "Extreme");
    assert.equal(uvIndexLevel(15), "Extreme");
  });
});

describe("usAqiCategory", () => {
  it("maps values to US AQI bands", () => {
    assert.equal(usAqiCategory(50), "Good");
    assert.equal(usAqiCategory(51), "Moderate");
    assert.equal(usAqiCategory(100), "Moderate");
    assert.equal(usAqiCategory(101), "Unhealthy for Sensitive Groups");
    assert.equal(usAqiCategory(150), "Unhealthy for Sensitive Groups");
    assert.equal(usAqiCategory(151), "Unhealthy");
    assert.equal(usAqiCategory(200), "Unhealthy");
    assert.equal(usAqiCategory(201), "Very Unhealthy");
    assert.equal(usAqiCategory(300), "Very Unhealthy");
    assert.equal(usAqiCategory(301), "Hazardous");
  });
});
