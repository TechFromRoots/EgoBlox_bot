/*
  Warnings:

  - You are about to drop the column `bookingMarkdownId` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "bookingMarkdownId" BIGINT,
ADD COLUMN     "botPreviewMarkdownId" TEXT;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "bookingMarkdownId",
ADD COLUMN     "botPreviewMarkdownId" TEXT,
ADD COLUMN     "eventDetailMarkdownId" BIGINT;
