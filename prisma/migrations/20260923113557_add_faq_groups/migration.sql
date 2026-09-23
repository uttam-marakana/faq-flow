-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FaqGroup" (
    "faqId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    PRIMARY KEY ("faqId", "groupId"),
    CONSTRAINT "FaqGroup_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "FAQ" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FaqGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Group_shop_idx" ON "Group"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Group_shop_slug_key" ON "Group"("shop", "slug");

-- CreateIndex
CREATE INDEX "FaqGroup_groupId_idx" ON "FaqGroup"("groupId");

-- CreateIndex
CREATE INDEX "FaqGroup_faqId_idx" ON "FaqGroup"("faqId");
