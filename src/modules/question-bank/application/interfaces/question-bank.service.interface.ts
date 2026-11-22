import type { Result } from 'neverthrow';
import type { AppError } from '../../../../shared/common/errorCode';
import type { PageResult } from '../../../../shared/common/pagination';
import type { QuestionBankQueryDto } from '../dtos/question-bank.request.dto';
import type { QuestionBankItemDto } from '../dtos/question-bank.response.dto';

export abstract class IQuestionBankService {
  abstract listAsync(
    userPublicId: string,
    query: QuestionBankQueryDto,
  ): Promise<Result<PageResult<QuestionBankItemDto>, AppError>>;
}
