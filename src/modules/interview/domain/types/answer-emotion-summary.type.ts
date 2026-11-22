export interface AnswerEmotionTimelinePoint {
  /** Giây tính từ đầu câu trả lời. */
  readonly t: number;
  readonly state: string;
  readonly gazeAway: boolean;
}

/**
 * Tóm tắt biểu cảm khuôn mặt do client tính khi nộp một câu trả lời (CR-005). Server không
 * tự phân tích hình ảnh, chỉ kiểm tra hình dạng rồi lưu vào cột `emotion_summary`.
 */
export interface AnswerEmotionSummary {
  readonly sampleIntervalMs: number;
  readonly sampleCount: number;
  /** Số mẫu có thấy khuôn mặt; không vượt `sampleCount`. */
  readonly validSampleCount: number;
  readonly distribution: Readonly<Record<string, number>>;
  readonly gazeAwayRatio: number;
  readonly dominant: string;
  readonly timeline: readonly AnswerEmotionTimelinePoint[];
}
