ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'COMPANY_CREATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'COMPANY_UPDATED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'COMPANY_ARCHIVED';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyType') THEN
    CREATE TYPE "CompanyType" AS ENUM ('TRAVEL_AGENCY', 'CORPORATE', 'HOTEL', 'PARTNER', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CompanyStatus') THEN
    CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CompanyType" NOT NULL DEFAULT 'TRAVEL_AGENCY',
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactPerson" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "commissionPercent" DECIMAL(5,2),
    "notes" TEXT,
    "assignedProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Company_name_idx" ON "Company"("name");
CREATE INDEX IF NOT EXISTS "Company_type_idx" ON "Company"("type");
CREATE INDEX IF NOT EXISTS "Company_status_idx" ON "Company"("status");
CREATE INDEX IF NOT EXISTS "Company_assignedProfileId_idx" ON "Company"("assignedProfileId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Company_assignedProfileId_fkey') THEN
    ALTER TABLE "Company" ADD CONSTRAINT "Company_assignedProfileId_fkey" FOREIGN KEY ("assignedProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
CREATE INDEX IF NOT EXISTS "Client_companyId_idx" ON "Client"("companyId");

ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
CREATE INDEX IF NOT EXISTS "Booking_companyId_idx" ON "Booking"("companyId");

ALTER TABLE "ActivityLog" ADD COLUMN IF NOT EXISTS "companyId" TEXT;
CREATE INDEX IF NOT EXISTS "ActivityLog_companyId_idx" ON "ActivityLog"("companyId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_companyId_fkey') THEN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Booking_companyId_fkey') THEN
    ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ActivityLog_companyId_fkey') THEN
    ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
