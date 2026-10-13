import { Result } from 'neverthrow';
import { AppError } from '../../../../shared/common/errorCode';
import {
  CreateInterviewRequestDto,
  SubmitInterviewSessionRequestDto,
} from '../dtos/interview.request.dto';
import {
  InterviewSessionResponse,
  StartInterviewSessionResponseDto,
  SubmitInterviewSessionResponseDto,
} from '../dtos/interview.response.dto';
import {
  PageResult,
  PaginationRequest,
} from '../../../../shared/common/pagination';

export abstract class IInterviewService {
  abstract createInterviewSessionAsync(
    userPublicId: string,
    request: CreateInterviewRequestDto,
  ): Promise<Result<string, AppError>>;

  abstract submitInterviewSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: SubmitInterviewSessionRequestDto,
  ): Promise<Result<SubmitInterviewSessionResponseDto, AppError>>;

  abstract getInterviewSessionAsync(
    userPublicId: string,
    pagination: PaginationRequest,
  ): Promise<Result<PageResult<InterviewSessionResponse>, AppError>>;

  abstract startInterviewSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<StartInterviewSessionResponseDto, AppError>>;
}
