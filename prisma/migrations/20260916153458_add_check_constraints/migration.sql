ALTER TABLE cvs ADD CONSTRAINT cvs_file_size_positive CHECK (file_size > 0);

ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_total_questions_positive CHECK (total_questions > 0);

ALTER TABLE interview_sessions ADD CONSTRAINT interview_sessions_duration_non_negative CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE answers ADD CONSTRAINT answers_duration_non_negative CHECK (duration_seconds IS NULL OR duration_seconds >= 0);

ALTER TABLE scores ADD CONSTRAINT scores_range_check CHECK (
  content_score BETWEEN 0 AND 10
  AND relevance_score BETWEEN 0 AND 10
  AND confidence_score BETWEEN 0 AND 10
  AND overall_score BETWEEN 0 AND 10
);
