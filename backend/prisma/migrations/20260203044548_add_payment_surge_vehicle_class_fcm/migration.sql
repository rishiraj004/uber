-- CreateEnum
CREATE TYPE "VehicleClass" AS ENUM ('ECONOMY', 'COMFORT', 'PREMIUM', 'XL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "CaptainProfile" ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeAccountVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vehicleClass" "VehicleClass" NOT NULL DEFAULT 'ECONOMY',
ADD COLUMN     "walletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "surgeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "vehicleClass" "VehicleClass" NOT NULL DEFAULT 'ECONOMY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "fcmToken" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "rideId" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'inr',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "authorizedAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Withdrawal" (
    "id" SERIAL NOT NULL,
    "captainId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'inr',
    "stripeTransferId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_rideId_key" ON "Payment"("rideId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripePaymentIntentId_key" ON "Payment"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_stripeTransferId_key" ON "Withdrawal"("stripeTransferId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "Ride"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_captainId_fkey" FOREIGN KEY ("captainId") REFERENCES "CaptainProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
