-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PhotoVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "nonce" TEXT NOT NULL,
    "gesture" TEXT NOT NULL,
    "selfieFile" TEXT NOT NULL,
    "matchScore" DOUBLE PRECISION,
    "reason" TEXT,
    "engine" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhotoVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhotoVerification_nonce_key" ON "PhotoVerification"("nonce");

-- CreateIndex
CREATE INDEX "PhotoVerification_userId_createdAt_idx" ON "PhotoVerification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PhotoVerification_status_createdAt_idx" ON "PhotoVerification"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PhotoVerification" ADD CONSTRAINT "PhotoVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
