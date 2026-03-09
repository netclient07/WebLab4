const state = {
  baseLocation: {
    id: "base",
    type: "base",
    name: "Санкт-Петербург",
    latitude: 59.93,
    longitude: 30.31
  },
  extraLocations: [],
  activeLocationId: "base",
  weatherByLocation: {
    base: {
      status: "success",
      data: {
        daily: {
          time: ["2026-03-09", "2026-03-10", "2026-03-11"],
          temperature_2m_max: [3, 4, 2],
          temperature_2m_min: [-2, 0, -1],
          precipitation_probability_max: [20, 35, 40],
          wind_speed_10m_max: [16, 18, 12],
          weather_code: [3, 61, 45]
        }
      }
    }
  }
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
  61: "Слабый дождь",
  63: "Дождь",
  71: "Слабый снег",
  73: "Снег",
  80: "Ливни",
  95: "Гроза"
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

function setForecastState(text, isError = false) {
  refs.forecastState.textContent = text;
  refs.forecastState.classList.toggle("is-error", isError);
  refs.forecastState.classList.remove("hidden");
  refs.forecastGrid.classList.add("hidden");
}

function renderBaseLocationHint() {
  if (state.baseLocation) {
    refs.baseLocationHint.textContent = "Можно добавить дополнительные города и переключаться между ними.";
  } else {
    refs.baseLocationHint.textContent = "Основная локация пока не определена.";
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

  const weatherState = state.weatherByLocation[location.id];
  refs.activeLocationTitle.textContent = location.name;

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

function initializeEventHandlers() {
  refs.refreshBtn.addEventListener("click", () => {
    refs.globalStatus.textContent = "Обновление пока не реализовано";
  });

  refs.addCityForm.addEventListener("submit", (event) => {
    event.preventDefault();
    refs.cityError.textContent = "Добавление города будет реализовано в следующем коммите.";
    refs.cityError.classList.remove("hidden");
  });
}

function initializeApp() {
  renderBaseLocationHint();
  renderLocationList();
  renderActiveForecast();
  initializeEventHandlers();
}

initializeApp();