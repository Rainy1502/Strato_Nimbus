import forecast from '../src/utils/prediksiCuaca.js';

forecast(-6.1754049, 106.827168, (err, pred) => {
  console.log('forecast err:', err);
  console.log('forecast data:', pred);
});
