-- CreateEnum
CREATE TYPE "RideType" AS ENUM ('SOLO', 'SHARED');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COUNTERED', 'REJECTED', 'SELECTED');

-- AlterTable
ALTER TABLE "CaptainDocument" ADD COLUMN     "externalVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "externalVerifyStatus" TEXT,
ADD COLUMN     "extractedExpiry" TIMESTAMP(3),
ADD COLUMN     "extractedName" TEXT,
ADD COLUMN     "extractedNumber" TEXT,
ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "lastExternalCheck" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CaptainProfile" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "licenseExpiry" TIMESTAMP(3),
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "rcExpiry" TIMESTAMP(3),
ADD COLUMN     "rcNumber" TEXT;

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "availableSeats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "baseOfferPrice" DOUBLE PRECISION,
ADD COLUMN     "finalAgreedPrice" DOUBLE PRECISION,
ADD COLUMN     "isBiddingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentRideId" INTEGER,
ADD COLUMN     "rideType" "RideType" NOT NULL DEFAULT 'SOLO',
ADD COLUMN     "sharingDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RideBid" (
    "id" SERIAL NOT NULL,
    "rideId" INTEGER NOT NULL,
    "captainId" INTEGER NOT NULL,
    "offerAmount" DOUBLE PRECISION NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedArrival" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideBid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RideBid_rideId_captainId_key" ON "RideBid"("rideId", "captainId");

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_parentRideId_fkey" FOREIGN KEY ("parentRideId") REFERENCES "Ride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideBid" ADD CONSTRAINT "RideBid_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideBid" ADD CONSTRAINT "RideBid_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "CaptainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
