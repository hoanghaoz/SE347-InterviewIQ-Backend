-- AlterTable
ALTER TABLE "cheat_logs" ADD COLUMN "client_event_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "cheat_logs_session_id_client_event_id_key" ON "cheat_logs"("session_id", "client_event_id");
