-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "chat_id" BIGINT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" SERIAL NOT NULL,
    "departureCity" TEXT,
    "destinationCity" TEXT,
    "departureDate" TEXT,
    "returnDate" TEXT,
    "departureCityPromptId" TEXT,
    "userAnswerId" TEXT,
    "departureCityCode" TEXT,
    "destinationCityCode" TEXT,
    "destinationCityPromptId" TEXT,
    "departureDatePromptId" TEXT,
    "returnDatePromptId" TEXT,
    "multicitySearchData" TEXT,
    "bookingMarkdownId" BIGINT,
    "language" TEXT NOT NULL DEFAULT 'english',
    "one_way_search_state" BOOLEAN NOT NULL DEFAULT false,
    "return_search_state" BOOLEAN NOT NULL DEFAULT false,
    "multi_city_search_state" BOOLEAN NOT NULL DEFAULT false,
    "chat_id" BIGINT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "departureCity" TEXT,
    "destinationCity" TEXT,
    "departureDate" TEXT,
    "returnDate" TEXT,
    "departureCityPromptId" TEXT,
    "userAnswerId" TEXT,
    "departureCityCode" TEXT,
    "destinationCityCode" TEXT,
    "destinationCityPromptId" TEXT,
    "departureDatePromptId" TEXT,
    "returnDatePromptId" TEXT,
    "multicitySearchData" TEXT,
    "bookingMarkdownId" BIGINT,
    "language" TEXT NOT NULL DEFAULT 'english',
    "one_way_search_state" BOOLEAN NOT NULL DEFAULT false,
    "return_search_state" BOOLEAN NOT NULL DEFAULT false,
    "multi_city_search_state" BOOLEAN NOT NULL DEFAULT false,
    "chat_id" BIGINT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_chat_id_key" ON "User"("chat_id");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "User"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "User"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE;
