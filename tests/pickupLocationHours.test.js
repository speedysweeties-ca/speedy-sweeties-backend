const replaceForTest = (t, target, key, value) => { const original = target[key]; target[key] = value; t.after(() => { target[key] = original; }); };
const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CURRENT_HOURS_REFRESH_MS,
  REGULAR_HOURS_REFRESH_MS,
  isHoursRefreshDue,
  selectBestPlaceCandidate
} = require("../dist/services/pickupLocationHours.service.js");

const location = {
  name: "The Beer Store - Municipal",
  addressLine1: "710 Woolwich St",
  latitude: 43.5625,
  longitude: -80.2670
};

test("regular hours are due every 7 days in the same request as current hours", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(isHoursRefreshDue(null, REGULAR_HOURS_REFRESH_MS, now), true);
  assert.equal(
    isHoursRefreshDue(new Date("2026-09-02T12:00:00.000Z"), REGULAR_HOURS_REFRESH_MS, now),
    false
  );
  assert.equal(
    isHoursRefreshDue(new Date("2026-09-01T12:00:00.000Z"), REGULAR_HOURS_REFRESH_MS, now),
    true
  );
});

test("current hours are due every 7 days", () => {
  const now = new Date("2026-09-08T12:00:00.000Z");
  assert.equal(
    isHoursRefreshDue(new Date("2026-09-02T12:00:00.000Z"), CURRENT_HOURS_REFRESH_MS, now),
    false
  );
  assert.equal(
    isHoursRefreshDue(new Date("2026-09-01T12:00:00.000Z"), CURRENT_HOURS_REFRESH_MS, now),
    true
  );
});

test("place matching prefers the nearby business with the matching name and address", () => {
  const match = selectBestPlaceCandidate(location, [
    {
      id: "wrong-business",
      displayName: { text: "Municipal Variety" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.56251, longitude: -80.26701 }
    },
    {
      id: "beer-store",
      displayName: { text: "The Beer Store" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.56254, longitude: -80.26705 }
    }
  ]);

  assert.equal(match?.id, "beer-store");
});

test("place matching rejects a candidate at a different civic number", () => {
  const match = selectBestPlaceCandidate(location, [
    {
      id: "wrong-address",
      displayName: { text: "The Beer Store" },
      formattedAddress: "800 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.56252, longitude: -80.26702 }
    }
  ]);

  assert.equal(match, null);
});

test("place matching rejects an otherwise similar result that is too far away", () => {
  const match = selectBestPlaceCandidate(location, [
    {
      id: "far-away",
      displayName: { text: "The Beer Store" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.57, longitude: -80.27 }
    }
  ]);

  assert.equal(match, null);
});

const { prisma } = require('../dist/lib/prisma');
const { env } = require('../dist/config/env');
const { refreshPickupLocationHours } = require('../dist/services/pickupLocationHours.service');

test('weekly full-hours refresh claims once across concurrent runs, failures, restarts and forced calls', async t => {
  const oldKey = env.GOOGLE_PLACES_API_KEY; env.GOOGLE_PLACES_API_KEY = 'synthetic-only';
  t.after(()=>{env.GOOGLE_PLACES_API_KEY=oldKey;});
  const row = { ...location, id:'synthetic-store', googlePlaceId:'synthetic-place',
    city:'Guelph',province:'ON',pickupType:'BEER',postalCode:null,
    hoursLastCheckedAt:null,regularHoursUpdatedAt:null,currentHoursUpdatedAt:null };
  let calls = 0, fail = false;
  replaceForTest(t, prisma.pickupLocation,'findMany',async()=>[{...row}]);
  replaceForTest(t, prisma.pickupLocation,'updateMany',async ({where,data})=>{
    if (row.hoursLastCheckedAt?.getTime() !== where.hoursLastCheckedAt?.getTime()) return {count:0};
    Object.assign(row,data); return {count:1};
  });
  replaceForTest(t, prisma.pickupLocation,'update',async({data})=>{Object.assign(row,data);return row;});
  replaceForTest(t, global,'fetch',async()=>{
    calls++;if(fail)throw new Error('synthetic failure');
    return {ok:true,json:async()=>({id:'synthetic-place',regularOpeningHours:{periods:[]},currentOpeningHours:{periods:[]}})};
  });
  const start = new Date('2026-11-03T08:00:00Z');
  await Promise.all(Array.from({length:10},()=>refreshPickupLocationHours({now:start})));
  assert.equal(calls,1);
  assert.equal(row.regularHoursUpdatedAt.getTime(), start.getTime());
  assert.equal(row.currentHoursUpdatedAt.getTime(), start.getTime());
  await refreshPickupLocationHours({now:new Date('2026-11-04T08:00:00Z'),forceRegular:true,forceCurrent:true});
  await refreshPickupLocationHours({now:new Date('2026-11-10T07:59:59Z')});
  assert.equal(calls,1);
  fail=true;
  await refreshPickupLocationHours({now:new Date('2026-11-10T08:00:00Z')});
  await refreshPickupLocationHours({now:new Date('2026-11-11T08:00:00Z')});
  assert.equal(calls,2);
  assert.equal(row.regularHoursUpdatedAt.getTime(), start.getTime());
  await refreshPickupLocationHours({now:new Date('2026-11-17T08:00:00Z')});
  assert.equal(calls,3);
});
