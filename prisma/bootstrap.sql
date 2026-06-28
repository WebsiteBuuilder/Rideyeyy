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

DO $$ BEGIN
  CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'VERIFIED', 'REWARDED', 'FAKE', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "InviteFakeReason" AS ENUM ('ALT_ACCOUNT', 'LEFT_EARLY', 'SELF_INVITE', 'PREVIOUS_MEMBER', 'BOT', 'BAN_EVASION', 'RATE_LIMIT', 'MANUAL', 'CAP');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "InviteRewardType" AS ENUM ('INVITE', 'MILESTONE', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RedemptionSource" AS ENUM ('SHOP', 'MILESTONE', 'LOTTERY', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "RedemptionStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'VOID');
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

CREATE TABLE IF NOT EXISTS "Panel" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Panel_pkey" PRIMARY KEY ("id")
);

-- Invite Reward System tables
CREATE TABLE IF NOT EXISTS "InviteConfig" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "rewardAmount" INTEGER NOT NULL DEFAULT 30,
    "verificationDelaySec" INTEGER NOT NULL DEFAULT 600,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 7,
    "dailyCap" INTEGER NOT NULL DEFAULT 0,
    "weeklyCap" INTEGER NOT NULL DEFAULT 0,
    "monthlyCap" INTEGER NOT NULL DEFAULT 0,
    "maxRewardsPerInviter" INTEGER NOT NULL DEFAULT 0,
    "antiAltEnabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardEnabled" BOOLEAN NOT NULL DEFAULT true,
    "milestonesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "loggingChannelId" TEXT,
    "announceChannelId" TEXT,
    "autoAnnounce" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteCode" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "inviterId" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "isVanity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteJoin" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "invitedUserId" TEXT NOT NULL,
    "inviterUserId" TEXT,
    "inviteCode" TEXT,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "fakeReason" "InviteFakeReason",
    "accountCreatedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifyAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "rewarded" BOOLEAN NOT NULL DEFAULT false,
    "rewardAmount" INTEGER,
    "rewardTxnRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteJoin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteUserStats" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" INTEGER NOT NULL DEFAULT 0,
    "fake" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "lifetime" INTEGER NOT NULL DEFAULT 0,
    "rcEarned" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "milestonesCompleted" INTEGER NOT NULL DEFAULT 0,
    "lastInviteAt" TIMESTAMP(3),
    "streak" INTEGER NOT NULL DEFAULT 0,
    "weeklyCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteUserStats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteReward" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "joinId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "InviteRewardType" NOT NULL DEFAULT 'INVITE',
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteReward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteMilestone" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "rewardAmount" INTEGER NOT NULL DEFAULT 0,
    "rewardRoleId" TEXT,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteMilestone_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteMilestoneAward" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteMilestoneAward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteLog" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "inviteCode" TEXT,
    "joinId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "InviteResetHistory" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InviteResetHistory_pkey" PRIMARY KEY ("id")
);

-- Referral Economy Expansion tables
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

-- Additive column migrations (idempotent)
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "preferredName" TEXT;
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
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "bookingsOpen" BOOLEAN NOT NULL DEFAULT true;

-- Rewards wallet expansion
ALTER TYPE "RedemptionStatus" ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TABLE "Redemption" ALTER COLUMN "code" DROP NOT NULL;
ALTER TABLE "Redemption" ADD COLUMN IF NOT EXISTS "bookingId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Redemption_bookingId_key" ON "Redemption"("bookingId");
CREATE INDEX IF NOT EXISTS "Redemption_bookingId_idx" ON "Redemption"("bookingId");
ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "redemptionId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_redemptionId_key" ON "Booking"("redemptionId");
ALTER TABLE "ShopItem" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "InviteJoin" ADD COLUMN IF NOT EXISTS "verifyAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InviteJoin" ADD COLUMN IF NOT EXISTS "screenerVerifiedAt" TIMESTAMP(3);
ALTER TABLE "InviteJoin" ADD COLUMN IF NOT EXISTS "firstOrderBonusPaid" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InviteMilestone" ADD COLUMN IF NOT EXISTS "rewardRideKey" TEXT;
ALTER TABLE "InviteMilestone" ADD COLUMN IF NOT EXISTS "rewardTickets" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "MemberVerification" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviterUserId" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberVerification_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX IF NOT EXISTS "Panel_key_key" ON "Panel"("key");
CREATE INDEX IF NOT EXISTS "Panel_key_idx" ON "Panel"("key");

CREATE UNIQUE INDEX IF NOT EXISTS "InviteConfig_guildId_key" ON "InviteConfig"("guildId");
CREATE INDEX IF NOT EXISTS "InviteConfig_guildId_idx" ON "InviteConfig"("guildId");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteCode_guildId_code_key" ON "InviteCode"("guildId", "code");
CREATE INDEX IF NOT EXISTS "InviteCode_guildId_idx" ON "InviteCode"("guildId");
CREATE INDEX IF NOT EXISTS "InviteCode_inviterId_idx" ON "InviteCode"("inviterId");
CREATE INDEX IF NOT EXISTS "InviteJoin_guildId_inviterUserId_idx" ON "InviteJoin"("guildId", "inviterUserId");
CREATE INDEX IF NOT EXISTS "InviteJoin_guildId_invitedUserId_idx" ON "InviteJoin"("guildId", "invitedUserId");
CREATE INDEX IF NOT EXISTS "InviteJoin_guildId_status_idx" ON "InviteJoin"("guildId", "status");
CREATE INDEX IF NOT EXISTS "InviteJoin_guildId_verifyAt_idx" ON "InviteJoin"("guildId", "verifyAt");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteUserStats_guildId_userId_key" ON "InviteUserStats"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "InviteUserStats_guildId_verified_idx" ON "InviteUserStats"("guildId", "verified");
CREATE INDEX IF NOT EXISTS "InviteReward_guildId_inviterUserId_idx" ON "InviteReward"("guildId", "inviterUserId");
CREATE INDEX IF NOT EXISTS "InviteReward_guildId_type_idx" ON "InviteReward"("guildId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteMilestone_guildId_threshold_key" ON "InviteMilestone"("guildId", "threshold");
CREATE INDEX IF NOT EXISTS "InviteMilestone_guildId_idx" ON "InviteMilestone"("guildId");
CREATE UNIQUE INDEX IF NOT EXISTS "InviteMilestoneAward_guildId_userId_milestoneId_key" ON "InviteMilestoneAward"("guildId", "userId", "milestoneId");
CREATE INDEX IF NOT EXISTS "InviteMilestoneAward_guildId_userId_idx" ON "InviteMilestoneAward"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "InviteLog_guildId_createdAt_idx" ON "InviteLog"("guildId", "createdAt");
CREATE INDEX IF NOT EXISTS "InviteLog_guildId_event_idx" ON "InviteLog"("guildId", "event");
CREATE INDEX IF NOT EXISTS "InviteResetHistory_guildId_idx" ON "InviteResetHistory"("guildId");

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
CREATE UNIQUE INDEX IF NOT EXISTS "MemberVerification_guildId_userId_key" ON "MemberVerification"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "MemberVerification_guildId_idx" ON "MemberVerification"("guildId");

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

-- Sync default shop prices (idempotent)
UPDATE "ShopItem" SET "priceRc" = 2000 WHERE "key" = 'RIDE_FREE_20';

-- Invite verify reward: 30 RC per screener-verified invite (not first-order bonus)
UPDATE "InviteConfig" SET "rewardAmount" = 30;
