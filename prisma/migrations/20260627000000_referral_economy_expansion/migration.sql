-- Referral Economy Expansion
-- Record-keeping mirror of the additive DDL applied via prisma/bootstrap.sql.
-- Idempotent so it is safe to apply against an already-bootstrapped database.

DO $$ BEGIN
  CREATE TYPE "RedemptionSource" AS ENUM ('SHOP', 'MILESTONE', 'LOTTERY', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RedemptionStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'VOID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Redemption" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardKey" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" "RedemptionSource" NOT NULL DEFAULT 'SHOP',
    "status" "RedemptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "costRc" DECIMAL(18,2),
    "redeemedBy" TEXT,
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ShopItem" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceRc" INTEGER NOT NULL,
    "rewardKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LotteryTicket" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tickets" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LotteryTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LotteryDraw" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "winnerUserId" TEXT,
    "totalTickets" INTEGER NOT NULL DEFAULT 0,
    "participants" INTEGER NOT NULL DEFAULT 0,
    "prizeKey" TEXT NOT NULL,
    "redemptionCode" TEXT,
    "drawnAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LotteryDraw_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ScheduleState" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteActivity" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteActivity_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "minMessages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "maxVerifyAttempts" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "lotteryEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "shopEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "weeklyResetEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "monthlyResetEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "ticketsPerDaily" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "ticketsPerInvite" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "ticketsPerRide" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "ticketsPerEvent" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "lotteryPrizeKey" TEXT NOT NULL DEFAULT 'RIDE_FREE_20';
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "lotteryChannelId" TEXT;
ALTER TABLE "InviteJoin" ADD COLUMN IF NOT EXISTS "verifyAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InviteMilestone" ADD COLUMN IF NOT EXISTS "rewardRideKey" TEXT;
ALTER TABLE "InviteMilestone" ADD COLUMN IF NOT EXISTS "rewardTickets" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS "Redemption_code_key" ON "Redemption"("code");
CREATE INDEX IF NOT EXISTS "Redemption_guildId_userId_idx" ON "Redemption"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "Redemption_guildId_status_idx" ON "Redemption"("guildId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "ShopItem_guildId_key_key" ON "ShopItem"("guildId", "key");
CREATE INDEX IF NOT EXISTS "ShopItem_guildId_idx" ON "ShopItem"("guildId");
CREATE UNIQUE INDEX IF NOT EXISTS "LotteryTicket_guildId_userId_key" ON "LotteryTicket"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "LotteryTicket_guildId_idx" ON "LotteryTicket"("guildId");
CREATE INDEX IF NOT EXISTS "LotteryDraw_guildId_drawnAt_idx" ON "LotteryDraw"("guildId", "drawnAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleState_guildId_key_key" ON "ScheduleState"("guildId", "key");
CREATE INDEX IF NOT EXISTS "ScheduleState_guildId_idx" ON "ScheduleState"("guildId");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteActivity_guildId_userId_key" ON "InviteActivity"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "InviteActivity_guildId_idx" ON "InviteActivity"("guildId");
