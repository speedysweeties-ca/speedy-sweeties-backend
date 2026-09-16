-- Store apartment/unit and building-access details separately from the civic
-- street address so Google geocoding continues to receive only the address.
ALTER TABLE "Customer"
ADD COLUMN "unitNumber" TEXT,
ADD COLUMN "buzzCode" TEXT;

ALTER TABLE "Order"
ADD COLUMN "unitNumber" TEXT,
ADD COLUMN "buzzCode" TEXT;
