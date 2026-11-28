export const HISTORY_INSIGHT_LIMITS = {
  // Một buổi thì nhận xét tổng hợp chỉ chép lại summary của buổi đó.
  minCompletedSessions: 2,
  // Số buổi gần nhất có chi tiết nhận xét trong prompt. Số trung bình và xu
  // hướng vẫn tính trên mọi buổi.
  maxSessionsInPrompt: 20,
  maxFeedbackCharsPerSession: 1_200,
  maxItems: 5,
  maxOverallFeedbackChars: 3_000,
  maxItemTitleChars: 200,
  maxItemDescriptionChars: 1_000,
  // Chỉ đếm những lần thật sự gọi LLM: lấy lại bản cũ không tốn lượt.
  maxGenerationsPerWindow: 5,
  generationWindowSeconds: 3_600,
} as const;
