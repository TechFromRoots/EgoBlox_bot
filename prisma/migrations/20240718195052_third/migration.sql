/*
  Warnings:

  - You are about to drop the column `bookingMarkdownId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `departureCity` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `departureCityCode` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `departureCityPromptId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `departureDate` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `departureDatePromptId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `destinationCity` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `destinationCityCode` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `destinationCityPromptId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `multi_city_search_state` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `multicitySearchData` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `one_way_search_state` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `returnDate` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `returnDatePromptId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `return_search_state` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `userAnswerId` on the `Event` table. All the data in the column will be lost.
  - You are about to drop the column `departureCity` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `departureCityCode` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `departureCityPromptId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `departureDate` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `departureDatePromptId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `destinationCity` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `destinationCityCode` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `destinationCityPromptId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `language` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `multi_city_search_state` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `multicitySearchData` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `one_way_search_state` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `returnDate` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `returnDatePromptId` on the `Session` table. All the data in the column will be lost.
  - You are about to drop the column `return_search_state` on the `Session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Event" DROP COLUMN "bookingMarkdownId",
DROP COLUMN "departureCity",
DROP COLUMN "departureCityCode",
DROP COLUMN "departureCityPromptId",
DROP COLUMN "departureDate",
DROP COLUMN "departureDatePromptId",
DROP COLUMN "destinationCity",
DROP COLUMN "destinationCityCode",
DROP COLUMN "destinationCityPromptId",
DROP COLUMN "language",
DROP COLUMN "multi_city_search_state",
DROP COLUMN "multicitySearchData",
DROP COLUMN "one_way_search_state",
DROP COLUMN "returnDate",
DROP COLUMN "returnDatePromptId",
DROP COLUMN "return_search_state",
DROP COLUMN "userAnswerId",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "contacts" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "eventName" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "media" TEXT,
ADD COLUMN     "numberOfTickets" TEXT,
ADD COLUMN     "price" TEXT,
ADD COLUMN     "startDate" TEXT,
ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "walletAddress" TEXT;

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "departureCity",
DROP COLUMN "departureCityCode",
DROP COLUMN "departureCityPromptId",
DROP COLUMN "departureDate",
DROP COLUMN "departureDatePromptId",
DROP COLUMN "destinationCity",
DROP COLUMN "destinationCityCode",
DROP COLUMN "destinationCityPromptId",
DROP COLUMN "language",
DROP COLUMN "multi_city_search_state",
DROP COLUMN "multicitySearchData",
DROP COLUMN "one_way_search_state",
DROP COLUMN "returnDate",
DROP COLUMN "returnDatePromptId",
DROP COLUMN "return_search_state",
ADD COLUMN     "category" TEXT,
ADD COLUMN     "categoryPromptId" TEXT,
ADD COLUMN     "contactPromptId" TEXT,
ADD COLUMN     "contacts" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "descriptionPromptId" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emailPromptId" TEXT,
ADD COLUMN     "endDate" TEXT,
ADD COLUMN     "endDatePromptId" TEXT,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "endTimePromptId" TEXT,
ADD COLUMN     "eventName" TEXT,
ADD COLUMN     "eventNamePromptId" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "locationPromptId" TEXT,
ADD COLUMN     "media" TEXT,
ADD COLUMN     "mediaPromptId" TEXT,
ADD COLUMN     "numberOfTickets" TEXT,
ADD COLUMN     "numberOfTicketsPromptId" TEXT,
ADD COLUMN     "price" TEXT,
ADD COLUMN     "pricePromptId" TEXT,
ADD COLUMN     "startDate" TEXT,
ADD COLUMN     "startDatePromptId" TEXT,
ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "startTimePromptId" TEXT,
ADD COLUMN     "walletAddress" TEXT,
ADD COLUMN     "walletAddressPromptId" TEXT;
