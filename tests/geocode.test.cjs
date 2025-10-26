beforeEach(() => {
  global.fetch = jest.fn();
});

test('geocode returns coordinates for Jakarta', async () => {
  global.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      features: [
        {
          geometry: { coordinates: [106.8272, -6.1751] },
          properties: { name: 'Jakarta', country: 'Indonesia' }
        }
      ]
    })
  });

  const { default: geocode } = await import('../src/utils/geocode.js');

  const result = await new Promise((resolve, reject) => {
    geocode('Jakarta', (err, res) => (err ? reject(err) : resolve(res)));
  });

  expect(result).toMatchObject({
    latitude: -6.1751,
    longitude: 106.8272,
    location: expect.stringContaining('Jakarta')
  });
});
