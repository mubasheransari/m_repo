-- Notifications inbox + profile visit counter.
-- Idempotent on purpose: safe to paste into the Neon SQL editor, and safe to run after `prisma db push` already created these.

DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('PROFILE_VISIT', 'LIKE', 'MATCH', 'MESSAGE', 'MESSAGE_REQUEST', 'DIRECT_MESSAGE', 'REQUEST_ACCEPTED', 'QUIZ');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "actorId"     TEXT,
  "type"        "NotificationType" NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "data"        JSONB,
  "groupKey"    TEXT,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProfileVisit" (
  "id"        TEXT NOT NULL,
  "viewerId"  TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_lastEventAt_idx" ON "Notification"("userId", "readAt", "lastEventAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_lastEventAt_idx" ON "Notification"("userId", "lastEventAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_groupKey_readAt_idx" ON "Notification"("userId", "groupKey", "readAt");
CREATE INDEX IF NOT EXISTS "ProfileVisit_profileId_createdAt_idx" ON "ProfileVisit"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProfileVisit_viewerId_profileId_createdAt_idx" ON "ProfileVisit"("viewerId", "profileId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
