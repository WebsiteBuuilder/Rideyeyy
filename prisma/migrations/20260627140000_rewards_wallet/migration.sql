-- Rewards wallet: RESERVED status, optional codes, booking linkage, shop descriptions

ALTER TYPE "RedemptionStatus" ADD VALUE IF NOT EXISTS 'RESERVED';

ALTER TABLE "Redemption" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "Redemption" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Redemption_bookingId_key" ON "Redemption"("bookingId");
CREATE INDEX IF NOT EXISTS "Redemption_bookingId_idx" ON "Redemption"("bookingId");

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "redemptionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_redemptionId_key" ON "Booking"("redemptionId");

ALTER TABLE "ShopItem" ADD COLUMN IF NOT EXISTS "description" TEXT;
