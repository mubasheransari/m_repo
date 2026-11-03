-- CreateEnum
CREATE TYPE "QuizInviteStatus" AS ENUM ('PENDING', 'COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "themeKey" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "quizInviteId" TEXT;

-- CreateTable
CREATE TABLE "QuizInvite" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "quizVersion" INTEGER NOT NULL DEFAULT 1,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "QuizInviteStatus" NOT NULL DEFAULT 'PENDING',
    "senderAnswers" JSONB NOT NULL,
    "recipientAnswers" JSONB,
    "score" INTEGER,
    "breakdown" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "QuizInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationPref" (
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "themeKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationPref_pkey" PRIMARY KEY ("userId","conversationId")
);

-- CreateIndex
CREATE INDEX "QuizInvite_senderId_createdAt_idx" ON "QuizInvite"("senderId", "createdAt");
CREATE INDEX "QuizInvite_recipientId_status_idx" ON "QuizInvite"("recipientId", "status");
CREATE INDEX "QuizInvite_conversationId_createdAt_idx" ON "QuizInvite"("conversationId", "createdAt");
CREATE INDEX "Message_quizInviteId_idx" ON "Message"("quizInviteId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_quizInviteId_fkey" FOREIGN KEY ("quizInviteId") REFERENCES "QuizInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuizInvite" ADD CONSTRAINT "QuizInvite_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizInvite" ADD CONSTRAINT "QuizInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuizInvite" ADD CONSTRAINT "QuizInvite_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationPref" ADD CONSTRAINT "ConversationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationPref" ADD CONSTRAINT "ConversationPref_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
