const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGeocodeQuery, parseNominatimResult } = require('../.test-build/geocoding.js');

test('normalizeGeocodeQuery makes stable cache keys', () => {
  assert.equal(normalizeGeocodeQuery('  100   Dundas St, London, ON  '), '100 dundas st, london, on');
});

test('parseNominatimResult converts provider strings to numbers and metadata', () => {
  const result = parseNominatimResult({
    lat: '42.9849', lon: '-81.2453', display_name: 'London, Ontario, Canada', place_id: 12345,
    address: { city: 'London', state: 'Ontario', country: 'Canada', postcode: 'N6A' },
  });
  assert.equal(result.latitude, 42.9849);
  assert.equal(result.longitude, -81.2453);
  assert.equal(result.providerPlaceId, '12345');
  assert.equal(result.city, 'London');
});

test('parseNominatimResult rejects invalid coordinates', () => {
  assert.throws(() => parseNominatimResult({ lat: 'x', lon: 'y', display_name: 'bad', place_id: 1 }));
});
