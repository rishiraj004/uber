-- AlterTable
ALTER TABLE "RiderProfile" ADD COLUMN     "emergencyContacts" TEXT;

-- CreateTable
CREATE TABLE "SOSAlert" (
    "id" SERIAL NOT NULL,
    "rideId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SOSAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideShareLink" (
    "id" SERIAL NOT NULL,
    "rideId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RideShareLink_token_key" ON "RideShareLink"("token");

-- AddForeignKey
ALTER TABLE "SOSAlert" ADD CONSTRAINT "SOSAlert_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOSAlert" ADD CONSTRAINT "SOSAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideShareLink" ADD CONSTRAINT "RideShareLink_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
