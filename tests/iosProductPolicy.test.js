const assert = require('node:assert/strict');
const test = require('node:test');
const policy = require('../dist/utils/iosProductPolicy');
const { prisma } = require('../dist/lib/prisma');
const { env } = require('../dist/config/env');
const drafts = require('../dist/services/aiOrderDraft.service');
const verification = require('../dist/services/productWebVerification.service');
const { createAiOrderDraftController } = require('../dist/controllers/aiOrderDraft.controller');

const replace = (t, object, key, value) => {
  const old = object[key]; object[key] = value; t.after(() => { object[key] = old; });
};

const restrictedError = e => e instanceof policy.IOSProductUnavailableError && e.statusCode === 400;
const catalog = (extra = {}) => ({ id: 'safe', name: 'Ginger Ale', normalizedName: 'ginger ale',
  brand: null, size: null, category: 'Convenience', source: null, pickupType: 'CONVENIENCE',
  popularityScore: 1, ...extra });
const model = (extra = {}) => ({ status: 'READY', assistantMessage: 'Please review.',
  clarificationQuestion: null, items: [{ requestedName: 'Ginger Ale', packageDescription: null,
    quantity: 1, confidence: 'HIGH' }], paymentMethod: null, additionalNotes: null, ...extra });
const mockModel = (t, result, inspect = () => {}) => {
  const oldKey = env.OPENAI_API_KEY;
  env.OPENAI_API_KEY = 'synthetic-only';
  t.after(() => { env.OPENAI_API_KEY = oldKey; });
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    inspect(JSON.parse(options.body));
    return { ok: true, json: async () => ({ output_text: JSON.stringify(result) }) };
  });
};

test('iOS recognizes product terms, Canadian brands and normalized spellings', () => {
  for (const value of ['cigarettes', 'TOBACCO', 'nicotine pouches', 'vaping pods',
    'zero nicotine vape', 'e-cigarette', 'e liquid', 'hookah', 'shisha', 'Du Maurier king size',
    "Player's Original", 'Canadian Classics', 'Belmont', 'Benson & Hedges', 'STLTH',
    'Zonnic', 'ZYN', 'VＡPE', 'vápé', 'va\u200bpe', 'rolling papers']) {
    assert.equal(policy.containsIOSRestrictedProduct(value), true, value);
  }
  for (const value of ['Crown Royal 750 mL', 'Molson Canadian', 'ginger ale', 'chips',
    'smoked almonds', 'smoke alarm batteries', 'DVD player', 'paper towels', 'ice',
    'Ring the bell. Please call when outside.']) {
    assert.equal(policy.containsIOSRestrictedProduct(value), false, value);
  }
});

test('iOS source and header select policy; other clients do not', () => {
  assert.equal(policy.isIOSCustomerRequest('IOS_APP'), true);
  assert.equal(policy.isIOSCustomerRequest(undefined, 'ios-customer'), true);
  for (const source of [undefined, 'ANDROID_APP', 'WEBFLOW', 'DISPATCHER_MANUAL']) {
    assert.equal(policy.isIOSCustomerRequest(source), false);
  }
});

test('iOS voice rejects transcript, history and cart before database or model', async t => {
  replace(t, prisma.itemCatalog, 'findMany', async () => { assert.fail('No catalogue query'); });
  t.mock.method(globalThis, 'fetch', async () => { assert.fail('No provider call'); });
  for (const body of [{ transcript: 'cigarettes' },
    { transcript: 'two', history: [{ role: 'user', content: 'vape' }] },
    { transcript: 'add ice', currentCart: [{ name: 'Belmont', quantity: 1 }] }]) {
    await assert.rejects(createAiOrderDraftController({ headers: { 'x-speedy-client': 'ios-customer' }, body }, {}), restrictedError);
  }
});

test('iOS uses metadata to refuse innocuously named restricted catalogue requests', async () => {
  await assert.rejects(drafts.createAiOrderDraft({ iosCustomer: true, transcript: 'Blue Ice', history: [],
    catalogItems: [catalog({ name: 'Blue Ice', category: 'TOBACCO' })] }), restrictedError);
});

test('iOS catalogue context excludes restricted items and keeps alcohol/convenience', async t => {
  const safe = catalog();
  const alcohol = catalog({ id: 'alcohol', name: 'Crown Royal', normalizedName: 'crown royal', category: 'Spirits', pickupType: 'LCBO' });
  const hidden = catalog({ id: 'restricted', name: 'Blue Ice', normalizedName: 'blue ice', category: 'VAPE', pickupType: 'VAPE' });
  let instructions;
  mockModel(t, model(), request => { instructions = request.instructions; });
  t.mock.method(verification, 'verifyAndPersistRequestedProducts', async (_names, iosCustomer) => {
    assert.equal(iosCustomer, true); return [];
  });
  const result = await drafts.createAiOrderDraft({ iosCustomer: true, transcript: 'ginger ale', history: [], catalogItems: [safe, alcohol, hidden] });
  assert.equal(result.draft.items[0].catalogMatch.id, 'safe');
  assert.ok(instructions.includes('Ginger Ale'));
  assert.ok(instructions.includes('Crown Royal'));
  assert.equal(instructions.includes('Blue Ice'), false);
  assert.ok(instructions.includes('IOS CUSTOMER PRODUCT AVAILABILITY'));
});

