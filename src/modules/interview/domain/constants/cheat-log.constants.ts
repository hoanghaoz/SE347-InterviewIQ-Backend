// Log đến trễ (gửi sau khi đã nộp bài) chỉ được nhận trong khoảng này tính từ submittedAt.
export const CHEAT_LOG_LATE_WINDOW_MS = 5 * 60_000;

// occurredAt là giờ phía client, còn startedAt/submittedAt là giờ server: cho lệch
// chừng này ở hai biên để đồng hồ client hơi sai không làm mất log.
export const CHEAT_LOG_CLOCK_SKEW_MS = 30_000;

export const MAX_CHEAT_LOG_DESCRIPTION_LENGTH = 500;
