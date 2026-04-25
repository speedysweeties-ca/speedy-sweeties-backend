-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "itemCatalogId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedFullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "normalizedPhone" TEXT NOT NULL,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "addressLine1" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "size" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_normalizedPhone_idx" ON "Customer"("normalizedPhone");

-- CreateIndex
CREATE INDEX "Customer_normalizedFullName_idx" ON "Customer"("normalizedFullName");

-- CreateIndex
CREATE INDEX "Customer_normalizedEmail_idx" ON "Customer"("normalizedEmail");

-- CreateIndex
CREATE INDEX "Customer_city_idx" ON "Customer"("city");

-- CreateIndex
CREATE INDEX "ItemCatalog_normalizedName_idx" ON "ItemCatalog"("normalizedName");

-- CreateIndex
CREATE INDEX "ItemCatalog_brand_idx" ON "ItemCatalog"("brand");

-- CreateIndex
CREATE INDEX "ItemCatalog_category_idx" ON "ItemCatalog"("category");

-- CreateIndex
CREATE INDEX "ItemCatalog_isActive_idx" ON "ItemCatalog"("isActive");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_itemCatalogId_idx" ON "OrderItem"("itemCatalogId");

-- CreateIndex
CREATE INDEX "OrderItem_name_idx" ON "OrderItem"("name");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_itemCatalogId_fkey" FOREIGN KEY ("itemCatalogId") REFERENCES "ItemCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
