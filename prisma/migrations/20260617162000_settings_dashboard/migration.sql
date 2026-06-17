ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'SETTINGS_UPDATED';

CREATE TABLE IF NOT EXISTS "AppSetting" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "category" TEXT NOT NULL,
  "isSecret" BOOLEAN NOT NULL DEFAULT false,
  "updatedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AppSetting_key_key" ON "AppSetting"("key");
CREATE INDEX IF NOT EXISTS "AppSetting_category_idx" ON "AppSetting"("category");
CREATE INDEX IF NOT EXISTS "AppSetting_updatedByProfileId_idx" ON "AppSetting"("updatedByProfileId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AppSetting_updatedByProfileId_fkey') THEN
    ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedByProfileId_fkey" FOREIGN KEY ("updatedByProfileId") REFERENCES "Profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
