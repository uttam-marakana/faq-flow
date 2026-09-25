-- CreateTable
CREATE TABLE "FaqProduct" (
    "faqId" TEXT NOT NULL,
    "productGid" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("faqId", "productGid"),
    CONSTRAINT "FaqProduct_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "FAQ" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FaqCollection" (
    "faqId" TEXT NOT NULL,
    "collectionGid" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("faqId", "collectionGid"),
    CONSTRAINT "FaqCollection_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "FAQ" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FaqProduct_productGid_idx" ON "FaqProduct"("productGid");

-- CreateIndex
CREATE INDEX "FaqProduct_faqId_sortOrder_idx" ON "FaqProduct"("faqId", "sortOrder");

-- CreateIndex
CREATE INDEX "FaqCollection_collectionGid_idx" ON "FaqCollection"("collectionGid");

-- CreateIndex
CREATE INDEX "FaqCollection_faqId_sortOrder_idx" ON "FaqCollection"("faqId", "sortOrder");
