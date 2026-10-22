const test = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/reliability_test';
process.env.JWT_SECRET = 'test-only-reliability';
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{}';
const { createDriverAssignmentNotifier, safeMessagingErrorCode, sendDriverAssignmentNotification } = require('../dist/services/driverAssignmentNotification.service');
const { createReadinessProbe, getReadiness } = require('../dist/services/readiness.service');
const { safeRouteTemplate, requestDiagnostics, logServerError } = require('../dist/middleware/requestDiagnostics');
const { messaging } = require('../dist/config/firebase');
const { prisma } = require('../dist/lib/prisma');

const input = { orderId:'order-fixture', driverId:'driver-fixture', token:'private-token', orderNumber:12, customerName:'Private Customer', addressLine1:'Private Address', city:'Guelph', pickupSummary:'Pickup fixture' };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const events = [], messages = [], cleared = [], scheduled = [];
  const api = createDriverAssignmentNotifier({
    send: async m => { messages.push(m); },
    clearInvalidToken: async (...args) => { cleared.push(args); },
    stillNeedsNotification: async () => true,
    log: e => events.push(e), now: () => 100000, random: () => 0,
    schedule: (callback, delay) => { const task = {callback, delay, cancelled:false}; scheduled.push(task); return () => { task.cancelled=true; }; },
    ...overrides
  });
  return { ...api, events, messages, cleared, scheduled };
}

test('driver pushes preserve app contract and log no personal data or tokens', async () => {
  const f=fixture(); await f.notify(input);
  assert.equal(f.messages[0].data.type,'DRIVER_ORDER_ASSIGNED');
  assert.equal(f.messages[0].data.orderNumber,'12');
  assert.equal(f.messages[0].android.notification.channelId,'speedy_sweeties_driver_orders');
  assert.equal(f.messages[0].apns.payload.aps.sound,'default');
  assert.equal(f.events[0].outcome,'provider_accepted');
  for (const secret of [input.token,input.customerName,input.addressLine1,input.orderId,input.driverId]) assert.ok(!JSON.stringify(f.events).includes(secret));
});

test('only explicit permanently invalid token codes trigger cleanup', async () => {
  for (const code of ['messaging/registration-token-not-registered','messaging/invalid-registration-token','messaging/invalid-argument','messaging/invalid-apns-credentials','messaging/mismatched-credential','app/network-timeout','messaging/device-message-rate-exceeded']) {
    const f=fixture({send:async()=>{throw Object.assign(new Error('private-token Private Address'),{code});}});
    await f.notify(input);
    assert.equal(f.cleared.length, code.includes('registration-token') ? 1 : 0);
    assert.equal(f.scheduled.length,0);
    assert.ok(!JSON.stringify(f.events).includes('Private Address'));
  }
  assert.equal(safeMessagingErrorCode({code:'private-secret'}),'unclassified');
});

test('transient failure receives just one delayed retry with the same correlation ID', async () => {
  let attempts=0;
  const f=fixture({send:async()=>{attempts++;throw {code:'messaging/server-unavailable'};}});
  await f.notify(input); assert.equal(attempts,1); assert.equal(f.scheduled[0].delay,60000);
  f.scheduled[0].callback(); await flush();
  assert.equal(attempts,2); assert.equal(f.scheduled.length,1);
  assert.equal(new Set(f.events.map(e=>e.correlationId)).size,1);
});

test('Retry-After is honored; overly delayed retries are abandoned', async () => {
  for (const [value,expected] of [['90',90000],['Thu, 01 Jan 1970 00:03:10 GMT',90000],['600',null]]) {
    const f=fixture({send:async()=>{throw {code:'messaging/server-unavailable',httpResponse:{headers:{'retry-after':value}}};}});
    await f.notify(input); assert.equal(f.scheduled[0]?.delay ?? null,expected);
  }
});

test('retry is skipped after opening, reassignment, token change, or foreground return', async () => {
  let attempts=0;
  const f=fixture({send:async()=>{attempts++;throw {code:'messaging/internal-error'};},stillNeedsNotification:async()=>false});
  await f.notify(input); f.scheduled[0].callback(); await flush();
  assert.equal(attempts,1); assert.equal(f.events.at(-1).outcome,'retry_no_longer_needed');
});

