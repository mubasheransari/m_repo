-- AlterEnum
ALTER TYPE "ConversationOrigin" ADD VALUE 'DIRECT';

-- AlterTable
ALTER TABLE "PrivacySettings" ADD COLUMN     "allowDirectMessages" BOOLEAN NOT NULL DEFAULT false;
