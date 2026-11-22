import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { PageResult } from '../../../../shared/common/pagination';
import type { SessionQuestionsResponseDto } from '../../../question-generation/application/dtos/question.response.dto';
import type {
  QuestionBankQueryDto,
  SaveQuestionBankRequestDto,
  UseBankQuestionsRequestDto,
} from '../dtos/question-bank.request.dto';
import type {
  QuestionBankItemDto,
  SaveQuestionBankResponseDto,
} from '../dtos/question-bank.response.dto';

export abstract class IQuestionBankService {
  abstract listAsync(
    userPublicId: string,
    query: QuestionBankQueryDto,
  ): Promise<Result<PageResult<QuestionBankItemDto>, AppError>>;

  abstract saveFromSessionAsync(
    userPublicId: string,
    request: SaveQuestionBankRequestDto,
  ): Promise<Result<SaveQuestionBankResponseDto, AppError>>;

  abstract deleteAsync(
    userPublicId: string,
    itemPublicId: string,
  ): Promise<Result<void, AppError>>;

  abstract useInSessionAsync(
    userPublicId: string,
    sessionPublicId: string,
    request: UseBankQuestionsRequestDto,
  ): Promise<Result<SessionQuestionsResponseDto, AppError>>;
}
