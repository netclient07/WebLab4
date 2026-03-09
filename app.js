const MAX_EXTRA_CITIES = 10;

const state = {
  baseLocation: null,
  extraLocations: [],
  activeLocationId: null,
  weatherByLocation: {},
  selectedSuggestion: null,
  suggestionAbortController: null
};

const refs = {
  refreshBtn: document.getElementById("refreshBtn"),
  addCityForm: document.getElementById("addCityForm"),
  cityInput: document.getElementById("cityInput"),
  cityError: document.getElementById("cityError"),
  suggestions: document.getElementById("suggestions"),
  locationList: document.getElementById("locationList"),
  activeLocationTitle: document.getElementById("activeLocationTitle"),
  globalStatus: document.getElementById("globalStatus"),
  forecastState: document.getElementById("forecastState"),
  forecastGrid: document.getElementById("forecastGrid"),
  baseLocationHint: document.getElementById("baseLocationHint")
};

const weatherCodeMap = {
  0: "Ясно",
  1: "Преимущественно ясно",
  2: "Переменная облачность",
  3: "Пасмурно",
  45: "Туман",
  48: "Изморозь",
  51: "Слабая морось",
  53: "Морось",
  55: "Сильная морось",
  56: "Слабая ледяная морось",
  57: "Ледяная морось",
  61: "Слабый дождь",
  63: "Дождь",
  65: "Сильный дождь",
  66: "Слабый ледяной дождь",
  67: "Ледяной дождь",
  71: "Слабый снег",
  73: "Снег",
  75: "Сильный снег",
  77: "Снежные зерна",
  80: "Ливни",
  81: "Сильные ливни",
  82: "Очень сильные ливни",
  85: "Слабый снегопад",
  86: "Сильный снегопад",
  95: "Гроза",
  96: "Гроза с градом",
  99: "Сильная гроза с градом"
};

function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function normalizeCityName(value) {
  return value.trim().toLowerCase();
}

function getAllLocations() {
  const locations = [];
  if (state.baseLocation) {
    locations.push(state.baseLocation);
  }
  return locations.concat(state.extraLocations);
}

function findLocationById(locationId) {
  return getAllLocations().find((location) => location.id === locationId) || null;
}

function makeCityLabel(city) {
  const parts = [city.name];
  if (city.admin1) {
    parts.push(city.admin1);
  }
  if (city.country) {
    parts.push(city.country);
  }
  return parts.join(", ");
}

function capitalize(value) {
  if (!value) {
    return "";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDayLabel(isoDate, dayIndex) {
  if (dayIndex === 0) {
    return {
      title: "Сегодня",
      date: new Date(isoDate).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long"
      })
    };
  }

  const dateObj = new Date(isoDate);
  return {
    title: dateObj.toLocaleDateString("ru-RU", { weekday: "long" }),
    date: dateObj.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
  };
}

function hideCityError() {
  refs.cityError.textContent = "";
  refs.cityError.classList.add("hidden");
}

function showCityError(message) {
  refs.cityError.textContent = message;
  refs.cityError.classList.remove("hidden");
}

function showGlobalStatus(message) {
  refs.globalStatus.textContent = message || "";
}

function setForecastState(text, isError = false) {
  refs.forecastState.textContent = text;
  refs.forecastState.classList.toggle("is-error", isError);
  refs.forecastState.classList.remove("hidden");
  refs.forecastGrid.classList.add("hidden");
}

function renderBaseLocationHint() {
  if (state.baseLocation) {
    refs.baseLocationHint.textContent = "Добавляйте города и переключайтесь между локациями.";
  } else {
    refs.baseLocationHint.textContent = "Геолокация недоступна или отклонена. Можно добавить город вручную.";
  }
}

