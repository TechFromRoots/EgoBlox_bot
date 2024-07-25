/*
  Warnings:

  - You are about to drop the column `bookingMarkdownId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `botPreviewMarkdownId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `botPreviewMarkdownId` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "bookingMarkdownId",
DROP COLUMN "botPreviewMarkdownId",
ADD COLUMN     "eventDetailMarkdownId" BIGINT;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "botPreviewMarkdownId";
