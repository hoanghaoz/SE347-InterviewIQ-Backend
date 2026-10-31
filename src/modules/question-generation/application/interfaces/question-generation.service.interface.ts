import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { GenerateQuestionsRequestDto } from '../dtos/generate-questions.request.dto';
import type { SessionQuestionsResponseDto } from '../dtos/question.response.dto';

export abstract class IQuestionGenerationService {
  abstract generateQuestionsAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: GenerateQuestionsRequestDto,
  ): Promise<Result<SessionQuestionsResponseDto, AppError>>;

  abstract getQuestionsAsync(
    userPublicId: string,
    sessionPublicId: string,
  ): Promise<Result<SessionQuestionsResponseDto, AppError>>;
}
