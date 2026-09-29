-- CreateTable
CREATE TABLE "FaqAnalyticsEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "faqId" TEXT,
    "categoryId" TEXT,
    "groupId" TEXT,
    "productGid" TEXT,
    "collectionGid" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "FaqAnalyticsEvent_shop_eventType_occurredAt_idx" ON "FaqAnalyticsEvent"("shop", "eventType", "occurredAt");

-- CreateIndex
CREATE INDEX "FaqAnalyticsEvent_shop_faqId_occurredAt_idx" ON "FaqAnalyticsEvent"("shop", "faqId", "occurredAt");

-- CreateIndex
CREATE INDEX "FaqAnalyticsEvent_shop_categoryId_occurredAt_idx" ON "FaqAnalyticsEvent"("shop", "categoryId", "occurredAt");

-- CreateIndex
CREATE INDEX "FaqAnalyticsEvent_shop_groupId_occurredAt_idx" ON "FaqAnalyticsEvent"("shop", "groupId", "occurredAt");
