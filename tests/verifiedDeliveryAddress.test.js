const test = require('node:test');
const assert = require('node:assert/strict');
const { createVerifiedDeliveryAddressLookup } = require('../dist/services/verifiedDeliveryAddress.service.js');
const { DeliveryAddressValidationError } = require('../dist/services/deliveryGeocoding.service.js');
const address = { addressLine1: '10 Example Street', city: 'Guelph', province: 'Ontario' };
const verified = { deliveryLatitude: 43.5, deliveryLongitude: -80.2, geocodeStatus: 'VERIFIED', geocodedAddress: '10 Example Street', geocodePlaceId: 'synthetic', geocodeAddressFingerprint: 'synthetic' };

test('precheck, order submission and concurrent reads share one strict server lookup', async () => {
  let calls = 0;
  const lookup = createVerifiedDeliveryAddressLookup(async (input, options) => {
    calls++;
    assert.deepEqual(input, address);
    assert.deepEqual(options, { requireRooftop: true });
    return { ...verified };
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => lookup(address)));
  results[0].deliveryLatitude = 0;
  assert.deepEqual(await lookup({ ...address, deliveryLatitude: 999, verified: true }), verified);
  assert.equal(calls, 1);
  assert.equal(results[1].deliveryLatitude, verified.deliveryLatitude);
});

test('expiry and changed address fields require new validation', async () => {
  let now = 0, calls = 0;
  const lookup = createVerifiedDeliveryAddressLookup(async () => { calls++; return verified; }, () => now);
  await lookup(address);
  now = 299999;
  await lookup(address);
  assert.equal(calls, 1);
  now = 300000;
  await lookup(address);
  for (const change of [{ addressLine1: '11 Example Street' }, { city: 'Fergus' }, { province: 'ON' }]) await lookup({ ...address, ...change });
  assert.equal(calls, 5);
});

test('invalid, unavailable and thrown results cannot populate a successful cache', async () => {
  for (const outcome of ['invalid', 'unavailable', 'error']) {
    let calls = 0;
    const lookup = createVerifiedDeliveryAddressLookup(async () => {
      calls++;
      if (calls > 1) return verified;
      if (outcome === 'invalid') throw new DeliveryAddressValidationError('Invalid address');
      if (outcome === 'error') throw new Error('Provider unavailable');
      return { ...verified, geocodeStatus: 'NEEDS_REVIEW' };
    });
    if (outcome === 'unavailable') assert.equal((await lookup(address)).geocodeStatus, 'NEEDS_REVIEW');
    else await assert.rejects(lookup(address));
    assert.deepEqual(await lookup(address), verified);
    await lookup(address);
    assert.equal(calls, 2);
  }
});

test('capacity eviction and a new server process safely perform a fresh lookup', async () => {
  let calls = 0;
  const provider = async () => { calls++; return verified; };
  const lookup = createVerifiedDeliveryAddressLookup(provider);
  for (let i = 0; i < 1001; i++) await lookup({ ...address, addressLine1: `${i} Example Street` });
  await lookup({ ...address, addressLine1: '0 Example Street' });
  assert.equal(calls, 1002);
  await createVerifiedDeliveryAddressLookup(provider)(address);
  assert.equal(calls, 1003);
});