test('iOS rejects restricted model products, notes and clarification before web lookup', async t => {
  t.mock.method(verification, 'verifyAndPersistRequestedProducts', async () => assert.fail('No product lookup'));
  for (const output of [model({ items: [{ requestedName: 'STLTH', packageDescription: null, quantity: 1, confidence: 'HIGH' }] }),
    model({ additionalNotes: 'Also buy cigarettes' }), model({ status: 'NEEDS_CLARIFICATION', clarificationQuestion: 'Which vape?' })]) {
    mockModel(t, output);
    await assert.rejects(drafts.createAiOrderDraft({ iosCustomer: true, transcript: 'ice', history: [], catalogItems: [] }), restrictedError);
  }
});

test('iOS rejects restricted verified products before any catalogue access/write', async t => {
  replace(t, prisma.itemCatalog, 'findUnique', async () => assert.fail('No catalogue access'));
  await assert.rejects(verification.persistWebVerifiedCatalogItem(catalog({ name: 'Blue Ice', category: 'VAPE' }), true), restrictedError);
});

test('iOS checks an existing verified URL classification before reusing it', async t => {
  replace(t, prisma.itemCatalog, 'findUnique', async () => catalog({ name: 'Blue Ice', category: 'TOBACCO' }));
  replace(t, prisma.itemCatalog, 'update', async () => assert.fail('No catalogue write'));
  await assert.rejects(verification.persistWebVerifiedCatalogItem(catalog({ name: 'Blue Ice' }), true), restrictedError);
});

test('non-iOS voice continues to receive the existing catalogue and instructions', async t => {
  const item = catalog({ name: 'STLTH', category: 'VAPE', pickupType: 'VAPE' });
  let instructions;
  mockModel(t, model({ items: [{ requestedName: 'STLTH', packageDescription: null, quantity: 1, confidence: 'HIGH' }] }), request => { instructions = request.instructions; });
  t.mock.method(verification, 'verifyAndPersistRequestedProducts', async (_names, iosCustomer) => {
    assert.equal(iosCustomer, false); return [];
  });
  const result = await drafts.createAiOrderDraft({ transcript: 'STLTH', history: [], catalogItems: [item] });
  assert.equal(result.draft.items[0].catalogMatch.name, 'STLTH');
  assert.equal(instructions.includes('IOS CUSTOMER PRODUCT AVAILABILITY'), false);
});

test('ordinary and protected iOS order routes reject products/notes before geocoding or writes', async t => {
  const business = require('../dist/controllers/business.controller');
  const safety = require('../dist/services/syntheticOrderSafety.service');
  const geocoding = require('../dist/services/deliveryGeocoding.service');
  const { createOrderController, createSyntheticOrderController } = require('../dist/controllers/order.controller');
  t.mock.method(business, 'isBusinessConfirmedClosed', async () => false);
  t.mock.method(safety, 'precheckSyntheticOrder', async () => {});
  t.mock.method(geocoding, 'geocodeDeliveryAddress', async () => assert.fail('No geocoding'));
  replace(t, prisma, '$transaction', async () => assert.fail('No transaction'));
  for (const controller of [createOrderController, createSyntheticOrderController]) {
    for (const body of [{ items: [{ name: 'cigarettes' }] },
      { items: [{ name: 'ice' }], additionalNotes: 'add Zonnic' },
      { items: [{ name: 'ice' }], deliveryInstructions: 'bring a vape' }]) {
      await assert.rejects(controller({ headers: {}, body: { orderSource: 'IOS_APP', ...body } }, {}), restrictedError);
    }
  }
});

test('Android order validation is not changed by the iOS product check', async t => {
  const business = require('../dist/controllers/business.controller');
  const safety = require('../dist/services/syntheticOrderSafety.service');
  const geocoding = require('../dist/services/deliveryGeocoding.service');
  const { createOrderController } = require('../dist/controllers/order.controller');
  t.mock.method(business, 'isBusinessConfirmedClosed', async () => false);
  t.mock.method(safety, 'precheckSyntheticOrder', async () => {});
  const reachedAddress = new Error('Existing address flow reached');
  t.mock.method(geocoding, 'geocodeDeliveryAddress', async () => { throw reachedAddress; });
  await assert.rejects(createOrderController({ headers: {}, body: { orderSource: 'ANDROID_APP', items: [{ name: 'cigarettes' }] } }, {}), error => error === reachedAddress);
});


test('iOS does not accept a model-supplied neutral name from the excluded catalogue', async t => {
  mockModel(t, model({ items: [{ requestedName: 'Blue Ice', packageDescription: '20 mg', quantity: 1, confidence: 'HIGH' }] }));
  t.mock.method(verification, 'verifyAndPersistRequestedProducts', async () => assert.fail('No lookup'));
  await assert.rejects(drafts.createAiOrderDraft({ iosCustomer: true, transcript: 'ice', history: [],
    catalogItems: [catalog({ name: 'Blue Ice', category: 'VAPE', pickupType: 'VAPE' })] }), restrictedError);
});

test('iOS typed neutral catalogue names with sizes are refused before geocoding', async t => {
  const business = require('../dist/controllers/business.controller');
  const geocoding = require('../dist/services/deliveryGeocoding.service');
  const { createOrderController } = require('../dist/controllers/order.controller');
  t.mock.method(business, 'isBusinessConfirmedClosed', async () => false);
  t.mock.method(geocoding, 'geocodeDeliveryAddress', async () => assert.fail('No geocoding'));
  replace(t, prisma.itemCatalog, 'findMany', async () => [catalog({ name: 'Blue Ice', category: 'VAPE' })]);
  await assert.rejects(createOrderController({ headers: {}, body: { orderSource: 'IOS_APP',
    items: [{ name: 'Blue Ice 20 mg', quantity: 1 }] } }, {}), restrictedError);
});
