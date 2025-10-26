import nodeFetch from 'node-fetch';
// Gunakan `globalThis.fetch` jika tersedia (Node 18+), atau fallback ke node-fetch.
const fetch = globalThis.fetch ?? nodeFetch;

// Cache memori sederhana untuk respons prediksi (key = "lat,lon").
// Tujuan: mengurangi jumlah panggilan ke layanan eksternal dan mengatasi batas rate.
const forecastCache = new Map();
const DEFAULT_TTL = 10 * 60 * 1000; // 10 menit
const ERROR_TTL = 60 * 1000; // 1 menit untuk cache error/negatif

const makeKey = (lat, lon) => `${lat},${lon}`;

// Baca entry cache jika belum kedaluwarsa
const getCached = (key) => {
  const entry = forecastCache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.stamp;
  const ttl = entry.error ? ERROR_TTL : DEFAULT_TTL;
  if (age < ttl) return entry;
  // sudah kadaluarsa
  forecastCache.delete(key);
  return null;
};

// Simpan value ke cache (best-effort)
const setCacheValue = (key, value) => {
  try {
    forecastCache.set(key, { stamp: Date.now(), value });
  } catch (e) {
    // best-effort: abaikan kegagalan cache
  }
};

// Simpan pesan error ke cache (negative caching)
const setCacheError = (key, errorMsg) => {
  try {
    forecastCache.set(key, { stamp: Date.now(), error: errorMsg });
  } catch (e) {
    // best-effort
  }
};

/**
 * Panggil Open-Meteo dan peta hasil ke format internal.
 * Mengembalikan objek prediksi terstruktur (best-effort).
 */
const fetchOpenMeteo = async (lat, lon) => {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current_weather=true&hourly=relativehumidity_2m,pressure_msl,visibility,uv_index&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const d = await res.json();

  const cur = d.current_weather || {};

  // Pemetaan kode WMO -> teks & ikon (ringkas)
  const codeMap = new Map([
    [0, { txt: 'Cerah', icon: '☀️' }],
    [1, { txt: 'Cerah sebagian', icon: '🌤️' }],
    [2, { txt: 'Berawan sebagian', icon: '⛅' }],
    [3, { txt: 'Berawan tebal', icon: '☁️' }],
    [45, { txt: 'Berkabut', icon: '🌫️' }],
    [48, { txt: 'Berkabut (rime)', icon: '🌫️' }],
    [51, { txt: 'Gerimis ringan', icon: '🌦️' }],
    [53, { txt: 'Gerimis sedang', icon: '🌦️' }],
    [55, { txt: 'Gerimis lebat', icon: '🌧️' }],
    [61, { txt: 'Hujan ringan', icon: '🌧️' }],
    [63, { txt: 'Hujan sedang', icon: '🌧️' }],
    [65, { txt: 'Hujan lebat', icon: '⛈️' }],
    [71, { txt: 'Salju ringan', icon: '🌨️' }],
    [73, { txt: 'Salju sedang', icon: '🌨️' }],
    [75, { txt: 'Salju lebat', icon: '❄️' }],
    [80, { txt: 'Hujan lokal ringan', icon: '🌧️' }],
    [81, { txt: 'Hujan lokal sedang', icon: '🌧️' }],
    [82, { txt: 'Hujan lokal lebat', icon: '🌧️' }],
    [95, { txt: 'Badai petir', icon: '⛈️' }]
  ]);

  const code = typeof cur.weathercode !== 'undefined' ? Number(cur.weathercode) : null;
  const meta = codeMap.get(code) || { txt: code !== null ? `Weather code ${code}` : null, icon: null };

  // Ambil nilai-hourly yang cocok dengan waktu current_weather (best-effort)
  let humidity = null;
  let pressure = null;
  let visibility = null;
  let uv_index = null;

  try {
    const hourly = d.hourly || {};
    const times = Array.isArray(hourly.time) ? hourly.time : [];
    let idx = -1;
    if (cur.time) idx = times.indexOf(cur.time);
    if (idx === -1 && times.length) {
      const target = cur.time ? new Date(cur.time).getTime() : Date.now();
      let best = 0;
      let bestDiff = Infinity;
      times.forEach((t, i) => {
        const diff = Math.abs(new Date(t).getTime() - target);
        if (diff < bestDiff) { bestDiff = diff; best = i; }
      });
      idx = best;
    }

    if (idx >= 0 && times.length > 0) {
      if (Array.isArray(hourly.relativehumidity_2m)) humidity = hourly.relativehumidity_2m[idx];
      if (Array.isArray(hourly.pressure_msl)) pressure = hourly.pressure_msl[idx];
      if (Array.isArray(hourly.visibility)) {
        const v = hourly.visibility[idx];
        if (typeof v === 'number') visibility = Math.round((v / 1000) * 100) / 100; // km
      }
      if (Array.isArray(hourly.uv_index)) uv_index = hourly.uv_index[idx];
    }
  } catch (e) {
    // best-effort; jika gagal, biarkan field null
  }

  return {
    deskripsi: meta.txt,
    temperature: typeof cur.temperature === 'number' ? cur.temperature : null,
    wind_speed: typeof cur.windspeed === 'number' ? cur.windspeed : null,
    visibility: visibility ?? null,
    humidity: typeof humidity === 'number' ? humidity : null,
    pressure: typeof pressure === 'number' ? pressure : null,
    uv_index: typeof uv_index === 'number' ? uv_index : null,
    icon: meta.icon,
    raw: d
  };
};

