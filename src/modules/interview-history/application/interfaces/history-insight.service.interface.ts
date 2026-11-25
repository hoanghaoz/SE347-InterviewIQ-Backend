import type { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import { HistoryInsightStateDto } from '../dtos/history-insight.response.dto';

// userPublicId luôn là `sub` của access token.
export abstract class IHistoryInsightService {
  // Chỉ đọc bản đã lưu, không bao giờ gọi LLM.
  abstract getInsightAsync(
    userPublicId: string,
  ): Promise<Result<HistoryInsightStateDto, AppError>>;

  // Trả lại bản cũ khi lịch sử không đổi; chỉ gọi LLM khi có buổi mới.
  abstract generateInsightAsync(
    userPublicId: string,
  ): Promise<Result<HistoryInsightStateDto, AppError>>;
}
