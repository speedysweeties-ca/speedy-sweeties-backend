const test = require('node:test');
const assert = require('node:assert/strict');

test('welcome flyers follow real order history atomically on PostgreSQL', {
  skip: process.env.CHECK_WELCOME_FLYER_DATABASE !== 'yes'
}, async t => {
  assert.equal(process.env.NODE_ENV, 'test');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/speedy_flyer_synthetic');
  const { prisma: db } = require('../dist/lib/prisma');
  const business = require('../dist/controllers/business.controller');
  const geocoding = require('../dist/services/deliveryGeocoding.service');
  const dispatch = require('../dist/services/autoDispatchPickupPlan.service');
  const loyalty = require('../dist/services/loyalty.service');
  const { createOrderController: create, createManualOrderController: manual,
    createChatGPTOrderController: chatgpt, updateOrderDetailsController: edit } = require('../dist/controllers/order.controller');
  const { isWelcomeFlyerItem: isFlyer, WELCOME_FLYER_ITEM_NAME: flyerName } = require('../dist/services/welcomeFlyer.service');
  const replace = (obj, key, fn) => { const old = obj[key]; obj[key] = fn; t.after(() => { obj[key] = old; }); };
  replace(business, 'isBusinessConfirmedClosed', async () => false);
  replace(geocoding, 'geocodeDeliveryAddress', async () => ({ geocodeStatus: 'VERIFIED', deliveryLatitude: 43.5, deliveryLongitude: -80.2 }));
  replace(dispatch, 'autoDispatchCreatedOrderWithPickupPlan', async () => ({ dispatched: false }));
  replace(loyalty, 'sendCustomerLoyaltyNotification', async () => {});
  t.after(async () => { await db.$disconnect(); });
  assert.equal(await db.order.count(), 0, 'only a fresh disposable database is allowed');
  const product = { name: 'Synthetic chips', quantity: 2, unitPrice: 3 };
  const copiedFlyer = { name: flyerName, quantity: 5, unitPrice: 99, totalPrice: 495, price: 99 };
  const body = (phone, extra = {}) => ({
    customerName: 'Synthetic Flyer Customer', customerPhone: phone,
    customerEmail: 'flyer@example.invalid', addressLine1: '1 Synthetic Street',
    city: 'Guelph', province: 'ON', paymentMethod: 'CASH', items: [product], ...extra
  });
  const call = async (payload, controller = create, id) => {
    const res = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    await controller({ body: payload, headers: {}, params: { id } }, res);
    return res;
  };
  const expectFlyer = (order, expected) => {
    const flyers = order.items.filter(isFlyer);
    assert.equal(flyers.length, expected ? 1 : 0);
    assert.equal(order.itemsText.includes(flyerName), expected);
    if (expected) {
      assert.equal(flyers[0].quantity, 1);
      assert.equal(Number(flyers[0].price), 0);
      assert.equal(flyers[0].itemCatalogId, null);
    }
    assert.equal(order.items.filter(i => !isFlyer(i)).length, 1);
    assert.equal(Number(order.items.find(i => !isFlyer(i)).price), 3);
  };

  await t.test('manual, website, Android, iOS and integration orders add one free flyer, then strip it from reorders', async () => {
    const sources = ['DISPATCHER_MANUAL', 'WEBFLOW', 'ANDROID_APP', 'IOS_APP', 'CHATGPT'];
    for (const [i, source] of sources.entries()) {
      const payload = body(`519555010${i}`, { orderSource: source, items: [product, copiedFlyer, copiedFlyer] });
      const controller = source === 'DISPATCHER_MANUAL' ? manual : source === 'CHATGPT'
        ? (req, res) => chatgpt(req, res, async () => {}) : create;
      const first = await call(payload, controller);
      assert.equal(first.code, 201);
      expectFlyer(first.body.order, true);
      const repeat = await call(payload, controller);
      assert.equal(repeat.code, 201);
      expectFlyer(repeat.body.order, false);
      assert.equal(repeat.body.order.customerId, first.body.order.customerId);
    }
    assert.equal(await db.itemCatalog.count({ where: { name: flyerName } }), 0);
  });

  await t.test('cancelled first order leaves the next order eligible; failed transaction consumes nothing', async () => {
    const payload = body('5195550110');
    const first = (await call(payload)).body.order;
    await db.order.update({ where: { id: first.id }, data: { orderStatus: 'CANCELLED' } });
    expectFlyer((await call(payload)).body.order, true);
    expectFlyer((await call(payload)).body.order, false);
    const failedPayload = body('5195550111');
    await assert.rejects(call(failedPayload, (req, res) => chatgpt(req, res, async () => { throw new Error('mapping rollback'); })), /mapping rollback/);
    assert.equal(await db.customer.count({ where: { normalizedPhone: '5195550111' } }), 0);
    expectFlyer((await call(failedPayload)).body.order, true);
  });

  await t.test('simultaneous first orders share one customer and only one flyer', async () => {
    const payload = body('519-555-0112');
    const results = await Promise.all([
      call(payload, manual), call({ ...payload, customerPhone: '5195550112', orderSource: 'IOS_APP' })
    ]);
    assert.ok(results.every(res => res.code === 201));
    assert.equal(new Set(results.map(res => res.body.order.customerId)).size, 1);
    assert.equal(results.flatMap(res => res.body.order.items).filter(isFlyer).length, 1);
    assert.equal(await db.customer.count({ where: { normalizedPhone: '5195550112' } }), 1);
  });

  await t.test('pre-created customers qualify, but legacy duplicate profiles with history do not', async () => {
    const customerData = phone => ({ fullName: 'Synthetic', normalizedFullName: 'synthetic', phone,
      normalizedPhone: phone, addressLine1: '1 Synthetic Street', city: 'Guelph', province: 'ON' });
    const existing = await db.customer.create({ data: customerData('5195550113') });
    const first = (await call(body('5195550113'))).body.order;
    assert.equal(first.customerId, existing.id);
    expectFlyer(first, true);
    await db.order.update({ where: { id: first.id }, data: { orderStatus: 'DELIVERED' } });
    const duplicate = await db.customer.create({ data: customerData('5195550113') });
    const { isFirstCustomerOrder } = require('../dist/services/welcomeFlyer.service');
    assert.equal(await isFirstCustomerOrder(db, duplicate.id, '5195550113'), false);
    expectFlyer((await call(body('5195550113'))).body.order, false);
  });

  await t.test('edits preserve the flyer after another order, enforce free quantity one and re-evaluate customer changes', async () => {
    const payload = body('5195550114');
    const first = (await call(payload)).body.order;
    await call(payload);
    const omitted = await call(payload, edit, first.id);
    assert.equal(omitted.code, 200);
    expectFlyer(omitted.body.order, true);
    const tampered = await call({ ...payload, items: [product, copiedFlyer, copiedFlyer] }, edit, first.id);
    expectFlyer(tampered.body.order, true);
    const emptyEdit = await call({ ...payload, items: [copiedFlyer] }, edit, first.id);
    assert.equal(emptyEdit.code, 400);
    expectFlyer(await db.order.findUniqueOrThrow({ where: { id: first.id }, include: { items: true } }), true);
    const returning = await call(body('5195550100'), edit, first.id);
    expectFlyer(returning.body.order, false);
    const newCustomer = await call(body('5195550115'), edit, first.id);
    expectFlyer(newCustomer.body.order, true);
  });

  await t.test('a copied system flyer alone cannot create an empty customer order', async () => {
    const before = await db.order.count();
    const res = await call(body('5195550116', { items: [copiedFlyer] }));
    assert.equal(res.code, 400);
    assert.equal(await db.order.count(), before);
  });
});
