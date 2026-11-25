import type { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import { InterviewStatsQueryDto } from '../dtos/interview-stats.request.dto';
import { InterviewStatsDto } from '../dtos/interview-stats.response.dto';

// userPublicId luôn là `sub` của access token: thống kê chỉ tính trên các buổi
// của chính người gọi.
export abstract class IInterviewStatsService {
  abstract getInterviewStatsAsync(
    userPublicId: string,
    query: InterviewStatsQueryDto,
  ): Promise<Result<InterviewStatsDto, AppError>>;
}
