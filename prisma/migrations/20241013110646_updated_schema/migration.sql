/*
  Warnings:

  - You are about to drop the `Event` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SEND', 'AIRTIME', 'DATA', 'ELECTRICITY');

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_chat_id_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_chat_id_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "baseName" TEXT,
ADD COLUMN     "pin" TEXT,
ADD COLUMN     "walletAddress" TEXT,
ADD COLUMN     "walletDetails" TEXT;

-- DropTable
DROP TABLE "Event";

-- DropTable
DROP TABLE "Session";

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "hash" TEXT,
    "status" TEXT,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "chat_id" BIGINT NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "User"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;
