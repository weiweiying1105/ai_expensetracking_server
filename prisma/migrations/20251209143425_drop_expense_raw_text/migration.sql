/*
  Warnings:

  - You are about to drop the column `aiConfidence` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `aiMerchant` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `aiReasoning` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `aiTags` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `aiUsage` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `currency` on the `expenses` table. All the data in the column will be lost.
  - You are about to drop the column `rawText` on the `expenses` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "expenses" DROP COLUMN "aiConfidence",
DROP COLUMN "aiMerchant",
DROP COLUMN "aiReasoning",
DROP COLUMN "aiTags",
DROP COLUMN "aiUsage",
DROP COLUMN "currency",
DROP COLUMN "rawText";

-- CreateIndex
CREATE INDEX "categories_type_idx" ON "categories"("type");

-- CreateIndex
CREATE INDEX "expenses_userId_date_idx" ON "expenses"("userId", "date");
