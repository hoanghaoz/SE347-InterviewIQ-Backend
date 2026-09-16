-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "parse_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('CREATED', 'IN_PROGRESS', 'SUBMITTED', 'SCORING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "question_domain" AS ENUM ('TECHNICAL', 'BEHAVIORAL', 'SITUATIONAL');

-- CreateEnum
CREATE TYPE "question_difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "cheat_event_type" AS ENUM ('TAB_SWITCH', 'WINDOW_BLUR', 'FACE_MISSING', 'MULTIPLE_FACES');

-- CreateTable
CREATE TABLE "answers" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "question_id" INTEGER NOT NULL,
    "transcript" TEXT,
    "video_url" VARCHAR(500),
    "duration_seconds" INTEGER,
    "emotion_summary" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cheat_logs" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "session_id" INTEGER NOT NULL,
    "event_type" "cheat_event_type" NOT NULL,
    "description" VARCHAR(500),
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cheat_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cvs" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" VARCHAR(500) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "raw_text" TEXT,
    "parsed_data" JSONB,
    "parse_status" "parse_status" NOT NULL DEFAULT 'PENDING',
    "parser_version" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cvs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "cv_id" INTEGER,
    "title" VARCHAR(255) NOT NULL,
    "job_description" TEXT,
    "status" "session_status" NOT NULL DEFAULT 'CREATED',
    "total_questions" INTEGER NOT NULL DEFAULT 5,
    "duration_seconds" INTEGER,
    "started_at" TIMESTAMPTZ,
    "submitted_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_summaries" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "session_id" INTEGER NOT NULL,
    "overall_feedback" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "scoring_model" VARCHAR(100) NOT NULL,
    "prompt_version" VARCHAR(50),
    "generated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "session_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,
    "domain" "question_domain" NOT NULL,
    "difficulty" "question_difficulty" NOT NULL DEFAULT 'MEDIUM',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "session_id" INTEGER NOT NULL,
    "content_score" DOUBLE PRECISION NOT NULL,
    "relevance_score" DOUBLE PRECISION NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "scored_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "avatar_url" VARCHAR(500),
    "role" "user_role" NOT NULL DEFAULT 'USER',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "answers_public_id_key" ON "answers"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "answers_question_id_key" ON "answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "cheat_logs_public_id_key" ON "cheat_logs"("public_id");

-- CreateIndex
CREATE INDEX "cheat_logs_session_id_idx" ON "cheat_logs"("session_id");

-- CreateIndex
CREATE INDEX "cheat_logs_event_type_idx" ON "cheat_logs"("event_type");

-- CreateIndex
CREATE INDEX "cheat_logs_occurred_at_idx" ON "cheat_logs"("occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "cvs_public_id_key" ON "cvs"("public_id");

-- CreateIndex
CREATE INDEX "cvs_user_id_idx" ON "cvs"("user_id");

-- CreateIndex
CREATE INDEX "cvs_parse_status_idx" ON "cvs"("parse_status");

-- CreateIndex
CREATE INDEX "cvs_user_id_is_active_idx" ON "cvs"("user_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "interview_sessions_public_id_key" ON "interview_sessions"("public_id");

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_idx" ON "interview_sessions"("user_id");

-- CreateIndex
CREATE INDEX "interview_sessions_cv_id_idx" ON "interview_sessions"("cv_id");

-- CreateIndex
CREATE INDEX "interview_sessions_status_idx" ON "interview_sessions"("status");

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_status_idx" ON "interview_sessions"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interview_summaries_public_id_key" ON "interview_summaries"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_summaries_session_id_key" ON "interview_summaries"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_public_id_key" ON "questions"("public_id");

-- CreateIndex
CREATE INDEX "questions_session_id_idx" ON "questions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_session_id_order_index_key" ON "questions"("session_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "scores_public_id_key" ON "scores"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "scores_session_id_key" ON "scores"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_public_id_key" ON "users"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_public_id_key" ON "refresh_tokens"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheat_logs" ADD CONSTRAINT "cheat_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_cv_id_fkey" FOREIGN KEY ("cv_id") REFERENCES "cvs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_summaries" ADD CONSTRAINT "interview_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
