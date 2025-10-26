import forecast from '../src/utils/prediksiCuaca.js';
import fetch from 'node-fetch';

jest.mock('node-fetch', () => jest.fn());

beforeEach(() => {
  fetch.mockReset();
});

test('forecast mengembalikan data yang dipetakan dari fallback Open-Meteo', async () => {
  // Mock respon Open-Meteo
  const now = new Date().toISOString().slice(0, 13) + ':00:00';
  const mockResp = {
    current_weather: { temperature: 30.5, windspeed: 12.3, weathercode: 3, time: now },
    hourly: {
      time: [now],
      relativehumidity_2m: [65],
      pressure_msl: [1009.2],
      visibility: [24140], // meters
      uv_index: [6.5]
    }
  };

  fetch.mockResolvedValue({ ok: true, json: async () => mockResp });

  const data = await new Promise((resolve, reject) => {
    forecast(-6.2, 106.8, (err, res) => (err ? reject(err) : resolve(res)));
  });

  expect(data).toHaveProperty('deskripsi');
  expect(typeof data.temperature).toBe('number');
  expect(data.visibility).toBeCloseTo(24.14, 2);
  expect(data.humidity).toBe(65);
  expect(data.uv_index).toBeCloseTo(6.5, 2);
});
