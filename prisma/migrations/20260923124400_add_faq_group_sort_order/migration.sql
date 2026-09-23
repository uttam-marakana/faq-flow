-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FaqGroup" (
    "faqId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY ("faqId", "groupId"),
    CONSTRAINT "FaqGroup_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "FAQ" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FaqGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_FaqGroup" ("faqId", "groupId") SELECT "faqId", "groupId" FROM "FaqGroup";
DROP TABLE "FaqGroup";
ALTER TABLE "new_FaqGroup" RENAME TO "FaqGroup";
CREATE INDEX "FaqGroup_groupId_sortOrder_idx" ON "FaqGroup"("groupId", "sortOrder");
CREATE INDEX "FaqGroup_faqId_idx" ON "FaqGroup"("faqId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
