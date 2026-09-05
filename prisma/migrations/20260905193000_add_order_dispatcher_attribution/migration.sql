-- Record how an order was dispatched and, for manual dispatches, which staff user did it.
-- Existing history remains nullable so it is displayed as "Not recorded" instead of guessed.
CREATE TYPE "DispatchSource" AS ENUM ('MANUAL', 'AUTO', 'DRIVER');

ALTER TABLE "Order"
ADD COLUMN "dispatchedByUserId" TEXT,
ADD COLUMN "dispatchSource" "DispatchSource";

CREATE INDEX "Order_dispatchedByUserId_idx"
ON "Order"("dispatchedByUserId");

ALTER TABLE "Order"
ADD CONSTRAINT "Order_dispatchedByUserId_fkey"
FOREIGN KEY ("dispatchedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
