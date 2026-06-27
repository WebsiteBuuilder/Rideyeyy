-- Member Verify Screener + Invite Reward Overhaul
-- Idempotent mirror of prisma/bootstrap.sql additive DDL.

ALTER TABLE "InviteJoin" ADD COLUMN IF NOT EXISTS "screenerVerifiedAt" TIMESTAMP(3);
ALTER TABLE "InviteJoin" ADD COLUMN IF NOT EXISTS "firstOrderBonusPaid" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "MemberVerification" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviterUserId" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MemberVerification_guildId_userId_key" ON "MemberVerification"("guildId", "userId");
CREATE INDEX IF NOT EXISTS "MemberVerification_guildId_idx" ON "MemberVerification"("guildId");
