import { Logger } from '@nestjs/common';

/**
 * Creates the notification tables if the database does not have them yet.
 *
 * Why: a deploy that ships new code before `prisma db push` was run against the database (easy to forget on Neon) made every
 * /notifications call answer "Internal server error". Every statement here is idempotent (IF NOT EXISTS / guarded), so running
 * it on a database that is already up to date changes nothing. It never alters or drops existing tables.
 * Keep it identical in effect to prisma/migrations/20261104000000_notifications_and_visits/migration.sql.
 * Turn it off with AUTO_SCHEMA_FIX=false once you manage the schema yourself.
 */
export const NOTIFICATION_SCHEMA_STATEMENTS: string[] = [
  `DO $$ BEGIN
     CREATE TYPE "NotificationType" AS ENUM ('PROFILE_VISIT', 'LIKE', 'MATCH', 'MESSAGE', 'MESSAGE_REQUEST', 'DIRECT_MESSAGE', 'REQUEST_ACCEPTED', 'QUIZ');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "Notification" (
     "id" TEXT NOT NULL,
     "userId" TEXT NOT NULL,
     "actorId" TEXT,
     "type" "NotificationType" NOT NULL,
     "title" TEXT NOT NULL,
     "body" TEXT NOT NULL,
     "data" JSONB,
     "groupKey" TEXT,
     "readAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE TABLE IF NOT EXISTS "ProfileVisit" (
     "id" TEXT NOT NULL,
     "viewerId" TEXT NOT NULL,
     "profileId" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
   )`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_lastEventAt_idx" ON "Notification"("userId", "readAt", "lastEventAt")`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_lastEventAt_idx" ON "Notification"("userId", "lastEventAt")`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_groupKey_readAt_idx" ON "Notification"("userId", "groupKey", "readAt")`,
  `CREATE INDEX IF NOT EXISTS "ProfileVisit_profileId_createdAt_idx" ON "ProfileVisit"("profileId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ProfileVisit_viewerId_profileId_createdAt_idx" ON "ProfileVisit"("viewerId", "profileId", "createdAt")`,
  `DO $$ BEGIN
     ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "ProfileVisit" ADD CONSTRAINT "ProfileVisit_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

type Executor = { $executeRawUnsafe(query: string): Promise<unknown>; $queryRawUnsafe<T = unknown>(query: string): Promise<T> };

/** Runs on startup. Never throws: if the database user may not create tables, it logs the exact fix and the app still starts. */
export async function ensureNotificationSchema(db: Executor): Promise<void> {
  const log = new Logger('Schema');
  if (process.env.AUTO_SCHEMA_FIX === 'false') return;
  try {
    const found = await db.$queryRawUnsafe<{ n: string | null; v: string | null }[]>(
      `SELECT to_regclass('"Notification"')::text AS n, to_regclass('"ProfileVisit"')::text AS v`,
    );
    if (found[0]?.n && found[0]?.v) return; // already there: nothing to do
    log.warn('Notification tables are missing: creating them now (idempotent, existing data is untouched).');
    for (const statement of NOTIFICATION_SCHEMA_STATEMENTS) await db.$executeRawUnsafe(statement);
    log.log('Notification tables are ready.');
  } catch (e: any) {
    log.error(
      `Could not create the notification tables automatically (${e?.message ?? e}). ` +
        'Run `npx prisma db push` with the direct Neon connection string, or paste ' +
        'prisma/migrations/20261104000000_notifications_and_visits/migration.sql into the Neon SQL editor.',
    );
  }
}