function renderSuggestions(items, options = {}) {
  refs.suggestions.innerHTML = "";

  if (options.infoMessage) {
    const info = document.createElement("div");
    info.className = "suggestion-item is-info";
    info.textContent = options.infoMessage;
    refs.suggestions.appendChild(info);
    refs.suggestions.classList.remove("hidden");
    return;
  }

  if (!items.length) {
    refs.suggestions.classList.add("hidden");
    return;
  }

  items.forEach((item) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion-item";
    option.textContent = item.displayName;
    option.dataset.cityPayload = JSON.stringify(item);
    option.addEventListener("click", onSuggestionClick);
    refs.suggestions.appendChild(option);
  });

  refs.suggestions.classList.remove("hidden");
}

function hideSuggestions() {
  refs.suggestions.classList.add("hidden");
  refs.suggestions.innerHTML = "";
}

function hasDuplicateLocation(candidate) {
  const normalizedCandidate = normalizeCityName(candidate.name);

  return getAllLocations().some((location) => {
    const sameCoords =
      Math.abs(location.latitude - candidate.latitude) < 0.001 &&
      Math.abs(location.longitude - candidate.longitude) < 0.001;
    const sameName = normalizeCityName(location.name) === normalizedCandidate;
    return sameCoords || sameName;
  });
}

function renderLocationList() {
  const locations = getAllLocations();
  refs.locationList.innerHTML = "";

  if (!locations.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Пока нет добавленных локаций.";
    refs.locationList.appendChild(empty);
    return;
  }

  locations.forEach((location) => {
    const weatherState = state.weatherByLocation[location.id];
    let shortStatus = "Нет данных";

    if (weatherState?.status === "loading") {
      shortStatus = "Загрузка...";
    } else if (weatherState?.status === "success") {
      shortStatus = "Обновлено";
    } else if (weatherState?.status === "error") {
      shortStatus = "Ошибка";
    }

    const row = document.createElement("div");
    row.className = "location-item";

    if (location.id === state.activeLocationId) {
      row.classList.add("is-active");
    }

    const switchButton = document.createElement("button");
    switchButton.type = "button";
    switchButton.className = "location-main";
    switchButton.innerHTML = `<strong>${location.name}</strong><span>${shortStatus}</span>`;
    switchButton.addEventListener("click", () => {
      state.activeLocationId = location.id;
      renderLocationList();
      renderActiveForecast();

      const weatherStateCurrent = state.weatherByLocation[location.id];
      if (!weatherStateCurrent || weatherStateCurrent.status === "idle") {
        fetchWeatherForLocation(location);
      }
    });

    row.appendChild(switchButton);
    refs.locationList.appendChild(row);
  });
}

function renderForecastCards(location, weatherData) {
  refs.activeLocationTitle.textContent = location.name;
  refs.forecastGrid.innerHTML = "";

  const days = weatherData.daily.time.slice(0, 3);

  days.forEach((isoDate, dayIndex) => {
    const labels = formatDayLabel(isoDate, dayIndex);
    const maxTemp = weatherData.daily.temperature_2m_max[dayIndex];
    const minTemp = weatherData.daily.temperature_2m_min[dayIndex];
    const rainChance = weatherData.daily.precipitation_probability_max[dayIndex];
    const wind = weatherData.daily.wind_speed_10m_max[dayIndex];
    const weatherCode = weatherData.daily.weather_code[dayIndex];
    const weatherText = weatherCodeMap[weatherCode] || "Неизвестно";

    const card = document.createElement("article");
    card.className = "forecast-card";
    card.innerHTML = `
      <p class="day-title">${capitalize(labels.title)}</p>
      <p class="day-date">${labels.date}</p>
      <p class="weather-desc">${weatherText}</p>
      <p class="temp">${Math.round(maxTemp)}° / ${Math.round(minTemp)}°</p>
      <p class="details">
        Осадки: ${Math.round(rainChance)}%<br>
        Ветер: ${Math.round(wind)} км/ч
      </p>
    `;
    refs.forecastGrid.appendChild(card);
  });

  refs.forecastState.classList.add("hidden");
  refs.forecastGrid.classList.remove("hidden");
}

