-- CreateEnum
CREATE TYPE "OrderPriority" AS ENUM ('NORMAL', 'HIGH');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "priority" "OrderPriority" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "Order_priority_idx" ON "Order"("priority");
