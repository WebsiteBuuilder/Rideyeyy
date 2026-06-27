-- Idempotent bootstrap for the GUHDRIDES booking system.
-- Safe to run on every deploy: only ADDS objects (IF NOT EXISTS / guarded),
-- never drops or alters existing tables. Avoids Prisma P3005 (non-empty schema
-- without migration history) by applying raw SQL via `prisma db execute`.

-- Enums (CREATE TYPE has no IF NOT EXISTS, so guard against duplicate_object)
DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ServiceType" AS ENUM ('RIDE', 'COURIER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "VehicleType" AS ENUM ('REGULAR', 'COMFORT', 'XL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Booking" (
    "id" TEXT NOT NULL,
    "bookingNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "vehicleType" "VehicleType",
    "pickup" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "rating" INTEGER,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BookingSequence" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BookingSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProviderStats" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "claims" INTEGER NOT NULL DEFAULT 0,
    "completed" INTEGER NOT NULL DEFAULT 0,
    "cancelled" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderStats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Vouch" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vouch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Blacklist" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Blacklist_pkey" PRIMARY KEY ("id")
);

-- Additive column migrations (idempotent)
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "preferredName" TEXT;

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_key" ON "User"("discordId");
CREATE INDEX IF NOT EXISTS "User_discordId_idx" ON "User"("discordId");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_bookingNumber_key" ON "Booking"("bookingNumber");
CREATE INDEX IF NOT EXISTS "Booking_customerId_idx" ON "Booking"("customerId");
CREATE INDEX IF NOT EXISTS "Booking_providerId_idx" ON "Booking"("providerId");
CREATE INDEX IF NOT EXISTS "Booking_status_idx" ON "Booking"("status");
CREATE INDEX IF NOT EXISTS "Booking_customerId_status_idx" ON "Booking"("customerId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderStats_discordId_key" ON "ProviderStats"("discordId");
CREATE INDEX IF NOT EXISTS "ProviderStats_discordId_idx" ON "ProviderStats"("discordId");
CREATE INDEX IF NOT EXISTS "ProviderStats_completed_idx" ON "ProviderStats"("completed");
CREATE INDEX IF NOT EXISTS "ProviderStats_revenue_idx" ON "ProviderStats"("revenue");
CREATE UNIQUE INDEX IF NOT EXISTS "Vouch_bookingId_key" ON "Vouch"("bookingId");
CREATE INDEX IF NOT EXISTS "Vouch_providerId_idx" ON "Vouch"("providerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Blacklist_discordId_key" ON "Blacklist"("discordId");
CREATE INDEX IF NOT EXISTS "Blacklist_discordId_idx" ON "Blacklist"("discordId");

-- Foreign keys (ADD CONSTRAINT has no IF NOT EXISTS, so guard against duplicate_object)
DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("discordId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("discordId") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "ProviderStats" ADD CONSTRAINT "ProviderStats_discordId_fkey" FOREIGN KEY ("discordId") REFERENCES "User"("discordId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("discordId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "User"("discordId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Seed the booking sequence counter (no-op if it already exists)
INSERT INTO "BookingSequence" ("id", "lastNumber") VALUES (1, 0) ON CONFLICT ("id") DO NOTHING;
