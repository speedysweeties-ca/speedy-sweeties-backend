CREATE TABLE "CustomerAddress" (
 "id" TEXT NOT NULL PRIMARY KEY, "customerId" TEXT NOT NULL,
 "label" TEXT NOT NULL, "addressLine1" TEXT NOT NULL,
 "unitNumber" TEXT, "buzzCode" TEXT, "city" TEXT NOT NULL,
 "province" TEXT NOT NULL, "isDefault" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");
CREATE UNIQUE INDEX "CustomerAddress_one_default" ON "CustomerAddress"("customerId") WHERE "isDefault";
-- Preserve each current profile address without guessing Home/Work labels or historical consent.
INSERT INTO "CustomerAddress" ("id", "customerId", "label", "addressLine1", "unitNumber", "buzzCode", "city", "province", "isDefault", "createdAt", "updatedAt")
SELECT 'initial-' || "id", "id", 'Address 1', "addressLine1", "unitNumber", "buzzCode", "city", "province", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Customer" WHERE length(trim("addressLine1")) > 0;
