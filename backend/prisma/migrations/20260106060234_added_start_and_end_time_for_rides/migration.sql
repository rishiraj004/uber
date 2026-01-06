/*
  Warnings:

  - Added the required column `vehicleType` to the `Ride` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('BIKE', 'CAR', 'AUTO');

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3),
DROP COLUMN "vehicleType",
ADD COLUMN     "vehicleType" "VehicleType" NOT NULL;
