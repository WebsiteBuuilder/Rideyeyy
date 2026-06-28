-- Add bookings open/close flag for staff operations
ALTER TABLE "InviteConfig" ADD COLUMN IF NOT EXISTS "bookingsOpen" BOOLEAN NOT NULL DEFAULT true;