/**
 * Ambil prediksi cuaca untuk koordinat tertentu.
 * callback(error, result)
 */
const forecast = async (latitude, longitude, callback, options = {}) => {
  const WEATHERSTACK_KEY = process.env.WEATHERSTACK_KEY || '';
  const ttl = typeof options.ttl === 'number' ? options.ttl : DEFAULT_TTL;
  const key = makeKey(latitude, longitude);

  // Cek cache lebih dahulu
  const cached = getCached(key);
  if (cached) {
    if (cached.error) return callback(cached.error, undefined);
    return callback(undefined, cached.value);
  }

  // Fungsi bantu: tangani fallback ke Open-Meteo
  const tryOpenMeteo = async () => {
    const fallback = await fetchOpenMeteo(latitude, longitude);
    fallback.provider = 'open-meteo';
    setCacheValue(key, fallback);
    return fallback;
  };

  // Jika ada API key, coba Weatherstack dulu
  if (WEATHERSTACK_KEY) {
    const url = `http://api.weatherstack.com/current?access_key=${encodeURIComponent(WEATHERSTACK_KEY)}&query=${encodeURIComponent(latitude)},${encodeURIComponent(longitude)}&units=m`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errMsg = `Gagal menghubungi layanan cuaca (HTTP ${response.status}).`;
        setCacheError(key, errMsg);
        try {
          const fb = await tryOpenMeteo();
          return callback(undefined, fb);
        } catch (e) {
          return callback(errMsg, undefined);
        }
      }

      const data = await response.json();
      if (data.error) {
        const info = data.error.info || data.error.message || JSON.stringify(data.error);
        setCacheError(key, info);
        try {
          const fb = await tryOpenMeteo();
          return callback(undefined, fb);
        } catch (e) {
          return callback(info, undefined);
        }
      }

      const cuaca = data.current || {};
      const prediksi = {
        deskripsi: Array.isArray(cuaca.weather_descriptions) ? cuaca.weather_descriptions[0] : (cuaca.weather_descriptions || null),
        temperature: cuaca.temperature ?? null,
        uv_index: cuaca.uv_index ?? null,
        visibility: cuaca.visibility ?? null,
        humidity: cuaca.humidity ?? null,
        pressure: cuaca.pressure ?? null,
        wind_speed: cuaca.wind_speed ?? null,
        icon: Array.isArray(cuaca.weather_icons) ? cuaca.weather_icons[0] : (cuaca.weather_icons || null),
        raw: cuaca,
        provider: 'weatherstack'
      };

      setCacheValue(key, prediksi);
      return callback(undefined, prediksi);
    } catch (e) {
      const errMsg = 'Tidak dapat terkoneksi ke layanan cuaca.';
      setCacheError(key, errMsg);
      try {
        const fb = await tryOpenMeteo();
        return callback(undefined, fb);
      } catch (ee) {
        return callback(errMsg, undefined);
      }
    }
  }

  // Tanpa API key: langsung ke Open-Meteo
  try {
    const fb = await tryOpenMeteo();
    return callback(undefined, fb);
  } catch (e) {
    const errMsg = 'Tidak dapat terkoneksi ke layanan cuaca.';
    setCacheError(key, errMsg);
    return callback(errMsg, undefined);
  }
};

export default forecast;
