import { Result } from 'neverthrow';
import { AppError } from 'src/shared/common/errorCode';
import { CreateInterviewRequestDto } from '../dtos/interview.request.dto';

export abstract class IInterviewService {
  abstract createInterviewSessionAsync(
    userPublicId: string,
    request: CreateInterviewRequestDto,
  ): Promise<Result<string, AppError>>;
}
