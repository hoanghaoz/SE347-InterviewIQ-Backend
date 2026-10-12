import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import {
  CreateInterviewRequestDto,
  SubmitInterviewSessionRequestDto,
} from '../dtos/interview.request.dto';

export abstract class IInterviewService {
  abstract createInterviewSessionAsync(
    userPublicId: string,
    request: CreateInterviewRequestDto,
  ): Promise<Result<string, AppError>>;

  abstract submitInterviewSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: SubmitInterviewSessionRequestDto,
  ): Promise<Result<undefined, AppError>>;
}
