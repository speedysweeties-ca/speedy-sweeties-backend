const test = require('node:test');
const assert = require('node:assert/strict');
const { prisma } = require('../dist/lib/prisma');
const { getDriverOrdersController } = require('../dist/controllers/driverOrders.controller');
const { WELCOME_FLYER_ITEM_NAME: flyerName } = require('../dist/services/welcomeFlyer.service');

test('driver receives the flyer as an item without an unknown item warning or extra pickup', async t => {
  const replace = (obj, key, value) => { const old = obj[key]; obj[key] = value; t.after(() => { obj[key] = old; }); };
  const flyer = { name: flyerName, quantity: 1, price: 0, itemCatalog: null };
  replace(prisma.order, 'findMany', async () => [{
    id: 'order-1', orderStatus: 'PLACED', pickupStops: [],
    items: [{ name: 'Chips', itemCatalog: { pickupType: 'CONVENIENCE' } }, flyer]
  }]);
  replace(prisma.pickupLocation, 'findMany', async ({ where }) => {
    assert.deepEqual(where.pickupType.in, ['CONVENIENCE']); return [];
  });
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await getDriverOrdersController({ user: { userId: 'driver-1' } }, res);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.orders[0].items[1], flyer);
  assert.equal(res.body.orders[0].routingPlan.unknownPickupItemCount, 0);
  assert.equal(res.body.orders[0].routingPlan.unsupportedPickupTypeCount, 0);
  assert.deepEqual(res.body.orders[0].routingPlan.requiredPickupTypes, ['CONVENIENCE']);
});

test('dispatcher route preview excludes the flyer but still warns about genuine unknown products', async t => {
  const replace = (obj, key, value) => { const old = obj[key]; obj[key] = value; t.after(() => { obj[key] = old; }); };
  const { getOrderRoutingPreviewController } = require('../dist/controllers/routingPreview.controller');
  const traffic = require('../dist/services/googleLiveTrafficSettings.service');
  replace(traffic, 'getGoogleLiveTrafficEnabled', async () => false);
  replace(prisma.order, 'findUnique', async ({ select }) => {
    assert.equal(select.items.select.name, true);
    return { id: 'flyer-routing-fixture', orderStatus: 'PLACED', geocodeStatus: 'VERIFIED',
      deliveryLatitude: 43.5, deliveryLongitude: -80.2,
      items: [{ name: flyerName, itemCatalog: null }, { name: 'Uncategorized product', itemCatalog: null }] };
  });
  replace(prisma.user, 'findMany', async () => []);
  replace(prisma.pickupLocation, 'findMany', async () => assert.fail('no flyer pickup lookup'));
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await getOrderRoutingPreviewController({ params: { orderId: 'flyer-routing-fixture' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.pickupRouting.unknownItemCount, 1);
  assert.deepEqual(res.body.pickupRouting.requiredPickupTypes, []);
});
