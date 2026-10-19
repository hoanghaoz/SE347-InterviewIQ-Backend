import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { SaveInterviewAnswerRequestDto } from '../dtos/interview-answer.request.dto';
import type {
  InterviewAnswerResponseDto,
  InterviewVideoSignedParamsResponseDto,
} from '../dtos/interview-answer.response.dto';

export abstract class IInterviewAnswerService {
  abstract createSignedParamsAsync(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
  ): Promise<Result<InterviewVideoSignedParamsResponseDto, AppError>>;

  abstract saveAnswerAsync(
    userPublicId: string,
    sessionPublicId: string,
    questionPublicId: string,
    request: SaveInterviewAnswerRequestDto,
  ): Promise<Result<InterviewAnswerResponseDto, AppError>>;
}
