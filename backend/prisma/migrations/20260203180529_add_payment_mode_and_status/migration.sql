-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'IN_APP');

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "paymentCollectedAt" TIMESTAMP(3),
ADD COLUMN     "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING';
