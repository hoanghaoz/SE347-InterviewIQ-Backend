import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { FeedbackCategoryCounts } from '../../domain/history-insight.rules';
import type {
  HistoryInsightContent,
  InsightSessionData,
} from '../../domain/repositories/history-insight.repo.interface';
import type { InterviewStatsDto } from '../dtos/interview-stats.response.dto';

export type HistoryInsightLlmPayload = {
  // Số liệu tính bằng code, cùng nguồn với biểu đồ dashboard: LLM chỉ diễn giải,
  // không tự tính lại.
  readonly stats: InterviewStatsDto;
  // Mới nhất trước.
  readonly sessions: readonly InsightSessionData[];
  readonly categoryCounts: FeedbackCategoryCounts;
};

export type HistoryInsightLlmResult = HistoryInsightContent & {
  readonly model: string;
  readonly promptVersion: string;
  readonly provider: string;
  readonly latencyMs: number;
};

export abstract class IHistoryInsightLlm {
  abstract generateInsight(
    payload: HistoryInsightLlmPayload,
  ): Promise<Result<HistoryInsightLlmResult, AppError>>;
}
