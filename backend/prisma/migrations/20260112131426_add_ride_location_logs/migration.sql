-- CreateTable
CREATE TABLE "RideLocationLog" (
    "id" SERIAL NOT NULL,
    "rideId" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideLocationLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RideLocationLog" ADD CONSTRAINT "RideLocationLog_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
