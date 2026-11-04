import type { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import { PageResult } from '../../../../shared/common/pagination';
import { InterviewHistoryQueryDto } from '../dtos/interview-history.request.dto';
import {
  InterviewHistoryDetailDto,
  InterviewHistoryItemDto,
} from '../dtos/interview-history.response.dto';

// userPublicId luôn là `sub` của access token: không endpoint nào nhận user id
// từ client.
export abstract class IInterviewHistoryService {
  abstract getInterviewHistoryAsync(
    userPublicId: string,
    query: InterviewHistoryQueryDto,
  ): Promise<Result<PageResult<InterviewHistoryItemDto>, AppError>>;

  abstract getInterviewAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<InterviewHistoryDetailDto, AppError>>;
}
