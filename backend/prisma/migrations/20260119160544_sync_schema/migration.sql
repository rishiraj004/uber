-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "estimatedDistance" DOUBLE PRECISION,
ADD COLUMN     "estimatedDuration" DOUBLE PRECISION,
ADD COLUMN     "routeGeometry" TEXT;

-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN     "homeAddressLat" DOUBLE PRECISION,
ADD COLUMN     "homeAddressLng" DOUBLE PRECISION,
ADD COLUMN     "workAddressLat" DOUBLE PRECISION,
ADD COLUMN     "workAddressLng" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "rideId" INTEGER NOT NULL,
    "senderId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptainDocument" (
    "id" SERIAL NOT NULL,
    "captainId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "CaptainDocument_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaptainDocument" ADD CONSTRAINT "CaptainDocument_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "CaptainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