function renderActiveForecast() {
  const location = findLocationById(state.activeLocationId);

  if (!location) {
    refs.activeLocationTitle.textContent = "Нет выбранной локации";
    setForecastState("Добавьте локацию для просмотра прогноза.");
    return;
  }

  refs.activeLocationTitle.textContent = location.name;

  const weatherState = state.weatherByLocation[location.id];
  if (!weatherState || weatherState.status === "idle") {
    setForecastState("Данные еще не загружены.");
    return;
  }

  if (weatherState.status === "loading") {
    setForecastState("Загрузка прогноза...");
    return;
  }

  if (weatherState.status === "error") {
    setForecastState(weatherState.message || "Не удалось загрузить прогноз.", true);
    return;
  }

  renderForecastCards(location, weatherState.data);
}

async function fetchWeatherForLocation(location, force = false) {
  const current = state.weatherByLocation[location.id];

  if (!force && current && current.status === "loading") {
    return;
  }

  state.weatherByLocation[location.id] = { status: "loading" };
  renderLocationList();

  if (location.id === state.activeLocationId) {
    renderActiveForecast();
  }

  try {
    const endpoint = new URL("https://api.open-meteo.com/v1/forecast");
    endpoint.searchParams.set("latitude", String(location.latitude));
    endpoint.searchParams.set("longitude", String(location.longitude));
    endpoint.searchParams.set(
      "daily",
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max"
    );
    endpoint.searchParams.set("forecast_days", "3");
    endpoint.searchParams.set("timezone", "auto");

    const response = await fetch(endpoint.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const isValid =
      payload &&
      payload.daily &&
      Array.isArray(payload.daily.time) &&
      payload.daily.time.length >= 3;

    if (!isValid) {
      throw new Error("Некорректный формат данных от погодного сервиса.");
    }

    state.weatherByLocation[location.id] = {
      status: "success",
      data: payload
    };
  } catch (error) {
    state.weatherByLocation[location.id] = {
      status: "error",
      message: "Ошибка загрузки прогноза. Попробуйте позже."
    };
  }

  renderLocationList();

  if (location.id === state.activeLocationId) {
    renderActiveForecast();
  }
}

async function refreshWeatherForAllLocations() {
  const locations = getAllLocations();

  if (!locations.length) {
    showGlobalStatus("Нет локаций для обновления.");
    return;
  }

  showGlobalStatus("Обновление...");
  await Promise.all(locations.map((location) => fetchWeatherForLocation(location, true)));

  const hasErrors = locations.some((location) => state.weatherByLocation[location.id]?.status === "error");

  if (hasErrors) {
    showGlobalStatus("Обновление завершено с ошибками.");
  } else {
    showGlobalStatus(
      `Обновлено: ${new Date().toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit"
      })}`
    );
  }
}

function cityToLocation(city, asBase = false) {
  const basePayload = {
    name: asBase ? city.baseTitle || city.name : city.name,
    latitude: city.latitude,
    longitude: city.longitude
  };

  if (asBase) {
    return {
      ...basePayload,
      id: "base",
      type: "base"
    };
  }

  return {
    ...basePayload,
    id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "extra"
  };
}

function resetCityInput() {
  refs.cityInput.value = "";
  state.selectedSuggestion = null;
  hideSuggestions();
}

function addCityFromSelection() {
  const city = state.selectedSuggestion;

  if (!city) {
    showCityError("Выберите город из выпадающего списка.");
    return;
  }

  hideCityError();

  const candidate = {
    name: city.name,
    latitude: city.latitude,
    longitude: city.longitude
  };

  if (hasDuplicateLocation(candidate)) {
    showCityError("Этот город уже добавлен.");
    return;
  }

  if (!state.baseLocation) {
    state.baseLocation = cityToLocation({ ...city, baseTitle: makeCityLabel(city) }, true);
    state.activeLocationId = state.baseLocation.id;
    state.weatherByLocation.base = { status: "idle" };
  } else {
    if (state.extraLocations.length >= MAX_EXTRA_CITIES) {
      showCityError(`Можно добавить максимум ${MAX_EXTRA_CITIES} дополнительных городов.`);
      return;
    }

    const newLocation = cityToLocation(city, false);
    state.extraLocations.push(newLocation);
    state.activeLocationId = newLocation.id;
    state.weatherByLocation[newLocation.id] = { status: "idle" };
  }

  resetCityInput();
  renderBaseLocationHint();
  renderLocationList();
  renderActiveForecast();
  fetchWeatherForLocation(findLocationById(state.activeLocationId), true);
}

async function fetchCitySuggestions(query) {
  if (state.suggestionAbortController) {
    state.suggestionAbortController.abort();
  }

  state.suggestionAbortController = new AbortController();

  const endpoint = new URL("https://geocoding-api.open-meteo.com/v1/search");
  endpoint.searchParams.set("name", query);
  endpoint.searchParams.set("count", "6");
  endpoint.searchParams.set("language", "ru");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint.toString(), {
    signal: state.suggestionAbortController.signal
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];

  return results.map((item) => ({
    name: item.name,
    latitude: item.latitude,
    longitude: item.longitude,
    country: item.country || "",
    admin1: item.admin1 || "",
    displayName: makeCityLabel(item)
  }));
}

const handleCityInput = debounce(async () => {
  const query = refs.cityInput.value.trim();
  state.selectedSuggestion = null;
  hideCityError();

  if (query.length < 2) {
    hideSuggestions();
    return;
  }

  renderSuggestions([], { infoMessage: "Поиск..." });

  try {
    const suggestions = await fetchCitySuggestions(query);

    if (!suggestions.length) {
      renderSuggestions([], { infoMessage: "Город не найден" });
      return;
    }

    renderSuggestions(suggestions);
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }

    renderSuggestions([], { infoMessage: "Ошибка загрузки подсказок" });
  }
}, 250);

