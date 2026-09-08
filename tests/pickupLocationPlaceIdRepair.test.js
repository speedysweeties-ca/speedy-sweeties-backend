const assert = require("node:assert/strict");
const test = require("node:test");

const {
  selectExactClairBeerStoreCandidate
} = require("../dist/services/pickupLocationPlaceIdRepair.service.js");

const latitude = 43.5017248;
const longitude = -80.1865136;

test("Clair Beer Store repair accepts one exact nearby Beer Store candidate", () => {
  const candidate = selectExactClairBeerStoreCandidate(latitude, longitude, [
    {
      id: "correct-place-id",
      displayName: { text: "Beer Store 4009" },
      formattedAddress: "63 Clair Rd E, Guelph, ON N1L 0J7, Canada",
      location: { latitude: 43.50173, longitude: -80.18652 }
    },
    {
      id: "wrong-store",
      displayName: { text: "LCBO" },
      formattedAddress: "50 Clair Rd E, Guelph, ON, Canada",
      location: { latitude: 43.502, longitude: -80.187 }
    }
  ]);

  assert.equal(candidate?.id, "correct-place-id");
});

test("Clair Beer Store repair rejects a Beer Store at the wrong civic address", () => {
  const candidate = selectExactClairBeerStoreCandidate(latitude, longitude, [
    {
      id: "wrong-address",
      displayName: { text: "The Beer Store" },
      formattedAddress: "710 Woolwich St, Guelph, ON, Canada",
      location: { latitude: 43.50173, longitude: -80.18652 }
    }
  ]);

  assert.equal(candidate, null);
});

test("Clair Beer Store repair refuses ambiguous exact matches", () => {
  const candidate = selectExactClairBeerStoreCandidate(latitude, longitude, [
    {
      id: "candidate-one",
      displayName: { text: "Beer Store 4009" },
      formattedAddress: "63 Clair Rd E, Guelph, ON, Canada",
      location: { latitude: 43.50173, longitude: -80.18652 }
    },
    {
      id: "candidate-two",
      displayName: { text: "The Beer Store" },
      formattedAddress: "63 Clair Road East, Guelph, Ontario, Canada",
      location: { latitude: 43.50174, longitude: -80.1865 }
    }
  ]);

  assert.equal(candidate, null);
});
