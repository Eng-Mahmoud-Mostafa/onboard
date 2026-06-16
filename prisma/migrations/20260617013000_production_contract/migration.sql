-- Extend activity actions used by the production CRM workflow.
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'LEAD_DELETED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'BOOKING_EDITED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'BOOKING_CANCELLED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'TASK_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PACKAGE_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'FILE_UPLOADED';

-- Add server-side session persistence table for production deployments that want DB-backed sessions.
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "unlockedProfileId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_userId_fkey') THEN
    ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Add fields that align existing models with the requested CRM contract.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "interestedDestination" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "travelersCount" INTEGER;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "convertedClientId" TEXT;
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "convertedBookingId" TEXT;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "assignedProfileId" TEXT;
CREATE INDEX IF NOT EXISTS "Client_email_idx" ON "Client"("email");
CREATE INDEX IF NOT EXISTS "Client_assignedProfileId_idx" ON "Client"("assignedProfileId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_assignedProfileId_fkey') THEN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_assignedProfileId_fkey" FOREIGN KEY ("assignedProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "packageNameSnapshot" TEXT;
ALTER TABLE "Booking" ALTER COLUMN "packageId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "Booking_travelDate_idx" ON "Booking"("travelDate");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_packageId_fkey') THEN
    ALTER TABLE "Booking" DROP CONSTRAINT "Booking_packageId_fkey";
  END IF;
  ALTER TABLE "Booking" ADD CONSTRAINT "Booking_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "Profile_name_idx" ON "Profile"("name");
CREATE INDEX IF NOT EXISTS "Profile_isAdmin_idx" ON "Profile"("isAdmin");
CREATE INDEX IF NOT EXISTS "Package_status_idx" ON "Package"("status");
CREATE INDEX IF NOT EXISTS "Package_destination_idx" ON "Package"("destination");
CREATE INDEX IF NOT EXISTS "Task_dueDate_idx" ON "Task"("dueDate");
CREATE INDEX IF NOT EXISTS "ActivityLog_message_idx" ON "ActivityLog"("message");

-- Store Supabase Storage metadata in PostgreSQL.
CREATE TABLE IF NOT EXISTS "UploadedFile" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "relatedBookingId" TEXT,
    "relatedClientId" TEXT,
    "uploadedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UploadedFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UploadedFile_relatedBookingId_idx" ON "UploadedFile"("relatedBookingId");
CREATE INDEX IF NOT EXISTS "UploadedFile_relatedClientId_idx" ON "UploadedFile"("relatedClientId");
CREATE INDEX IF NOT EXISTS "UploadedFile_uploadedByProfileId_idx" ON "UploadedFile"("uploadedByProfileId");
CREATE INDEX IF NOT EXISTS "UploadedFile_createdAt_idx" ON "UploadedFile"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UploadedFile_relatedBookingId_fkey') THEN
    ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_relatedBookingId_fkey" FOREIGN KEY ("relatedBookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UploadedFile_relatedClientId_fkey') THEN
    ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_relatedClientId_fkey" FOREIGN KEY ("relatedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UploadedFile_uploadedByProfileId_fkey') THEN
    ALTER TABLE "UploadedFile" ADD CONSTRAINT "UploadedFile_uploadedByProfileId_fkey" FOREIGN KEY ("uploadedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
