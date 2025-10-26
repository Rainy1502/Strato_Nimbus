import geocode from '../src/utils/geocode.js';
import forecast from '../src/utils/prediksiCuaca.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const run = async () => {
  console.log('Test geocode caching:');
  geocode('Jakarta', (err, data) => {
    console.log('  first geocode ->', err || JSON.stringify(data));

    // call again immediately
    geocode('Jakarta', (err2, data2) => {
      console.log('  second geocode ->', err2 || JSON.stringify(data2));
    });
  });

  // small pause before forecast tests
  await sleep(500);

  console.log('\nTest forecast caching:');
  forecast(-6.1754049, 106.827168, (err, p) => {
    console.log('  first forecast ->', err || (p && p.deskripsi) || JSON.stringify(p));

    // second call
    forecast(-6.1754049, 106.827168, (err2, p2) => {
      console.log('  second forecast ->', err2 || (p2 && p2.deskripsi) || JSON.stringify(p2));
    });
  });
};

run();
