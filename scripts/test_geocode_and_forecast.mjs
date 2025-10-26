import geocode from '../src/utils/geocode.js';
import forecast from '../src/utils/prediksiCuaca.js';

const test = async () => {
  geocode('Jakarta', (err, data) => {
    console.log('geocode Jakarta err:', err);
    console.log('geocode Jakarta data:', data);

    if (!err) {
      forecast(data.latitude, data.longitude, (err2, pred) => {
        console.log('forecast err:', err2);
        console.log('forecast data:', pred);
      });
    }
  });

  geocode('asdasdasdasd-nonexistent', (err, data) => {
    console.log('geocode invalid err:', err);
    console.log('geocode invalid data:', data);
  });
};

test();
