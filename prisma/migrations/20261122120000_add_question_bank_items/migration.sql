-- CreateTable
CREATE TABLE "question_bank_items" (
    "id" SERIAL NOT NULL,
    "public_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "domain" "question_domain" NOT NULL,
    "difficulty" "question_difficulty" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "question_bank_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_items_public_id_key" ON "question_bank_items"("public_id");

-- CreateIndex
CREATE INDEX "question_bank_items_user_id_domain_difficulty_idx" ON "question_bank_items"("user_id", "domain", "difficulty");

-- CreateIndex
CREATE INDEX "question_bank_items_user_id_created_at_idx" ON "question_bank_items"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "question_bank_items_user_id_content_hash_key" ON "question_bank_items"("user_id", "content_hash");

-- AddForeignKey
ALTER TABLE "question_bank_items" ADD CONSTRAINT "question_bank_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check constraint: cùng giới hạn 500 ký tự với nội dung câu hỏi sinh ra (questions)
ALTER TABLE question_bank_items ADD CONSTRAINT question_bank_items_content_length CHECK (char_length(content) BETWEEN 1 AND 500);
