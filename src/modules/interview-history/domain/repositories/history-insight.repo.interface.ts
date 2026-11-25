import type { Result } from 'neverthrow';
import type {
  ImprovementItem,
  StrengthItem,
} from '../../../scoring/domain/entities/scoring-job.entity';
import type { InterviewStatsScores } from './interview-stats.repo.interface';

export type InsightFeedbackItem = {
  readonly category: string;
  readonly title: string;
  readonly description: string;
};

export type InsightRecommendation = {
  readonly title: string;
  readonly description: string;
};

// Phần nội dung do LLM sinh ra, đã qua validator.
export type HistoryInsightContent = {
  readonly overallFeedback: string;
  readonly strengths: readonly InsightFeedbackItem[];
  readonly weaknesses: readonly InsightFeedbackItem[];
  readonly recommendations: readonly InsightRecommendation[];
};

// "Dấu vân tay" của lịch sử: số buổi COMPLETED và mốc hoàn thành mới nhất.
// Khác với lúc tạo nhận xét nghĩa là nhận xét đã cũ.
export type HistoryFingerprint = {
  readonly completedSessions: number;
  readonly lastCompletedAt: Date | null;
};

export type HistoryInsightData = HistoryInsightContent & {
  readonly basedOnSessionCount: number;
  readonly lastSessionCompletedAt: Date | null;
  readonly generatedAt: Date;
};

export type NewHistoryInsight = HistoryInsightData & {
  readonly llmModel: string;
  readonly promptVersion: string;
};

// Một buổi COMPLETED kèm nhận xét đã lưu, nguyên liệu cho prompt.
export type InsightSessionData = InterviewStatsScores & {
  // Để khớp với các buổi trong số liệu thống kê (vd. buổi liền trước có phải
  // buổi bỏ trống không); không bao giờ được đưa vào prompt.
  readonly sessionPublicId: string;
  readonly title: string;
  readonly createdAt: Date;
  // Buổi bỏ trống bị chấm 0 theo luật: nhận xét là câu viết sẵn, không phản ánh
  // năng lực nên không được đếm vào tần suất category.
  readonly isRuleBased: boolean;
  readonly strengths: readonly StrengthItem[];
  readonly improvements: readonly ImprovementItem[];
};

export abstract class IHistoryInsightRepository {
  abstract getHistoryFingerprint(
    userPublicId: string,
  ): Promise<Result<HistoryFingerprint, Error>>;

  // Mới nhất trước, tối đa limit buổi COMPLETED.
  abstract getInsightSessions(
    userPublicId: string,
    limit: number,
  ): Promise<Result<InsightSessionData[], Error>>;

  abstract findInsight(
    userPublicId: string,
  ): Promise<Result<HistoryInsightData | null, Error>>;

  // Ghi đè bản cũ (1:1 với user). ok(null) khi user không còn tồn tại.
  abstract saveInsight(
    userPublicId: string,
    insight: NewHistoryInsight,
  ): Promise<Result<HistoryInsightData | null, Error>>;
}
