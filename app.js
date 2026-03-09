const state = {
  baseLocation: null,
  extraLocations: [],
  activeLocationId: null,
  weatherByLocation: {}
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
  61: "Слабый дождь",
  63: "Дождь",
  65: "Сильный дождь",
  71: "Слабый снег",
  73: "Снег",
  75: "Сильный снег",
  80: "Ливни",
  81: "Сильные ливни",
  82: "Очень сильные ливни",
  95: "Гроза",
  96: "Гроза с градом",
  99: "Сильная гроза с градом"
};

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
    refs.baseLocationHint.textContent = "Базовая локация определена. Можно обновить прогноз.";
  } else {
    refs.baseLocationHint.textContent = "Геолокация недоступна. Базовая локация пока не выбрана.";
  }
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
    setForecastState("Геолокация не поддерживается браузером.");
    return;
  }

  setForecastState("Запрашиваем доступ к геолокации...");
  showGlobalStatus("Ожидаем разрешение геолокации...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
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
      setForecastState("Доступ к геолокации отклонен. Позже можно будет выбрать город вручную.");
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

function initializeEventHandlers() {
  refs.refreshBtn.addEventListener("click", refreshWeatherForAllLocations);

  refs.addCityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    refs.cityError.textContent = "Ручное добавление города будет реализовано в следующем коммите.";
    refs.cityError.classList.remove("hidden");
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