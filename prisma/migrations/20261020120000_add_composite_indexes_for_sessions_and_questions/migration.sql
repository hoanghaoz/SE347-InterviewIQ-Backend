-- CreateIndex
CREATE INDEX "interview_sessions_user_id_created_at_idx" ON "interview_sessions"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "questions_session_id_order_index_idx" ON "questions"("session_id", "order_index" ASC);
