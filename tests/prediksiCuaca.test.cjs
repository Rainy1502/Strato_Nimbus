beforeEach(() => {
  global.fetch = jest.fn();
});

test('forecast returns mapped data from Open-Meteo fallback', async () => {
  const now = new Date().toISOString().slice(0, 13) + ':00:00';
  const mockResp = {
    current_weather: { temperature: 30.5, windspeed: 12.3, weathercode: 3, time: now },
    hourly: {
      time: [now],
      relativehumidity_2m: [65],
      pressure_msl: [1009.2],
      visibility: [24140],
      uv_index: [6.5]
    }
  };

  global.fetch.mockResolvedValue({ ok: true, json: async () => mockResp });

  const { default: forecast } = await import('../src/utils/prediksiCuaca.js');

  const data = await new Promise((resolve, reject) => {
    forecast(-6.2, 106.8, (err, res) => (err ? reject(err) : resolve(res)));
  });

  expect(data).toHaveProperty('deskripsi');
  expect(typeof data.temperature).toBe('number');
  expect(data.visibility).toBeCloseTo(24.14, 2);
  expect(data.humidity).toBe(65);
  expect(data.uv_index).toBeCloseTo(6.5, 2);
});
