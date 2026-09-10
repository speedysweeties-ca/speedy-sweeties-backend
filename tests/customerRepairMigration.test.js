const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const migrationPath =
  "prisma/migrations/20260910174000_repair_placeholder_customer_links/migration.sql";
const migration = fs.readFileSync(migrationPath, "utf8");

test("placeholder customer repair is transactional and preserves recovery snapshots", () => {
  assert.match(migration, /^BEGIN;/);
  assert.match(migration, /COMMIT;\s*$/);
  assert.match(
    migration,
    /repair:placeholder-customer-20260910:orders/
  );
  assert.match(
    migration,
    /repair:placeholder-customer-20260910:customers/
  );
  assert.match(
    migration,
    /repair:placeholder-customer-20260910:mapping/
  );
  assert.match(migration, /ON CONFLICT \("key"\) DO NOTHING/);
});

test("placeholder customer repair fails closed when its live-data assumptions change", () => {
  assert.match(migration, /affected_count <> 55/);
  assert.match(migration, /phone_count <> 37/);
  assert.match(migration, /expected 55 affected orders/);
  assert.match(migration, /expected 37 phone groups/);
  assert.match(migration, /HAVING COUNT\(c\.id\) > 1/);
});

test("placeholder customer repair maps profiles by normalized phone and verifies loyalty", () => {
  assert.match(
    migration,
    /existing_customer\."normalizedPhone" = affected_phones\.phone_digits/
  );
  assert.match(
    migration,
    /c\."normalizedPhone" = a\.phone_digits/
  );
  assert.match(migration, /"loyaltyCompletedOrders" < 0/);
  assert.match(
    migration,
    /"loyaltyRewardsUsed" > c\."loyaltyRewardsEarned"/
  );
});
