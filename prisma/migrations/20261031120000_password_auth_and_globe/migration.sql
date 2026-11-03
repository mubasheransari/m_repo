-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT,
ADD COLUMN     "passwordHash" TEXT;

-- AlterTable
ALTER TABLE "PrivacySettings" ADD COLUMN     "showOnGlobe" BOOLEAN NOT NULL DEFAULT false;
