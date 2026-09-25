-- Keep the CV content used by each interview even if the source CV changes.
ALTER TABLE "interview_sessions" ADD COLUMN "cv_snapshot" JSONB;

-- Existing sessions can only be reconstructed from the CV currently on record.
UPDATE "interview_sessions" AS session
SET "cv_snapshot" = jsonb_build_object(
    'sourceCvPublicId', cv."public_id",
    'fileName', cv."file_name",
    'fileUrl', cv."file_url",
    'fileSize', cv."file_size",
    'rawText', cv."raw_text",
    'parsedData', cv."parsed_data",
    'parserVersion', cv."parser_version"
)
FROM "cvs" AS cv
WHERE session."cv_id" = cv."id";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "interview_sessions" WHERE "cv_snapshot" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill cv_snapshot: an interview session has no source CV. Restore its CV before applying this migration.';
    END IF;
END
$$;

ALTER TABLE "interview_sessions" ALTER COLUMN "cv_snapshot" SET NOT NULL;
ALTER TABLE "interview_sessions"
    ADD CONSTRAINT "interview_sessions_cv_snapshot_object"
    CHECK (jsonb_typeof("cv_snapshot") = 'object');
