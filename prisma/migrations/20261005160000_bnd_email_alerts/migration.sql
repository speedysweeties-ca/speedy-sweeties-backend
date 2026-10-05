-- Separate notification receipts; no B&D customer details or Speedy orders.
CREATE TABLE "BndEmailAlert" (
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    CONSTRAINT "BndEmailAlert_pkey" PRIMARY KEY ("orderId")
);
