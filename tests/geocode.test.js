import geocode from '../src/utils/geocode.js';
import fetch from 'node-fetch';

// Mock fetch agar test tidak memanggil jaringan
jest.mock('node-fetch', () => jest.fn());

beforeEach(() => {
  fetch.mockReset();
});

test('geocode mengembalikan koordinat untuk Jakarta', async () => {
  fetch.mockResolvedValue({
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

  const result = await new Promise((resolve, reject) => {
    geocode('Jakarta', (err, res) => (err ? reject(err) : resolve(res)));
  });

  expect(result).toMatchObject({
    latitude: -6.1751,
    longitude: 106.8272,
    location: expect.stringContaining('Jakarta')
  });
});