function onSuggestionClick(event) {
  const payload = event.currentTarget.dataset.cityPayload;
  if (!payload) {
    return;
  }

  const city = safeJsonParse(payload);
  if (!city) {
    return;
  }

  state.selectedSuggestion = city;
  refs.cityInput.value = city.displayName;
  hideCityError();
  hideSuggestions();
}

function geolocationToBaseLocation(position) {
  return {
    id: "base",
    type: "base",
    name: "Текущее местоположение",
    latitude: Number(position.coords.latitude.toFixed(4)),
    longitude: Number(position.coords.longitude.toFixed(4))
  };
}

function tryInitializeWithGeolocation() {
  if (!navigator.geolocation) {
    renderBaseLocationHint();
    setForecastState("Геолокация не поддерживается браузером. Добавьте город вручную.");
    return;
  }

  setForecastState("Запрашиваем доступ к геолокации...");
  showGlobalStatus("Ожидаем разрешение геолокации...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (state.baseLocation) {
        return;
      }

      state.baseLocation = geolocationToBaseLocation(position);
      state.activeLocationId = "base";
      state.weatherByLocation.base = { status: "idle" };

      showGlobalStatus("Геолокация получена.");
      renderBaseLocationHint();
      renderLocationList();
      fetchWeatherForLocation(state.baseLocation, true);
    },
    () => {
      showGlobalStatus("Доступ к геолокации отклонен.");
      renderBaseLocationHint();
      setForecastState("Доступ к геолокации отклонен. Выберите город вручную.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function initializeEventHandlers() {
  refs.refreshBtn.addEventListener("click", refreshWeatherForAllLocations);
  refs.cityInput.addEventListener("input", handleCityInput);

  refs.addCityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addCityFromSelection();
  });

  document.addEventListener("click", (event) => {
    if (!refs.suggestions.contains(event.target) && event.target !== refs.cityInput) {
      hideSuggestions();
    }
  });
}

function initializeApp() {
  renderBaseLocationHint();
  renderLocationList();
  renderActiveForecast();
  initializeEventHandlers();
  tryInitializeWithGeolocation();
}

initializeApp();