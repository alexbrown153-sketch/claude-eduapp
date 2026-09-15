// Today's weather for the home-screen sidebar, backed by Open-Meteo (free,
// no API key). A deliberate, explicit exception to this project's usual
// offline-only rule — same category of tradeoff as the PDF import feature,
// but recurring (one fetch per city per day, cached — see app.js) rather
// than a one-time library load.

const WMO_WEATHER = {
  0: { icon: '☀️', label: 'Clear sky' },
  1: { icon: '🌤️', label: 'Mainly clear' },
  2: { icon: '⛅', label: 'Partly cloudy' },
  3: { icon: '☁️', label: 'Overcast' },
  45: { icon: '🌫️', label: 'Fog' },
  48: { icon: '🌫️', label: 'Freezing fog' },
  51: { icon: '🌦️', label: 'Light drizzle' },
  53: { icon: '🌦️', label: 'Drizzle' },
  55: { icon: '🌦️', label: 'Dense drizzle' },
  61: { icon: '🌧️', label: 'Light rain' },
  63: { icon: '🌧️', label: 'Rain' },
  65: { icon: '🌧️', label: 'Heavy rain' },
  71: { icon: '🌨️', label: 'Light snow' },
  73: { icon: '🌨️', label: 'Snow' },
  75: { icon: '❄️', label: 'Heavy snow' },
  80: { icon: '🌦️', label: 'Rain showers' },
  81: { icon: '🌧️', label: 'Rain showers' },
  82: { icon: '⛈️', label: 'Violent rain showers' },
  95: { icon: '⛈️', label: 'Thunderstorm' },
  96: { icon: '⛈️', label: 'Thunderstorm with hail' },
  99: { icon: '⛈️', label: 'Thunderstorm with heavy hail' },
};

function iconFor(code) {
  return WMO_WEATHER[code] || { icon: '🌡️', label: 'Weather' };
}

export async function fetchWeatherForCity(city) {
  const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`);
  if (!geoRes.ok) throw new Error('Could not look up that city right now.');
  const geoData = await geoRes.json();
  const place = geoData.results && geoData.results[0];
  if (!place) throw new Error(`Couldn’t find "${city}" — check the spelling.`);

  const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current_weather=true&temperature_unit=celsius`);
  if (!weatherRes.ok) throw new Error('Weather service did not respond.');
  const weatherData = await weatherRes.json();
  const current = weatherData.current_weather;
  const { icon, label } = iconFor(current.weathercode);

  return {
    placeName: place.name,
    tempC: Math.round(current.temperature),
    icon,
    label,
  };
}