test('shutdown cancels retries; cleanup/validation failures never reject assignment notification', async () => {
  const f=fixture({send:async()=>{throw {code:'messaging/internal-error'};}});
  await f.notify(input); f.stop(); assert.equal(f.scheduled[0].cancelled,true);
  const bad=fixture({send:async()=>{throw {code:'messaging/registration-token-not-registered'};},clearInvalidToken:async()=>{throw new Error('private database details');}});
  await assert.doesNotReject(bad.notify(input)); assert.equal(bad.events.at(-1).outcome,'token_cleanup_failed');
});

test('production token cleanup compares driver AND rejected token to protect concurrent rotation', async t => {
  t.mock.method(messaging,'send',async()=>{throw {code:'messaging/registration-token-not-registered'};});
  t.mock.method(console,'error',()=>{});t.mock.method(console,'log',()=>{});
  let where;
  const original=prisma.user.updateMany; t.after(()=>{prisma.user.updateMany=original;});
  prisma.user.updateMany=async args=>{where=args.where;assert.deepEqual(args.data,{driverFcmToken:null});return {count:0};};
  await sendDriverAssignmentNotification(input);
  assert.deepEqual(where,{id:input.driverId,driverFcmToken:input.token});
});

test('readiness coalesces concurrent requests and briefly caches the result', async () => {
  let calls=0,clock=0,complete;
  const probe=createReadinessProbe({checkDatabase:()=>{calls++;return new Promise(r=>{complete=r;});},now:()=>clock,cacheMs:10,timeoutMs:50});
  const a=probe(),b=probe();await flush();assert.equal(calls,1);complete();
  assert.deepEqual(await a,{ready:true,database:'ok'});assert.deepEqual(await b,await a);
  await probe();assert.equal(calls,1);
  clock=11;const c=probe();await flush();assert.equal(calls,2);complete();await c;
});

test('readiness reports a database error and recovers on the next uncached check', async () => {
  let fail=true;
  const probe=createReadinessProbe({cacheMs:0,checkDatabase:async()=>{if(fail)throw new Error('private db');}});
  assert.deepEqual(await probe(),{ready:false,database:'unavailable'});fail=false;
  assert.deepEqual(await probe(),{ready:true,database:'ok'});
});

test('hung database checks return promptly without building a queue of probes', async () => {
  let calls=0,complete;
  const probe=createReadinessProbe({cacheMs:0,timeoutMs:10,checkDatabase:()=>{calls++;return new Promise(r=>{complete=r;});}});
  assert.deepEqual(await probe(),{ready:false,database:'timeout'});
  assert.deepEqual(await probe(),{ready:false,database:'timeout'});assert.equal(calls,1);
  complete();await flush();
});

test('readiness HTTP response is 503 with no-store and no private database error', async t => {
  const original=prisma.$queryRaw; t.after(()=>{prisma.$queryRaw=original;});
  prisma.$queryRaw=async()=>{throw new Error('private-db-host password');};
  t.mock.method(console,'error',()=>{});
  const res={headers:{},set(k,v){this.headers[k]=v;return this;},status(c){this.code=c;return this;},json(b){this.body=b;return this;}};
  await getReadiness({},res);
  assert.equal(res.code,503);assert.equal(res.body.success,false);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Retry-After'],'5');
  assert.ok(!JSON.stringify(res.body).includes('private-db'));
});

test('request diagnostics use route templates and generated IDs, never tracking URLs', t => {
  const req={method:'GET',baseUrl:'/api/v1/orders',route:{path:'/track-token/:token'},url:'/track-token/private-token?secret=private',params:{token:'private-token'},headers:{'x-request-id':'private-token'}};
  assert.equal(safeRouteTemplate(req),'/api/v1/orders/track-token/:token');
  assert.equal(safeRouteTemplate({...req,baseUrl:'/private-token'}),'/track-token/:token');
  const res={locals:{},set(k,v){this[k]=v;}};let next=0;requestDiagnostics(req,res,()=>next++);
  assert.equal(next,1);assert.match(res.locals.requestId,/^[0-9a-f-]{36}$/);
  const logs=[];t.mock.method(console,'error',v=>logs.push(v));
  logServerError(Object.assign(new Error('private-token'),{code:'secret-code'}),req,res);
  assert.ok(!logs[0].includes('private-token'));assert.ok(!logs[0].includes('secret-code'));assert.ok(logs[0].includes('/track-token/:token'));
});
