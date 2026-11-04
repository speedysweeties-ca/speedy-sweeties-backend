-- Seven aggregate totals, independent of customer/order data.
CREATE TABLE "PageViewCounter" (
    "page" TEXT NOT NULL,
    "views" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "PageViewCounter_pkey" PRIMARY KEY ("page"),
    CONSTRAINT "PageViewCounter_page_check" CHECK ("page" IN ('home', 'beer', 'alcohol', 'vapes', 'cannabis', 'convenience', 'drivers')),
    CONSTRAINT "PageViewCounter_views_check" CHECK ("views" >= 0)
);
