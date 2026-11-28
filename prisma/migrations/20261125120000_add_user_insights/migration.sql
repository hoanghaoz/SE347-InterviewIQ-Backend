-- CreateTable
CREATE TABLE "user_insights" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "overall_feedback" TEXT NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "based_on_session_count" INTEGER NOT NULL,
    "last_session_completed_at" TIMESTAMPTZ,
    "llm_model" VARCHAR(100) NOT NULL,
    "prompt_version" VARCHAR(50) NOT NULL,
    "generated_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_insights_public_id_key" ON "user_insights"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_insights_user_id_key" ON "user_insights"("user_id");

-- AddForeignKey
ALTER TABLE "user_insights" ADD CONSTRAINT "user_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Check constraint: số buổi làm căn cứ không bao giờ âm
ALTER TABLE user_insights ADD CONSTRAINT user_insights_based_on_session_count_non_negative CHECK (based_on_session_count >= 0);
