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

ALTER TABLE "interview_sessions"
    ADD CONSTRAINT "interview_sessions_cv_snapshot_object"
    CHECK (jsonb_typeof("cv_snapshot") = 'object');
