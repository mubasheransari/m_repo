import { Logger } from '@nestjs/common';

/**
 * Creates the voice / video call table if the database does not have it yet (same idea as ensure-schema.ts for notifications).
 * Every statement is idempotent and only ever ADDS: existing tables and data are never touched. It is also the exact SQL of
 * prisma/migrations/20261107000000_calls/migration.sql (keep them identical). Turn it off with AUTO_SCHEMA_FIX=false.
 */
export const CALL_SCHEMA_STATEMENTS: string[] = [
  `DO $$ BEGIN
     CREATE TYPE "CallType" AS ENUM ('VOICE', 'VIDEO');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'ACTIVE', 'ENDED', 'DECLINED', 'MISSED', 'CANCELLED');
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `CREATE TABLE IF NOT EXISTS "Call" (
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
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Call_channelName_key" ON "Call"("channelName")`,
  `CREATE INDEX IF NOT EXISTS "Call_callerId_createdAt_idx" ON "Call"("callerId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "Call_callerId_status_idx" ON "Call"("callerId", "status")`,
  `CREATE INDEX IF NOT EXISTS "Call_calleeId_status_idx" ON "Call"("calleeId", "status")`,
  `CREATE INDEX IF NOT EXISTS "Call_callerId_type_answeredAt_idx" ON "Call"("callerId", "type", "answeredAt")`,
  `CREATE INDEX IF NOT EXISTS "Call_calleeId_type_answeredAt_idx" ON "Call"("calleeId", "type", "answeredAt")`,
  `CREATE INDEX IF NOT EXISTS "Call_conversationId_createdAt_idx" ON "Call"("conversationId", "createdAt")`,
  `DO $$ BEGIN
     ALTER TABLE "Call" ADD CONSTRAINT "Call_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "Call" ADD CONSTRAINT "Call_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
     ALTER TABLE "Call" ADD CONSTRAINT "Call_calleeId_fkey" FOREIGN KEY ("calleeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
   EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

type Executor = { $executeRawUnsafe(query: string): Promise<unknown>; $queryRawUnsafe<T = unknown>(query: string): Promise<T> };

/** Runs on startup. Never throws: if the database user may not create tables, it logs the fix and the app still starts. */
export async function ensureCallSchema(db: Executor): Promise<void> {
  const log = new Logger('Schema');
  if (process.env.AUTO_SCHEMA_FIX === 'false') return;
  try {
    const found = await db.$queryRawUnsafe<{ c: string | null }[]>(`SELECT to_regclass('"Call"')::text AS c`);
    if (found[0]?.c) return; // already there
    log.warn('The Call table is missing: creating it now (idempotent, existing data is untouched).');
    for (const statement of CALL_SCHEMA_STATEMENTS) await db.$executeRawUnsafe(statement);
    log.log('The Call table is ready.');
  } catch (e: any) {
    log.error(
      `Could not create the Call table automatically (${e?.message ?? e}). ` +
        'Run `npx prisma db push` with the direct Neon connection string, or paste ' +
        'prisma/migrations/20261107000000_calls/migration.sql into the Neon SQL editor.',
    );
  }
}
