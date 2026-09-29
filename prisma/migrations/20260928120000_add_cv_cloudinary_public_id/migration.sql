-- Adds the Cloudinary public_id of each CV file (needed to delete/replace the file later).
-- Written in 3 steps so it also runs on databases that already contain CVs.

-- 1. Add the column as nullable first.
ALTER TABLE "cvs" ADD COLUMN "cloudinary_public_id" VARCHAR(255);

-- 2. Backfill existing rows with a unique placeholder (they were not uploaded through Cloudinary).
UPDATE "cvs" SET "cloudinary_public_id" = 'legacy/' || "public_id"::text WHERE "cloudinary_public_id" IS NULL;

-- 3. Enforce NOT NULL + UNIQUE, matching prisma/schema/cv.prisma.
ALTER TABLE "cvs" ALTER COLUMN "cloudinary_public_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "cvs_cloudinary_public_id_key" ON "cvs"("cloudinary_public_id");
