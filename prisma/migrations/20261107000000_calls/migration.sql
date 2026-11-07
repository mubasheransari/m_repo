-- Voice / video calls (Agora): one row per call.
-- Idempotent on purpose: safe to paste into the Neon SQL editor, and safe to run after `prisma db push` already created it.
-- Identical in effect to src/prisma/ensure-call-schema.ts, which applies it automatically at start-up.

DO $$ BEGIN
  CREATE TYPE "CallType" AS ENUM ('VOICE', 'VIDEO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED', 'DECLINED', 'MISSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Call" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "callerId" TEXT NOT NULL,
  "calleeId" TEXT NOT NULL,
  "type" "CallType" NOT NULL,
  "status" "CallStatus" NOT NULL DEFAULT 'RINGING',
  "channelName" TEXT NOT NULL,
  "endReason" TEXT,
  "endedById" TEXT,
  "maxSeconds" INTEGER,
  "ringExpiresAt" TIMESTAMP(3) NOT NULL,
  "answeredAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "durationSeconds" INTEGER NOT NULL DEFAULT 0,
  "callerSeenAt" TIMESTAMP(3),
  "calleeSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Call_channelName_key" ON "Call"("channelName");

CREATE INDEX IF NOT EXISTS "Call_callerId_createdAt_idx" ON "Call"("callerId", "createdAt");

CREATE INDEX IF NOT EXISTS "Call_callerId_status_idx" ON "Call"("callerId", "status");

CREATE INDEX IF NOT EXISTS "Call_calleeId_status_idx" ON "Call"("calleeId", "status");

CREATE INDEX IF NOT EXISTS "Call_callerId_type_answeredAt_idx" ON "Call"("callerId", "type", "answeredAt");

CREATE INDEX IF NOT EXISTS "Call_calleeId_type_answeredAt_idx" ON "Call"("calleeId", "type", "answeredAt");

CREATE INDEX IF NOT EXISTS "Call_conversationId_createdAt_idx" ON "Call"("conversationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Call" ADD CONSTRAINT "Call_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Call" ADD CONSTRAINT "Call_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Call" ADD CONSTRAINT "Call_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
