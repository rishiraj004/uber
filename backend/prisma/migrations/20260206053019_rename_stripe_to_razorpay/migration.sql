/*
  Renaming Stripe fields to Razorpay for consistent naming.
  Using RENAME COLUMN to preserve existing data.
*/

-- Drop old unique indexes first
DROP INDEX IF EXISTS "Payment_stripePaymentIntentId_key";
DROP INDEX IF EXISTS "Withdrawal_stripeTransferId_key";

-- Rename columns in CaptainProfile
ALTER TABLE "CaptainProfile" RENAME COLUMN "stripeAccountId" TO "razorpayAccountId";
ALTER TABLE "CaptainProfile" RENAME COLUMN "stripeAccountVerified" TO "razorpayAccountVerified";

-- Rename columns in Payment
ALTER TABLE "Payment" RENAME COLUMN "stripeCustomerId" TO "razorpayCustomerId";
ALTER TABLE "Payment" RENAME COLUMN "stripePaymentIntentId" TO "razorpayPaymentId";

-- Rename column in User
ALTER TABLE "User" RENAME COLUMN "stripeCustomerId" TO "razorpayCustomerId";

-- Rename column in Withdrawal
ALTER TABLE "Withdrawal" RENAME COLUMN "stripeTransferId" TO "razorpayTransferId";

-- Create new unique indexes
CREATE UNIQUE INDEX "Payment_razorpayPaymentId_key" ON "Payment"("razorpayPaymentId");
CREATE UNIQUE INDEX "Withdrawal_razorpayTransferId_key" ON "Withdrawal"("razorpayTransferId");
